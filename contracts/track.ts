/**
 * A track is an ordered list of segments. Corners carry a radius, straights
 * carry a length, and that is the whole geometry the lap model reads.
 *
 * Segment lists are produced offline by tools/import-track and committed as
 * JSON fixtures. They are never fetched at runtime: OpenStreetMap changes
 * under you, and a lap record must not move because someone edited a map.
 */

export type Segment =
  | { kind: "straight"; len: number }
  | { kind: "corner"; len: number; r: number };

/** Where the geometry came from. Affects how much to trust the radii. */
export type TrackSource = "osm" | "traced" | "authored";

/**
 * A point on the circuit's plan view, in metres from the start/finish line.
 * X is east, Y is north -- maths orientation, not screen orientation, so the
 * stored shape is a map rather than a path that happens to render.
 */
export type Point = [x: number, y: number];

export interface TrackSpec {
  id: string;
  name: string;
  /** ISO country code, for the flag on the card. */
  country: string;
  /** The official figure. This is what the UI displays, always. */
  publishedM: number;
  /** What the assembled geometry actually measures, before scaling. */
  lengthM: number;
  source: TrackSource;
  note: string;
  corners: number;
  longestStraightM: number;
  segments: Segment[];
  /**
   * The circuit's shape, as the closed polyline the import traced.
   *
   * Kept ALONGSIDE `segments` rather than derived from it, because the two
   * answer different questions and only one of them is recoverable from the
   * other. `segments` is what the lap model reads: how tight a corner is and
   * how long. It deliberately drops which WAY each corner goes, since a 36 m
   * radius costs the same left or right.
   *
   * A map needs those directions back, and they cannot be inferred. Solving
   * for "the signs that bring the walk back to its start" is badly
   * underdetermined -- 1,866 different sign combinations close Galvez No. 6 to
   * within 6% of its own length, and nothing distinguishes the right one. It
   * would not be enough even if it were: the import merges corner complexes
   * into single arcs, so Monza's Rettifilo chicane is stored as one 190 degree
   * sweep where the real pair nets near zero, and the sweeps total 865 degrees
   * where a closed lap turns 360.
   *
   * So the shape is stored, not solved. The last point does not repeat the
   * first; the loop closes implicitly.
   */
  outline: Point[];
}

/** Race regulations. Phase 1 uses only laps and compound. */
export interface Regulation {
  laps: number;
  /** Pit stop time loss, seconds. */
  pitLossS: number;
}
