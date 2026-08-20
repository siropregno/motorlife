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
}

/** Race regulations. Phase 1 uses only laps and compound. */
export interface Regulation {
  laps: number;
  /** Pit stop time loss, seconds. */
  pitLossS: number;
}
