import type { DerivedCar } from "@contracts/car";
import type { TrackSpec } from "@contracts/track";
import { applySetup } from "./setup";
import { lapTime } from "./lap";

/**
 * Class index.
 *
 * Not a hand-weighted formula of power and grip. The index is derived from
 * what the car actually does: put it on a frozen set of reference circuits
 * with a standard setup and fresh tyres, take the mean lap, and map that to a
 * number. So the index literally measures "how fast is this thing", computed
 * by the same model that resolves the race, and it cannot drift away from the
 * racing the way a hand-tuned formula does.
 *
 * The reference set has to stay frozen. Adding a circuit to it re-rates every
 * car in the game.
 */

/** Standard setup: no wing, baseline everything. */
const STANDARD = { aero: -1, gearing: 0, springs: 0, brakeBias: 0 } as const;

/**
 * Chosen so the current catalogue spreads across a readable band rather than
 * bunching. A ~120 s mean lands near 700, a ~175 s mean near 480.
 */
const INDEX_CONSTANT = 84_000;

export function meanReferenceLap(car: DerivedCar, tracks: TrackSpec[]): number {
  if (tracks.length === 0) return Infinity;
  const eff = applySetup(car, STANDARD, { compound: "medium", age: 0 }, 0);
  let total = 0;
  for (const t of tracks) total += lapTime({ ...eff, massKg: car.kg }, t);
  return total / tracks.length;
}

export function classIndex(car: DerivedCar, tracks: TrackSpec[]): number {
  const mean = meanReferenceLap(car, tracks);
  if (!Number.isFinite(mean) || mean <= 0) return 0;
  return Math.round(INDEX_CONSTANT / mean);
}

export type ClassLetter = "D" | "C" | "B" | "A" | "S" | "X";

/**
 * Duel classes. A car may enter its own class and any above it in cap terms
 * (a slower car is always welcome in a faster field, never the reverse).
 *
 * Bands are 60 index points, which is roughly six seconds of mean reference
 * lap. Wider than that and genuinely different cars share a class; narrower
 * and two cars of the same pace get split for no reason.
 */
export const CLASS_BANDS: { letter: ClassLetter; max: number }[] = [
  { letter: "D", max: 540 },
  { letter: "C", max: 600 },
  { letter: "B", max: 660 },
  { letter: "A", max: 730 },
  { letter: "S", max: 820 },
  { letter: "X", max: Infinity },
];

export function classOf(index: number): ClassLetter {
  for (const b of CLASS_BANDS) if (index <= b.max) return b.letter;
  return "X";
}

/** The cap a class enforces. Everything at or under it may enter. */
export function classCap(letter: ClassLetter): number {
  return CLASS_BANDS.find((b) => b.letter === letter)?.max ?? Infinity;
}
