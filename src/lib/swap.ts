import { useCallback, useEffect, useRef, useState, type AnimationEvent } from "react";

/**
 * How long the outgoing half is kept mounted, as a safety net rather than as
 * the timing.
 *
 * The swap really ends on `animationend`, which is the honest signal: it fires
 * when the CSS has actually finished, so the stylesheet owns the duration and
 * nothing here has to be kept in step with it. This is only the backstop for
 * the cases where that event never arrives -- a backgrounded tab, an element
 * the browser declined to animate, prefers-reduced-motion cancelling the whole
 * thing. Generous on purpose: it should never be what ends a normal swap.
 *
 * App.tsx's screen slide predates this and still runs on a bare timer, which
 * is why SLIDE_MS there has to be hand-matched to --dur-travel by hand. This
 * is that mistake not repeated.
 */
const FUSE_MS = 1200;

export interface Swap<T> {
  /** What is on screen now, arriving. */
  now: T;
  /**
   * What is still on screen, leaving, wrapped in a box.
   *
   * The box is the whole reason this is not just `T | null`. The value being
   * swapped is very often ALLOWED to be null -- the workshop's top level is
   * `null` -- so a bare null could not tell "the row that is leaving is the
   * top level" apart from "nothing is leaving". Wrapping means the outer null
   * means exactly one thing: no swap is in flight.
   *
   * It carries its own copy of the old value rather than reading current
   * state, because by the time it is animating out the state has already moved
   * on -- that is the entire point of keeping it.
   */
  before: { value: T } | null;
  /** Change the value. Setting it to what it already is does nothing. */
  to: (next: T) => void;
  /**
   * Put on the LEAVING element's onAnimationEnd. This is what makes the
   * stylesheet the source of truth for the duration: retune the CSS and the
   * unmount follows, with no constant here to keep in step.
   */
  onLeft: (e: AnimationEvent) => void;
}

/**
 * Keep the outgoing value mounted while it animates away.
 *
 * The "hold the old one, render the new one, drop the old one when it
 * finishes" dance -- the same one App.tsx does by hand for the screen slide.
 * It is a hook because the workshop needed it too, and two hand-rolled copies
 * of a timer and a flag is how the second one ends up subtly different from
 * the first.
 *
 * It deliberately does NOT animate anything. It only guarantees both halves
 * are rendered at once for the length of the transition; which way each half
 * moves is a question for the stylesheet, which is where that answer belongs
 * and where it can differ per screen.
 */
export function useSwap<T>(initial: T): Swap<T> {
  const [now, setNow] = useState<T>(initial);
  const [before, setBefore] = useState<{ value: T } | null>(null);
  const fuse = useRef<ReturnType<typeof setTimeout> | null>(null);

  const settle = useCallback(() => {
    if (fuse.current) clearTimeout(fuse.current);
    fuse.current = null;
    setBefore(null);
  }, []);

  /*
   * A swap left running when the component goes away would fire setState into
   * nothing. Same reasoning as the cleanup App.tsx does for its slide.
   */
  useEffect(
    () => () => {
      if (fuse.current) clearTimeout(fuse.current);
    },
    [],
  );

  const to = useCallback((next: T) => {
    setNow((current) => {
      // Swapping a thing for itself is not a transition, and playing one would
      // make pressing the open row's own tile look like a state change that
      // never happened.
      if (Object.is(current, next)) return current;
      setBefore({ value: current });
      if (fuse.current) clearTimeout(fuse.current);
      // A swap already running is abandoned rather than queued: clicking three
      // tiles quickly should land on the third, not play three animations.
      fuse.current = setTimeout(() => {
        setBefore(null);
        fuse.current = null;
      }, FUSE_MS);
      return next;
    });
  }, []);

  const onLeft = useCallback(
    (e: AnimationEvent) => {
      // Only the element itself, never something inside it. A tile with its own
      // animation would otherwise end the whole row's exit early.
      if (e.target === e.currentTarget) settle();
    },
    [settle],
  );

  return { now, before, to, onLeft };
}
