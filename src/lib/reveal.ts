import { useEffect, useRef, type RefObject } from "react";

/**
 * How far into the box a card has to come before it counts as arrived.
 *
 * Negative on the bottom edge, so the reveal fires a little BEFORE the card
 * reaches the fold rather than exactly on it. Without the margin a card
 * starts its 200ms fade at the moment its first pixel appears, which means
 * you watch it fade in -- the point is to find it already there.
 */
const MARGIN = "0px 0px -40px 0px";

/** A hair over nothing. A card counts as arrived as soon as it is at all in. */
const THRESHOLD = 0.01;

/** The class the stylesheet is waiting for. */
const SHOWN = "shown";

/**
 * What `wireReveal` needs from the outside world, handed in rather than read
 * off `window`.
 *
 * Both of these are the reason this function exists apart from the hook: they
 * are the two branches that decide whether anything animates at all, and they
 * are exactly the branches worth testing. Reading them from globals inside the
 * function would make the tests stub `window`, which is a worse test of a
 * simpler thing.
 */
interface Wiring {
  /** prefers-reduced-motion. True means reveal everything now and animate nothing. */
  calm: boolean;
  /** undefined on a browser too old to have it. */
  IO: typeof IntersectionObserver | undefined;
}

/**
 * Reveal the matching descendants of `root` as they scroll into it.
 *
 * Returns the teardown.
 *
 * FAILS VISIBLE, on every path. No IntersectionObserver, reduced motion, an
 * empty container -- each one marks everything shown rather than leaving it at
 * opacity 0. This is the whole risk of the effect and it is worth being blunt
 * about: the stylesheet's resting state for a card is INVISIBLE, and anything
 * that stops this function from running to completion leaves a shop with no
 * cars in it. A card that never fades is a missing animation; a card that
 * never appears is a missing car.
 */
export function wireReveal(
  root: HTMLElement,
  selector: string,
  { calm, IO }: Wiring,
): () => void {
  const items = [...root.querySelectorAll<HTMLElement>(selector)];
  const show = (el: Element) => el.classList.add(SHOWN);

  /*
   * Both bail-outs go the same way: mark everything, stop, and do it without
   * an observer.
   *
   * Reduced motion is a request for no movement, not for a list that appears
   * one card at a time -- and a browser with no IntersectionObserver has no
   * way to ever call the callback, so anything left unmarked stays at opacity
   * 0 for good.
   */
  if (calm || !IO) {
    for (const el of items) show(el);
    return () => {};
  }

  const io = new IO(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        show(e.target);
        /*
         * Once revealed, forgotten.
         *
         * Re-hiding on the way back up would turn a list into a flicker, and
         * it is not what "render the cards as you go down" means -- you go
         * down past a card once, and after that it is simply a card you have
         * seen. Unobserving is also what keeps a long shop cheap: the observer
         * ends up watching only what is still below you.
         */
        io.unobserve(e.target);
      }
    },
    { root, rootMargin: MARGIN, threshold: THRESHOLD },
  );

  for (const el of items) io.observe(el);
  return () => io.disconnect();
}

/**
 * Reveal children as they scroll into their own scroll box.
 *
 * Returns a ref for the SCROLL CONTAINER, not for the items. Which container
 * is not a detail here: nothing in this app scrolls the viewport. The document
 * is `overflow: hidden` (tokens.css) and each screen owns a .screen-body that
 * scrolls inside a fixed frame (see the .frame and .stage comments in
 * app.css). An observer left to default to the viewport would find every card
 * intersecting on the first frame and reveal the entire shop at once -- the
 * effect would not break, it would silently do nothing, which is worse.
 *
 * `deps` is load-bearing rather than housekeeping. Filtering and sorting
 * rebuild the whole tree -- groups are keyed by their value, cards by their
 * id -- so after a filter change every node the old observer held is gone and
 * every node on screen has never been observed. Without re-running, a filter
 * leaves a shop of invisible cards. Pass whatever value changes when the list
 * does.
 */
export function useReveal(
  selector: string,
  deps: unknown[],
): RefObject<HTMLDivElement | null> {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = box.current;
    if (!root) return;
    return wireReveal(root, selector, {
      calm: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
      IO: typeof IntersectionObserver === "undefined" ? undefined : IntersectionObserver,
    });
    // `selector` is a literal at every call site and deliberately not a dep:
    // the caller says when the list changed, and that is what deps is for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return box;
}
