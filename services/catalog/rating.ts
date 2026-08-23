import type { CarSpec } from "@contracts/car";
import type { Mods } from "@contracts/mods";
import type { TrackSpec } from "@contracts/track";
import { derive } from "@sim/derive";
import { applyMods } from "@sim/mods";
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

export interface Rating {
  index: number;
  letter: ClassLetter;
}

const cache = new Map<string, Rating>();

/**
 * The cache key.
 *
 * It used to be `spec.id`, which was right when a car's rating was a property
 * of the model. It is not any more: a turboed R12 and a stock R12 are the same
 * id and different cars, and a cache that could not tell them apart would rate
 * every modified car as though it were stock -- which is precisely the hole the
 * class cap exists to close.
 *
 * km is in the key because engine wear moves power, so the same car with the
 * same parts rates differently at 20.000 km and at 300.000.
 */
function key(spec: CarSpec, mods: Mods | undefined, km: number): string {
  const m = mods
    ? `${mods.turbo ?? 0}${mods.exhaust ?? 0}${mods.suspension ?? 0}${mods.gearbox ?? 0}|${mods.wearKm ?? ""}`
    : "0000|";
  return `${spec.id}|${m}|${km}`;
}

/**
 * What class this exact car -- this model, these parts, this odometer -- is in.
 *
 * mods and km are optional so every existing caller that only cares about the
 * catalogue car (the shop, the filters, the price) reads the stock rating with
 * no argument, and only the places holding a real garage car pass one.
 */
export function ratingOf(spec: CarSpec, mods?: Mods, km = 0): Rating {
  const k = key(spec, mods, km);
  const hit = cache.get(k);
  if (hit) return hit;
  const index = classIndex(applyMods(derive(spec), mods, km), referenceTracks);
  const out = { index, letter: classOf(index) };
  cache.set(k, out);
  return out;
}
