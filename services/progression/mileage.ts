import type { CarSpec } from "@contracts/car";
import { hashSeed, mulberry32 } from "@sim/rng";

/**
 * Kilómetros.
 *
 * The number that makes a 1990 car a different object from another 1990 car.
 * Everything here is a function of the car and a salt, never of Math.random,
 * so a listing shows the same odometer every render and a car you own keeps
 * the one it was sold with.
 *
 * The premise: what matters is not how far a car has gone but how far it has
 * gone FOR ITS AGE. 200.000 km on a '71 R12 is a car that was used. 1.600 km
 * on a '90 Fuego is a car that somebody put in a shed, and that is worth more
 * than the same car with the same paint and 400.000 on it.
 */

/**
 * The clock the odometer is read against. Fixed rather than `new Date()`:
 * with a live year every price in the game would drift on New Year's Eve, and
 * every test that pins a price would start failing in January.
 */
export const NOW_YEAR = 2026;

/** Kilometres a car covers in a normal year in the hands of a normal owner. */
export const KM_PER_YEAR = 11_000;

/**
 * Nothing built before this can honestly be sold with nothing on the clock.
 * A 2005 car with 0 km does not exist; a car still in production does. The
 * catalogue currently tops out at 2005, so today this rule means every car in
 * the game has kilometres on it -- which is the point.
 */
export const ZERO_KM_FROM = 2020;

/** Even a barn find has been moved. Below this the number stops being real. */
export const FLOOR_KM = 500;

/** How often a listing is a survivor rather than an honest used car. */
export const SURVIVOR_CHANCE = 0.08;

export function expectedKm(year: number, now: number = NOW_YEAR): number {
  return Math.max(0, now - year) * KM_PER_YEAR;
}

/**
 * The odometer for one listing.
 *
 * Salt it with the dealer id or the rotation so the same car reads differently
 * on two forecourts -- which is most of why one of them is cheaper.
 */
export function kmFor(spec: CarSpec, salt: string): number {
  const rng = mulberry32(hashSeed(`${spec.id}|${salt}`));
  const expected = expectedKm(spec.year);

  // A car still in production can genuinely be new. Anything older cannot,
  // however carefully it was kept.
  if (spec.year >= ZERO_KM_FROM && rng() < 0.5) return 0;
  if (expected === 0) return 0;

  const ratio =
    rng() < SURVIVOR_CHANCE
      ? 0.004 + rng() * 0.05 // shed-kept: half a percent to five percent of normal
      : 0.5 + rng() * 1.5; // driven: half to twice normal
  return Math.max(FLOOR_KM, Math.round((expected * ratio) / 100) * 100);
}

export type Band = "cero" | "survivor" | "low" | "normal" | "high";

export interface Condition {
  km: number;
  /** Odometer against what the year would lead you to expect. 1 is normal. */
  ratio: number;
  band: Band;
  label: string;
  /** What it does to the price. */
  mul: number;
}

/**
 * Price against condition, as a piecewise-linear curve through anchors rather
 * than a formula nobody can picture. Read it as: a shed-kept car is worth half
 * again, an honest one is worth what it is worth, and a hard-used one is worth
 * three quarters.
 *
 * It has to be MONOTONIC -- more kilometres never worth more -- or the same
 * car listed twice could be dearer with the worse odometer. There is a test.
 */
const ANCHORS: [ratio: number, mul: number][] = [
  [0.0, 1.6],
  [0.06, 1.45],
  [0.55, 1.12],
  [1.0, 1.0],
  [1.5, 0.9],
  [3.0, 0.72],
];

export function mulFor(ratio: number): number {
  const first = ANCHORS[0]!;
  const last = ANCHORS[ANCHORS.length - 1]!;
  if (ratio <= first[0]) return first[1];
  if (ratio >= last[0]) return last[1];
  for (let i = 1; i < ANCHORS.length; i++) {
    const [r1, m1] = ANCHORS[i]!;
    const [r0, m0] = ANCHORS[i - 1]!;
    if (ratio <= r1) return m0 + ((ratio - r0) / (r1 - r0)) * (m1 - m0);
  }
  return last[1];
}

const BANDS: [max: number, band: Band, label: string][] = [
  [0.06, "survivor", "De colección"],
  [0.55, "low", "Poco uso"],
  [1.5, "normal", "Uso normal"],
  [Infinity, "high", "Muy rodado"],
];

export function conditionOf(spec: CarSpec, km: number): Condition {
  const expected = expectedKm(spec.year);
  if (km === 0) return { km, ratio: 0, band: "cero", label: "0 km", mul: mulFor(0) };
  // A car from this year or the next has no history to be judged against, so
  // it is simply new rather than remarkably well kept.
  if (expected === 0) return { km, ratio: 1, band: "normal", label: "Uso normal", mul: 1 };

  const ratio = km / expected;
  const hit = BANDS.find(([max]) => ratio <= max)!;
  return { km, ratio, band: hit[1], label: hit[2], mul: mulFor(ratio) };
}

/** The catalogue price of this exact car, with this exact odometer on it. */
export function priceWithKm(base: number, spec: CarSpec, km: number): number {
  return Math.round((base * conditionOf(spec, km).mul) / 100) * 100;
}

export function formatKm(km: number): string {
  return km === 0 ? "0 km" : `${km.toLocaleString("es-AR")} km`;
}
