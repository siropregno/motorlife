import type { CarSpec, Rarity } from "@contracts/car";
import { mulberry32 } from "@sim/rng";
import { classCap, type ClassLetter } from "@sim/rating";
import { CARS } from "@catalog/cars";
import { ratingOf } from "@catalog/rating";

/**
 * The economy exists to make the collection mean something. It is built so
 * that money buys BREADTH -- more classes, more track archetypes covered --
 * rather than speed, because "grind, buy the fastest car, win everything" is
 * the failure mode and class caps are the only defence once the cars are real
 * and their numbers cannot be edited.
 */

/**
 * Price is set by desirability, not by lap time. A cheap car that is
 * exceptional for its class index is a bargain, and hunting those is the
 * meta-game. Real classic markets work the same way: an E30 M3 costs more
 * than its lap time justifies.
 */
const RARITY_PRICE: Record<Rarity, number> = {
  common: 14_000,
  uncommon: 32_000,
  rare: 70_000,
  epic: 150_000,
  legendary: 320_000,
  apex: 700_000,
};

/** How likely a rarity is to show up in the shop at all. */
const RARITY_WEIGHT: Record<Rarity, number> = {
  common: 100,
  uncommon: 55,
  rare: 26,
  epic: 11,
  legendary: 4,
  apex: 1,
};

/** Performance nudges price, but only gently. Rarity dominates. */
const INDEX_PIVOT = 550;
const INDEX_INFLUENCE = 0.6;

export function priceOf(spec: CarSpec): number {
  const base = RARITY_PRICE[spec.rarity];
  const { index } = ratingOf(spec);
  const mul = Math.max(
    0.6,
    Math.min(2, 1 + (INDEX_INFLUENCE * (index - INDEX_PIVOT)) / INDEX_PIVOT),
  );
  return Math.round((base * mul) / 100) * 100;
}

/**
 * The purse belongs to the EVENT, not to your car. Winning a class D race pays
 * the same whoever wins it, so the way to earn more is to move up a class,
 * which needs a better car. That is a ladder. Scaling payout with car value
 * instead is what makes rich get richer.
 */
export function purseFor(letter: ClassLetter): number {
  const cap = classCap(letter);
  const ceiling = Number.isFinite(cap) ? cap : 900;
  return Math.round((2500 + ceiling * 12) / 10) * 10;
}

const SHARES = [0.42, 0.26, 0.19, 0.13];

export function payoutFor(letter: ClassLetter, position: number, gridSize: number): number {
  const purse = purseFor(letter);
  const share = SHARES[position - 1] ?? 0.05;
  // a thin grid should not pay a full purse to one car
  const scale = Math.min(1, gridSize / SHARES.length);
  return Math.round((purse * share * scale) / 10) * 10;
}

/** Cars you may field under a given class cap. */
export function eligibleFor(letter: ClassLetter, pool: CarSpec[] = CARS): CarSpec[] {
  const cap = classCap(letter);
  return pool.filter((c) => ratingOf(c).index <= cap);
}

/** Classes this car may enter: its own, and every faster field above it. */
export function classesOpenTo(spec: CarSpec): ClassLetter[] {
  const { index } = ratingOf(spec);
  return (["D", "C", "B", "A", "S", "X"] as ClassLetter[]).filter(
    (l) => index <= classCap(l),
  );
}

export interface ShopListing {
  spec: CarSpec;
  price: number;
}

/**
 * Rotating stock, seeded so the same seed always gives the same window. Rarer
 * cars surface less often, which is what makes finding one feel like an event
 * rather than a menu.
 */
export function rollShop(seed: number, owned: string[], size = 3): ShopListing[] {
  const pool = CARS.filter((c) => !owned.includes(c.id));
  const rng = mulberry32(seed);
  const picked: CarSpec[] = [];
  const remaining = [...pool];

  while (picked.length < Math.min(size, pool.length) && remaining.length > 0) {
    const total = remaining.reduce((a, c) => a + RARITY_WEIGHT[c.rarity], 0);
    let r = rng() * total;
    let idx = 0;
    for (let i = 0; i < remaining.length; i++) {
      r -= RARITY_WEIGHT[(remaining[i] as CarSpec).rarity];
      if (r <= 0) {
        idx = i;
        break;
      }
    }
    const [chosen] = remaining.splice(idx, 1);
    if (chosen) picked.push(chosen);
  }

  return picked.map((spec) => ({ spec, price: priceOf(spec) }));
}

export function formatCredits(n: number): string {
  return n.toLocaleString("es-AR");
}
