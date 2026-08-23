import type { Point, TrackSpec } from "@contracts/track";

/**
 * The outline of a circuit, projected into a box.
 *
 * The shape itself is not computed here. It is `track.outline`: the closed
 * polyline the import traced, in metres from the start/finish line. All this
 * module does is fit that polyline to the box the caller asks for.
 *
 * It used to reconstruct the shape by walking `segments` and guessing which way
 * each corner went, keeping whichever guess came back closest to the start.
 * That was wrong in a way the tests could not see. Closure is far too weak a
 * constraint -- 1,866 sign combinations close Galvez No. 6 to within 6% -- so
 * the pick was arbitrary and the maps came out as knots. See the note on
 * `outline` in the contract for why no stronger constraint rescues it either.
 */

export interface TrackShape {
  /** An SVG path, already fitted to the box asked for. */
  d: string;
  /** Where the lap begins, in the same coordinates. */
  start: { x: number; y: number };
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
  const pts: Point[] = track.outline;

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

  // The outline is stored north-up and SVG's y axis points down, so y is
  // flipped here -- once, in the only place that knows about screens.
  const px = (x: number) => offX + (x - minX) * scale;
  const py = (y: number) => size - (offY + (y - minY) * scale);

  const d =
    pts
      .map(([x, y], i) => `${i === 0 ? "M" : "L"}${px(x).toFixed(1)} ${py(y).toFixed(1)}`)
      .join("") + "Z";

  const [startX, startY] = pts[0]!;
  return { d, start: { x: px(startX), y: py(startY) } };
}
