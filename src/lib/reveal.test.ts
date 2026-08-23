import { describe, expect, it, vi } from "vitest";
import { wireReveal } from "./reveal";

/*
 * These run in the plain node lane, with hand-built stand-ins for the three
 * DOM things wireReveal touches: querySelectorAll, classList.add, and the
 * observer. That is a deliberate choice over installing jsdom.
 *
 * The gate lane is meant to be free and under two seconds, and a DOM would be
 * a dependency and a second of startup bought for a function whose entire
 * surface is "which elements got a class, and what was the observer rooted
 * on". Everything here that genuinely needs a browser -- that the cards
 * actually fade, that scrolling reveals them -- is checked in tools/flows.mjs
 * against a real one.
 */

/** One .shop-item, as much of one as this function ever looks at. */
function fakeItem() {
  const classes = new Set<string>();
  return {
    classList: {
      add: (c: string) => void classes.add(c),
      contains: (c: string) => classes.has(c),
    },
    shown: () => classes.has("shown"),
  };
}

/** A container holding `n` items. */
function fakeRoot(n: number) {
  const items = Array.from({ length: n }, fakeItem);
  return {
    items,
    root: { querySelectorAll: () => items } as unknown as HTMLElement,
  };
}

/**
 * A stand-in for IntersectionObserver that hands back the callback and the
 * options, so a test can fire intersections itself and assert on the root.
 */
function fakeIO() {
  const spy = {
    observed: [] as unknown[],
    unobserved: [] as unknown[],
    disconnected: 0,
    options: undefined as IntersectionObserverInit | undefined,
    // Replaced by the real callback the moment the observer is constructed;
    // this is only here so the type is right before that happens.
    fire: (_entries: { target: unknown; isIntersecting: boolean }[]) => {},
  };
  const IO = vi.fn(function (
    cb: (entries: { target: unknown; isIntersecting: boolean }[]) => void,
    options: IntersectionObserverInit,
  ) {
    spy.options = options;
    spy.fire = cb;
    return {
      observe: (el: unknown) => void spy.observed.push(el),
      unobserve: (el: unknown) => void spy.unobserved.push(el),
      disconnect: () => void (spy.disconnected += 1),
    };
  });
  return { IO: IO as unknown as typeof IntersectionObserver, spy };
}

describe("wireReveal", () => {
  /*
   * The two bail-outs, and they are the most important tests in the file.
   *
   * The stylesheet's resting state for a card is INVISIBLE. So any path that
   * stops this function from wiring up an observer has to reveal everything
   * on its way out -- otherwise the failure is not "no animation", it is a
   * concesionaria with no cars in it and nothing on screen to explain why.
   */
  it("reveals everything when the browser has no IntersectionObserver", () => {
    const { items, root } = fakeRoot(4);
    wireReveal(root, ".shop-item", { calm: false, IO: undefined });
    expect(items.every((i) => i.shown())).toBe(true);
  });

  it("reveals everything when the reader asked for less motion", () => {
    const { items, root } = fakeRoot(4);
    const { IO, spy } = fakeIO();
    wireReveal(root, ".shop-item", { calm: true, IO });
    expect(items.every((i) => i.shown())).toBe(true);
    // and it does not bother observing anything it has already revealed
    expect(spy.observed).toHaveLength(0);
  });

  it("roots the observer on the container it was handed, never on the viewport", () => {
    const { root } = fakeRoot(2);
    const { IO, spy } = fakeIO();
    wireReveal(root, ".shop-item", { calm: false, IO });
    /*
     * The check that stops the effect from silently doing nothing. Nothing in
     * this app scrolls the viewport -- the document is overflow:hidden and each
     * screen scrolls inside itself -- so an observer left to default would find
     * every card intersecting on the first frame and reveal the whole shop at
     * once. It would look like a working feature and be a no-op.
     */
    expect(spy.options?.root).toBe(root);
  });

  it("reveals only the items that come into view", () => {
    const { items, root } = fakeRoot(4);
    const { IO, spy } = fakeIO();
    wireReveal(root, ".shop-item", { calm: false, IO });

    expect(items.some((i) => i.shown())).toBe(false);
    expect(spy.observed).toHaveLength(4);

    spy.fire([
      { target: items[0], isIntersecting: true },
      { target: items[1], isIntersecting: false },
    ]);

    expect(items[0]!.shown()).toBe(true);
    expect(items[1]!.shown()).toBe(false);
    expect(items[2]!.shown()).toBe(false);
  });

  it("stops watching an item once it is revealed, so scrolling back up cannot re-hide it", () => {
    const { items, root } = fakeRoot(2);
    const { IO, spy } = fakeIO();
    wireReveal(root, ".shop-item", { calm: false, IO });

    spy.fire([{ target: items[0], isIntersecting: true }]);
    expect(spy.unobserved).toEqual([items[0]]);

    // Even if a stale entry arrives saying it has left, it stays revealed:
    // you have seen that card, and a list that re-hides is a list that
    // flickers on the way back up.
    spy.fire([{ target: items[0], isIntersecting: false }]);
    expect(items[0]!.shown()).toBe(true);
  });

  it("hands back a teardown that disconnects", () => {
    const { root } = fakeRoot(3);
    const { IO, spy } = fakeIO();
    const off = wireReveal(root, ".shop-item", { calm: false, IO });
    off();
    expect(spy.disconnected).toBe(1);
  });

  it("survives a container with nothing in it", () => {
    const { root } = fakeRoot(0);
    const { IO } = fakeIO();
    expect(() => wireReveal(root, ".shop-item", { calm: false, IO })()).not.toThrow();
  });
});
