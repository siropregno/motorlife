import type { CarSpec } from "@contracts/car";
import type { TrackSpec } from "@contracts/track";
import { derive } from "@sim/derive";
import { classIndex, classOf, type ClassLetter } from "@sim/rating";
import { TRACKS } from "./tracks";

/**
 * The reference set the class index is measured against. FROZEN. Adding a
 * circuit here re-rates every car in the game, so new tracks go in TRACKS and
 * stay out of this list.
 *
 * packages/sim never imports the catalogue -- it takes the tracks as an
 * argument -- so the reference set is chosen here rather than in the engine.
 */
export const REFERENCE_TRACK_IDS = ["monza", "galvez-6", "galvez-12"] as const;

const referenceTracks: TrackSpec[] = TRACKS.filter((t) =>
  (REFERENCE_TRACK_IDS as readonly string[]).includes(t.id),
);

const cache = new Map<string, { index: number; letter: ClassLetter }>();

export function ratingOf(spec: CarSpec): { index: number; letter: ClassLetter } {
  const hit = cache.get(spec.id);
  if (hit) return hit;
  const index = classIndex(derive(spec), referenceTracks);
  const out = { index, letter: classOf(index) };
  cache.set(spec.id, out);
  return out;
}
