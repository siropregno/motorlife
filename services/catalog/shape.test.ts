import { describe, expect, it } from "vitest";
import { TRACKS } from "./tracks";
import { trackShape } from "./shape";

/** The points of a rendered path, back out of the `d` string. */
function points(d: string): [number, number][] {
  return [...d.matchAll(/(-?\d+\.?\d*) (-?\d+\.?\d*)/g)].map((m) => [Number(m[1]), Number(m[2])]);
}

/** Do segments ab and cd cross, not counting shared endpoints? */
function crosses(
  a: [number, number],
  b: [number, number],
  c: [number, number],
  d: [number, number],
): boolean {
  const side = (o: [number, number], p: [number, number], q: [number, number]) =>
    (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  const d1 = side(c, d, a);
  const d2 = side(c, d, b);
  const d3 = side(a, b, c);
  const d4 = side(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** How many times the closed outline crosses itself. */
function selfCrossings(pts: [number, number][]): number {
  let n = 0;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 2; j < pts.length; j++) {
      // Adjacent edges share an endpoint, and so do the first and last.
      if (i === 0 && j === pts.length - 1) continue;
      const a = pts[i]!;
      const b = pts[(i + 1) % pts.length]!;
      const c = pts[j]!;
      const e = pts[(j + 1) % pts.length]!;
      if (crosses(a, b, c, e)) n++;
    }
  }
  return n;
}

/**
 * These check that the drawing is the circuit, not merely that it is a tidy
 * closed shape. The previous suite only asserted the latter and passed for
 * months on maps that were knots: every property below was true of a scribble.
 */
describe("trackShape", () => {
  /**
   * The assertion that would have caught the knots.
   *
   * Real circuits do not cross themselves. None of the three in the catalogue
   * has a flyover, so any crossing means the outline is wrong -- which is
   * exactly what the old solved-signs geometry produced: Monza came out as a
   * bowtie and Galvez No. 6 as a tangle of loops, both with closure well
   * inside the 5% the suite was checking.
   */
  it("draws circuits that do not cross themselves", () => {
    for (const t of TRACKS) {
      const n = selfCrossings(points(trackShape(t, 1000, 6).d));
      expect(n, `${t.name} crosses itself ${n} times`).toBe(0);
    }
  });

  /**
   * The outline and the segment list must describe the SAME circuit.
   *
   * They are stored separately -- one for the map, one for the lap model -- so
   * nothing structural stops them drifting apart. Walking the outline gives a
   * lap length that can be compared against the geometry the sim measures; if
   * someone re-imports one and not the other, this is what says so.
   */
  it("traces the same lap the sim measures", () => {
    for (const t of TRACKS) {
      let len = 0;
      for (let i = 0; i < t.outline.length; i++) {
        const [x1, y1] = t.outline[i]!;
        const [x2, y2] = t.outline[(i + 1) % t.outline.length]!;
        len += Math.hypot(x2 - x1, y2 - y1);
      }
      expect(len / t.lengthM, `${t.name} outline disagrees with its segments`).toBeCloseTo(1, 1);
    }
  });

  /** The lap begins and ends in the same place, because it is a lap. */
  it("stores a closed loop that does not repeat its first point", () => {
    for (const t of TRACKS) {
      const first = t.outline[0]!;
      const last = t.outline[t.outline.length - 1]!;
      const gap = Math.hypot(last[0] - first[0], last[1] - first[1]);
      expect(gap, `${t.name} repeats its first point`).toBeGreaterThan(1);
      // ...but the implied closing edge is a normal edge, not a leap across
      // the infield.
      expect(gap, `${t.name} does not close`).toBeLessThan(t.lengthM * 0.05);
    }
  });

  it("fits inside the box it is given, with the padding kept clear", () => {
    for (const t of TRACKS) {
      const pts = points(trackShape(t, 100, 6).d);
      expect(pts.length).toBeGreaterThan(10);
      for (const [x, y] of pts) {
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
   * rather than a guess about what any one circuit looks like.
   */
  it("scales both axes together, so proportions survive", () => {
    const ratio = (t: (typeof TRACKS)[number], size: number) => {
      const pts = points(trackShape(t, size, 6).d);
      const xs = pts.map((n) => n[0]);
      const ys = pts.map((n) => n[1]);
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
      const pts = points(trackShape(t, 100, 6).d);
      const xs = pts.map((n) => n[0]);
      const ys = pts.map((n) => n[1]);
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
