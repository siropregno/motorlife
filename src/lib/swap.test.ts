import { describe, expect, it, vi } from "vitest";

/*
 * useSwap is a hook, and this project has no React test renderer -- so what is
 * tested here is the RULE the hook encodes, written out as the same reducer it
 * performs. The alternative was adding @testing-library/react and jsdom to the
 * gate lane to assert on three pieces of state.
 *
 * The parts that genuinely need a browser -- that both halves are mounted at
 * once, that the outgoing one unmounts on animationend -- are covered in
 * tools/flows.mjs by `swapped()` and the checks that count tiles after a swap.
 * What is left is the bookkeeping, and it has two edge cases that would each
 * ship a visible bug, so it is worth pinning.
 */

/** The transition useSwap performs, as a pure function of its state. */
function swap<T>(
  state: { now: T; before: { value: T } | null },
  next: T,
): { now: T; before: { value: T } | null } {
  // Swapping a thing for itself is not a transition.
  if (Object.is(state.now, next)) return state;
  return { now: next, before: { value: state.now } };
}

describe("the swap rule", () => {
  it("keeps the old value so it can be drawn leaving", () => {
    const s = swap({ now: "top", before: null }, "gearbox");
    expect(s.now).toBe("gearbox");
    expect(s.before).toEqual({ value: "top" });
  });

  /*
   * The bug this pins cost a debugging pass. `null` is a REAL state here -- it
   * is the workshop's top level -- so `before: null` cannot also mean "nothing
   * is leaving". With a bare `T | null` the very first swap, top level into a
   * part, sets before to null and the leaving row never renders at all: the
   * old tiles vanish instantly and only the arrival animates.
   */
  it("tells 'the top level is leaving' apart from 'nothing is leaving'", () => {
    const idle = { now: null as string | null, before: null };
    expect(idle.before).toBeNull();

    const leaving = swap(idle, "gearbox");
    // Wrapped, so the value inside can legitimately be null...
    expect(leaving.before).not.toBeNull();
    expect(leaving.before?.value).toBeNull();
    // ...which is exactly the case a bare null would have lost.
  });

  it("does nothing when asked for the value it already has", () => {
    const before = { now: "paint" as string | null, before: null };
    expect(swap(before, "paint")).toBe(before);
  });

  it("abandons a swap already running rather than queueing it", () => {
    // Three clicks in quick succession land on the third, and the row drawn
    // leaving is the one that was actually on screen when the last click
    // happened -- not the first of the three.
    let s = swap({ now: "top" as string | null, before: null }, "turbo");
    s = swap(s, "exhaust");
    s = swap(s, "gearbox");
    expect(s.now).toBe("gearbox");
    expect(s.before).toEqual({ value: "exhaust" });
  });
});

describe("the fuse", () => {
  /*
   * The timer is a BACKSTOP, not the timing. The swap ends on animationend so
   * the stylesheet owns the duration; this only catches the cases where that
   * event never arrives -- a backgrounded tab, reduced motion cancelling the
   * animation outright.
   *
   * It matters that it is generous. Set near the real duration it would race
   * animationend and cut a swap short on a slow frame, which is the failure
   * that looks like a flicker and is almost impossible to reproduce.
   */
  it("is long enough that it never ends a normal swap", async () => {
    const { default: fs } = await import("node:fs");
    const src = fs.readFileSync(new URL("./swap.ts", import.meta.url), "utf8");
    const fuse = Number(/FUSE_MS = (\d+)/.exec(src)?.[1]);
    expect(fuse).toBeGreaterThan(1000);
  });

  it("only the element's own animation ends the swap, not a child's", () => {
    // A tile animating inside the leaving row must not end the row's exit.
    const clear = vi.fn();
    const onLeft = (e: { target: unknown; currentTarget: unknown }) => {
      if (e.target === e.currentTarget) clear();
    };
    const row = { id: "row" };
    const tile = { id: "tile" };

    onLeft({ target: tile, currentTarget: row });
    expect(clear).not.toHaveBeenCalled();

    onLeft({ target: row, currentTarget: row });
    expect(clear).toHaveBeenCalledOnce();
  });
});
