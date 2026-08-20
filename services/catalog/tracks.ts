import type { TrackSpec } from "@contracts/track";
import monza from "./tracks/monza.json" with { type: "json" };
import galvez6 from "./tracks/galvez-6.json" with { type: "json" };
import galvez12 from "./tracks/galvez-12.json" with { type: "json" };

/**
 * Track geometry is committed as fixtures, never fetched at runtime.
 * OpenStreetMap changes under you, and a lap record must not move because
 * somebody edited a map.
 *
 * Provenance per track is in each file's `note`. Monza and Galvez No. 6 came
 * out of OSM; Galvez No. 12 is a hand trace, because the outer perimeter at
 * Galvez is not mapped.
 */
export const TRACKS: TrackSpec[] = [
  monza as TrackSpec,
  galvez6 as TrackSpec,
  galvez12 as TrackSpec,
];

export function trackById(id: string): TrackSpec | undefined {
  return TRACKS.find((t) => t.id === id);
}
