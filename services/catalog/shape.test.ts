import { describe, expect, it } from "vitest";
import { TRACKS } from "./tracks";
import { trackShape } from "./shape";

/**
 * The map is derived from the same geometry the sim laps, so these check that
 * the derivation is sound rather than that a picture looks nice.
 */
describe("trackShape", () => {
  /**
   * The one property that says the turn directions were recovered correctly.
   *
   * A closed circuit ends where it began. Walk it with every corner turning
   * the same way and Monza misses by 865 degrees of accumulated heading; with
   * the solved signs it comes back to within a few percent of its own length.
   * If this ever regresses, the maps are spirals.
   */
  it("closes every circuit in the catalogue", () => {
    for (const t of TRACKS) {
      const { closure } = trackShape(t);
      expect(closure, `${t.name} does not close`).toBeLessThan(0.05);
    }
  });

  it("fits inside the box it is given, with the padding kept clear", () => {
    for (const t of TRACKS) {
      const { d } = trackShape(t, 100, 6);
      const nums = [...d.matchAll(/(-?\d+\.?\d*) (-?\d+\.?\d*)/g)].map((m) => [
        Number(m[1]),
        Number(m[2]),
      ]);
      expect(nums.length).toBeGreaterThan(10);
      for (const [x, y] of nums) {
        expect(x, `${t.name} x out of box`).toBeGreaterThanOrEqual(5.9);
        expect(x, `${t.name} x out of box`).toBeLessThanOrEqual(94.1);
        expect(y, `${t.name} y out of box`).toBeGreaterThanOrEqual(5.9);
        expect(y, `${t.name} y out of box`).toBeLessThanOrEqual(94.1);
      }
    }
  });

  /*
   * Aspect ratio is the recognisable part, so the two axes must share ONE
   * scale. Stretching each to fill the box independently would flatten every
   * circuit into the same rounded rectangle and the map would stop carrying
   * information.
   *
   * Checked by rendering the same track into two boxes of different sizes and
   * comparing the width:height ratio, which is a fact about the projection
   * rather than a guess about what any one circuit looks like. (The first
   * version of this test asserted Monza came out "long and thin" -- it does
   * not: solved and rotated to its own axes its bounding box is nearly square,
   * and the test was measuring my expectation instead of the code.)
   */
  it("scales both axes together, so proportions survive", () => {
    const ratio = (t: (typeof TRACKS)[number], size: number) => {
      const nums = [...trackShape(t, size, 6).d.matchAll(/(-?\d+\.?\d*) (-?\d+\.?\d*)/g)].map(
        (m) => [Number(m[1]), Number(m[2])],
      );
      const xs = nums.map((n) => n[0]!);
      const ys = nums.map((n) => n[1]!);
      return (Math.max(...xs) - Math.min(...xs)) / (Math.max(...ys) - Math.min(...ys));
    };
    for (const t of TRACKS) {
      expect(ratio(t, 200), `${t.name} distorts when the box changes`).toBeCloseTo(
        ratio(t, 100),
        1,
      );
    }
  });

  /** The longer side fills the box; the shorter one is free to be shorter. */
  it("fills the box on its longest axis", () => {
    for (const t of TRACKS) {
      const nums = [...trackShape(t, 100, 6).d.matchAll(/(-?\d+\.?\d*) (-?\d+\.?\d*)/g)].map(
        (m) => [Number(m[1]), Number(m[2])],
      );
      const xs = nums.map((n) => n[0]!);
      const ys = nums.map((n) => n[1]!);
      const w = Math.max(...xs) - Math.min(...xs);
      const h = Math.max(...ys) - Math.min(...ys);
      expect(Math.max(w, h), `${t.name} does not fill its box`).toBeGreaterThan(85);
    }
  });

  it("is a closed path that starts where the lap starts", () => {
    for (const t of TRACKS) {
      const { d, start } = trackShape(t);
      expect(d.startsWith("M"), `${t.name} does not begin with a move`).toBe(true);
      expect(d.endsWith("Z"), `${t.name} is not closed`).toBe(true);
      const first = d.match(/^M(-?\d+\.?\d*) (-?\d+\.?\d*)/)!;
      expect(Number(first[1])).toBeCloseTo(start.x, 1);
      expect(Number(first[2])).toBeCloseTo(start.y, 1);
    }
  });

  /** Same track in, same path out -- the drawing must not wander per render. */
  it("is deterministic", () => {
    for (const t of TRACKS) {
      expect(trackShape(t).d).toBe(trackShape(t).d);
    }
  });
});
