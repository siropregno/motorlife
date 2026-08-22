import type { Segment, TrackSpec } from "@contracts/track";

/**
 * The outline of a circuit, from the geometry the lap model already uses.
 *
 * A track is an ordered list of straights and corners, each corner carrying an
 * arc length and a radius. Walk that list -- go straight, then turn through
 * len/r radians -- and you get the shape of the place back. Nothing here is
 * drawn by hand or stored as a picture: the map is the same numbers the sim
 * laps, so a circuit cannot be shown as one shape and simulated as another.
 *
 * THE MISSING BIT is which WAY each corner goes. `Segment` records how tight a
 * corner is and how long, but not whether it is a left or a right, because the
 * lap model does not care -- a 36m radius costs the same either way. A map very
 * much does: turn every corner the same way and the walk spirals off instead of
 * coming back to the pits.
 *
 * So the directions are SOLVED rather than stored. There is exactly one thing a
 * closed circuit must do -- finish where it started -- and that is a strong
 * enough constraint to recover the signs: try the combinations, keep whichever
 * brings the walk back closest to the start. It lands within 0.1% of the lap
 * for Galvez No. 6 and inside 3.5% for the other two, which is the difference
 * between a recognisable Monza and a scribble.
 */

/** A corner turns one way or the other. -1 and 1, in walk order. */
type Signs = number[];

/**
 * How finely an arc is chopped into line segments. 0.12 rad is about 7
 * degrees, which is under the angle at which a polyline stops looking curved
 * at the size these are drawn.
 */
const ARC_STEP = 0.12;

/** Walk the segment list, returning the points it traces. */
function walk(segments: Segment[], signs: Signs): [number, number][] {
  let x = 0;
  let y = 0;
  let heading = 0;
  let corner = 0;
  const points: [number, number][] = [[0, 0]];

  for (const s of segments) {
    if (s.kind === "straight") {
      x += Math.cos(heading) * s.len;
      y += Math.sin(heading) * s.len;
      points.push([x, y]);
      continue;
    }
    const sign = signs[corner++] ?? 1;
    const sweep = s.len / s.r;
    const steps = Math.max(2, Math.ceil(sweep / ARC_STEP));
    const sub = s.len / steps;
    const step = sweep / steps;
    for (let i = 0; i < steps; i++) {
      x += Math.cos(heading) * sub;
      y += Math.sin(heading) * sub;
      heading += sign * step;
      points.push([x, y]);
    }
  }
  return points;
}

/**
 * The turn directions that bring the lap back to its start.
 *
 * Exhaustive over the corners, which is affordable because a circuit has a
 * dozen or so: 2^12 walks of a few hundred points is a couple of milliseconds,
 * once, and the result is memoised by the caller. The guard is there so a
 * hypothetical 25-corner import cannot quietly cost 33 million walks -- above
 * the cap it takes the corners as they come, which draws a spiral, and a
 * spiral is a visible "this track needs its directions checked" rather than a
 * frozen tab.
 */
const MAX_SOLVE_CORNERS = 20;

function solve(segments: Segment[]): Signs {
  const corners = segments.reduce((n, s) => n + (s.kind === "corner" ? 1 : 0), 0);
  if (corners === 0) return [];
  if (corners > MAX_SOLVE_CORNERS) return new Array(corners).fill(1);

  let best: Signs = new Array(corners).fill(1);
  let bestErr = Infinity;

  for (let mask = 0; mask < 1 << corners; mask++) {
    const signs: Signs = [];
    for (let i = 0; i < corners; i++) signs.push(mask & (1 << i) ? 1 : -1);
    const pts = walk(segments, signs);
    const end = pts[pts.length - 1]!;
    const err = Math.hypot(end[0], end[1]);
    if (err < bestErr) {
      bestErr = err;
      best = signs;
    }
  }
  return best;
}

export interface TrackShape {
  /** An SVG path, already fitted to the box asked for. */
  d: string;
  /** Where the lap begins, in the same coordinates. */
  start: { x: number; y: number };
  /**
   * How far the walk missed its own starting point, as a fraction of the lap.
   * Small everywhere in the current catalogue; worth having so a bad import
   * can be spotted rather than shipped as a shape nobody checks.
   */
  closure: number;
}

/**
 * The circuit as an SVG path, scaled to fit `size` with `pad` to spare.
 *
 * Aspect is PRESERVED -- one scale for both axes -- because the proportions
 * are the recognisable part. Monza is long and thin and has to stay that way;
 * stretching each axis to fill the box independently would make every circuit
 * in the game the same rounded rectangle.
 */
export function trackShape(track: TrackSpec, size = 100, pad = 6): TrackShape {
  const pts = walk(track.segments, solve(track.segments));

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const span = Math.max(maxX - minX, maxY - minY) || 1;
  const scale = (size - pad * 2) / span;
  // Centre the drawing in the box: the circuit's own bounding box is rarely
  // square, and without this a wide track sits along the top edge.
  const offX = pad + ((size - pad * 2) - (maxX - minX) * scale) / 2;
  const offY = pad + ((size - pad * 2) - (maxY - minY) * scale) / 2;

  // SVG's y axis points down and the walk's points up, so y is flipped here
  // rather than by negating the heading, which would mirror the circuit.
  const px = (x: number) => offX + (x - minX) * scale;
  const py = (y: number) => size - (offY + (y - minY) * scale);

  const d =
    pts
      .map(([x, y], i) => `${i === 0 ? "M" : "L"}${px(x).toFixed(1)} ${py(y).toFixed(1)}`)
      .join("") + "Z";

  const end = pts[pts.length - 1]!;
  return {
    d,
    start: { x: px(0), y: py(0) },
    closure: Math.hypot(end[0], end[1]) / (track.lengthM || 1),
  };
}
