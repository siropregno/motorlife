import type { CarSpec, Rarity } from "@contracts/car";
import { classCap, type ClassLetter } from "@sim/rating";
import { CARS, carById } from "@catalog/cars";
import { ratingOf } from "@catalog/rating";
import { ownsCar, type Save } from "./save";
import { priceWithKm } from "./mileage";

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
 * Selling takes a haircut, and the haircut is the whole point.
 *
 * At parity the dealership becomes free storage: you would park a car there
 * between events and pull it back out whenever a class cap suited you, and
 * never once have to choose what to keep. The spread is what makes selling a
 * decision instead of a menu operation. It is also why selling cannot be
 * undone by re-buying -- the catalogue price never moves, so a round trip is
 * always a straight loss of SELL_SPREAD.
 */
export const SELL_RATE = 0.6;
export const SELL_SPREAD = 1 - SELL_RATE;

/**
 * What the trade pays for THIS car, odometer and all.
 *
 * km is not optional by accident. A flat sell price against a km-adjusted buy
 * price is a money printer: buy the car that has been round the clock at a
 * discount, sell it at the catalogue rate, repeat. Both sides have to price
 * the same object.
 */
export function sellValueFor(spec: CarSpec, km: number): number {
  return Math.round((priceWithKm(priceOf(spec), spec, km) * SELL_RATE) / 100) * 100;
}

/**
 * Buy and sell are pure functions of the save, not methods on a component,
 * so the invariants below can be tested without rendering anything. Both
 * return the save UNCHANGED when the move is illegal rather than throwing:
 * the caller is a click handler, and a rejected click should do nothing.
 */
export function buyCar(save: Save, carId: string, price: number, km: number): Save {
  if (ownsCar(save, carId)) return save;
  if (!carById(carId)) return save;
  if (save.credits < price) return save;
  // the odometer travels with the car; see sellValueFor for why it must
  return {
    ...save,
    credits: save.credits - price,
    owned: [...save.owned, { id: carId, km }],
  };
}

export function sellCar(save: Save, carId: string): Save {
  // Your last car is not for sale. Without it you own nothing to enter, and
  // no amount of credits buys you back in below the cheapest car in the
  // catalogue -- the save would be a dead end you could not spend your way
  // out of.
  if (save.owned.length <= 1) return save;
  const held = save.owned.find((o) => o.id === carId);
  if (!held) return save;
  const spec = carById(carId);
  if (!spec) return save;
  return {
    ...save,
    credits: save.credits + sellValueFor(spec, held.km),
    owned: save.owned.filter((o) => o.id !== carId),
  };
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

export function formatCredits(n: number): string {
  return n.toLocaleString("es-AR");
}
