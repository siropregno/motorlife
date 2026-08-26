import type { CarSpec, Rarity } from "@contracts/car";
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

/** Kilometres a car covers in a normal year EARLY IN ITS LIFE. */
export const KM_PER_YEAR = 14_000;

/**
 * How fast the annual rate falls off, in years.
 *
 * This was a flat KM_PER_YEAR times age, and it was wrong in a way you could
 * see on the screen: a '72 Chevy came up at 985.800 km. Cars do not do 14.000
 * a year for fifty years. They do it while they are somebody's only car, and
 * then they become a second car, then a weekend car, then something under a
 * cover -- which is exactly how a 50-year-old car is still on the road at all.
 *
 * So the odometer saturates. The rate decays with a 13-year time constant and
 * the total tends to KM_PER_YEAR * KM_TAU, about 182.000, which is where the
 * trade actually puts "high kilometres":
 *
 *     5 years   ~58.000     10 years  ~98.000
 *    20 years  ~143.000     36 years ~171.000     55 years ~179.000
 *
 * It lines up with the rules of thumb: five years and 90.000 is hard use
 * (1,6x what the age implies), under 5.000 a year is a car that sat (0,45x),
 * and 200.000 is where big parts start to go, which is just past normal for
 * anything genuinely old.
 */
export const KM_TAU = 13;

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
  const years = Math.max(0, now - year);
  return Math.round(KM_PER_YEAR * KM_TAU * (1 - Math.exp(-years / KM_TAU)));
}

/**
 * How hard a tier gets used, against an ordinary car of the same age.
 *
 * Age alone was the whole model, and it produced an Audi R8 with 225.400 km on
 * a forecourt. The curve was not wrong -- that IS what fifteen years does to a
 * car somebody drives to work -- it was being asked the wrong question. A
 * 2010 R8 is not a 2010 anything: it is a second car that comes out on Sundays,
 * gets garaged, and spends winters under a cover.
 *
 * Keyed on RARITY rather than on `cls`, and the difference matters. `cls` is
 * what the car IS -- a coupé, a pickup -- and it would say a rare Torino ZX and
 * a common Falcon lead the same life because both are Argentine muscle. Rarity
 * is how it was TREATED, which is the actual question: the same reason few of
 * them survive is the reason the survivors are the cared-for ones. It is also
 * already this game's collectibility axis, so a car does not need a second
 * opinion about how special it is.
 *
 * The numbers are a ladder rather than a formula so each one can be argued
 * with. `common` and `uncommon` sit at 1 because they are what "ordinary" MEANS
 * -- the expectedKm curve was fitted against exactly these cars, and moving
 * them would be re-fitting it by the back door.
 */
export const USE_BY_TIER: Record<Rarity, number> = {
  common: 1,
  uncommon: 1,
  rare: 0.8,
  vrare: 0.6,
  exclusive: 0.45,
  unique: 0.3,
};

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
      ? // Shed-kept, and the tier is deliberately NOT applied here. This branch
        // already means "this one sat", and scaling it again would push a
        // unique car under FLOOR_KM and clamp every barn-find supercar to the
        // same 500 km -- one number pretending to be a draw.
        0.004 + rng() * 0.05
      : // Driven: half to twice normal for its age, and then as much less as
        // its tier says it was spared.
        (0.5 + rng() * 1.5) * USE_BY_TIER[spec.rarity];
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

/**
 * Being remarkable takes two things, and the ratio is only one of them.
 *
 * A 2023 car with 11.000 km is a low-kilometre car. A 1990 car with 11.000 km
 * is a car somebody kept, and that is a different object with a different
 * buyer. So "De colección" needs the years as well as the odometer -- without
 * the age gate a nearly-new car would wear a collector's badge for the crime
 * of being nearly new.
 *
 * The PRICE does not use this gate. Low kilometres are worth money at any age;
 * only the word is reserved.
 */
export const COLLECTIBLE_AGE = 15;
export const SURVIVOR_RATIO = 0.2;

const BANDS: [max: number, band: Band, label: string][] = [
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
  const age = NOW_YEAR - spec.year;
  if (ratio <= SURVIVOR_RATIO && age >= COLLECTIBLE_AGE) {
    return { km, ratio, band: "survivor", label: "De colección", mul: mulFor(ratio) };
  }
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
