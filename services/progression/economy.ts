import type { CarSpec } from "@contracts/car";
import type { Mods, PartId, PartLevel } from "@contracts/mods";
import { classCap, type ClassLetter } from "@sim/rating";
import { CARS, carById } from "@catalog/cars";
import { ratingOf } from "@catalog/rating";
import { colorOfHeld, heldOf, mintUid, type Save } from "./save";
import { colorsOf } from "./paint";
import { priceWithKm } from "./mileage";
import { priceOf } from "./pricing";
import {
  canFit,
  modsValue,
  needsRebuild,
  partPrice,
  rebuildPrice,
  withPart,
  withRebuild,
} from "./mods";

/**
 * priceOf lives in pricing.ts so that mods.ts can price a part without
 * importing this module, which imports mods.ts. Re-exported here because it
 * has always been part of the economy's surface and every caller already
 * reaches for it at this address.
 */
export { priceOf } from "./pricing";

/**
 * The economy exists to make the collection mean something. It is built so
 * that money buys BREADTH -- more classes, more track archetypes covered --
 * rather than speed, because "grind, buy the fastest car, win everything" is
 * the failure mode and class caps are the only defence once the cars are real
 * and their numbers cannot be edited.
 */

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
export function sellValueFor(spec: CarSpec, km: number, mods?: Mods): number {
  const car = Math.round((priceWithKm(priceOf(spec), spec, km) * SELL_RATE) / 100) * 100;
  /*
   * The parts are added AFTER the haircut, at their own much steeper one.
   * They are two different markets: the car goes back to a dealer who will
   * resell it, the parts go with it as a fitted build nobody asked for. If
   * they shared a rate, modifying a car would be a way to store value in it
   * at 60 cents on the credit -- better than the 35 a build is actually
   * worth, and enough to make the workshop a savings account.
   */
  return car + modsValue(spec, km, mods);
}

/**
 * Buy and sell are pure functions of the save, not methods on a component,
 * so the invariants below can be tested without rendering anything. Both
 * return the save UNCHANGED when the move is illegal rather than throwing:
 * the caller is a click handler, and a rejected click should do nothing.
 */
export function buyCar(
  save: Save,
  carId: string,
  price: number,
  km: number,
  color?: string,
  mods?: Mods,
): Save {
  /*
   * There is no "you already own one" refusal, and its absence is the feature.
   *
   * It was here from the first version, back when the garage was keyed by model
   * and a second unit would have overwritten the first. That is no longer what
   * the garage is: every car has a uid, so a second Falcon is a second object
   * with its own odometer, its own paint and its own parts -- which is exactly
   * the car somebody wants when they already have one set up for a circuit and
   * need a stock one for another.
   *
   * Nothing about the money changes. Every listing is priced from (spec, km,
   * mods) and sells back from the same three, so the second one loses the same
   * spread on a round trip as the first: duplicates are a thing to want, never
   * a thing to farm.
   */
  if (!carById(carId)) return save;
  if (save.credits < price) return save;
  const uid = mintUid(save);
  // the odometer travels with the car; see sellValueFor for why it must
  const held = color === undefined ? { uid, id: carId, km } : { uid, id: carId, km, color };
  /*
   * And so do the parts. A Marketplace car can come with a turbo already on it,
   * and the listing CHARGED for it -- see market.offer -- so dropping the mods
   * here would take the money and hand over a stock car.
   *
   * Spread conditionally rather than always, so a stock purchase writes no
   * `mods` key at all: absent is what every reader downstream treats as "never
   * touched", and `{}` in the save would be a lie about a car nobody has
   * opened a wrench on.
   */
  return {
    ...save,
    credits: save.credits - price,
    nextUid: Number(uid) + 1,
    owned: [...save.owned, mods === undefined ? held : { ...held, mods }],
  };
}

/**
 * A respray, priced as a fraction of the car rather than as a flat fee.
 *
 * A flat fee would be the wrong shape at both ends: pocket change on an F40 and
 * a real decision on a 128, when the car it matters to is the cheap one. A
 * percentage tracks the car, the way a real paint shop does -- more panels,
 * better paint, more money.
 *
 * 4% is deliberately far under the 40% you lose selling. Paint is meant to be
 * something you do to a car you are keeping, not a transaction you weigh. The
 * floor stops the cheapest shed-find in the catalogue from being resprayed for
 * a rounding error.
 *
 * It does NOT touch what the car is worth. sellValueFor prices the model and
 * the odometer, and paint is not in it -- respraying to sell higher would make
 * this an arbitrage instead of a coat of paint.
 */
export const REPAINT_RATE = 0.04;
export const REPAINT_FLOOR = 500;

export function repaintPriceFor(spec: CarSpec, km: number): number {
  const value = priceWithKm(priceOf(spec), spec, km);
  return Math.max(REPAINT_FLOOR, Math.round((value * REPAINT_RATE) / 100) * 100);
}

/**
 * Paint a car in the garage a colour it actually comes in.
 *
 * Refuses the same way buy and sell refuse -- by returning the save unchanged
 * -- so a click that should not have been possible does nothing rather than
 * throwing under a handler. Repainting a car the colour it already is is one
 * of those: it is a no-op that would otherwise charge for nothing.
 */
export function repaintCar(save: Save, uid: string, color: string): Save {
  const held = heldOf(save, uid);
  if (!held) return save;
  const spec = carById(held.id);
  if (!spec) return save;
  if (!colorsOf(spec).includes(color)) return save;
  // colorOfHeld, not held.color: a car bought before its paint existed has a
  // derived colour on screen, and that is the one the player is looking at.
  if (colorOfHeld(held) === color) return save;
  const price = repaintPriceFor(spec, held.km);
  if (save.credits < price) return save;
  return {
    ...save,
    credits: save.credits - price,
    owned: save.owned.map((o) => (o.uid === uid ? { ...o, color } : o)),
  };
}

/**
 * Sell ONE car, named by uid.
 *
 * The uid is what makes this safe now that the garage can hold two of a model.
 * By id it filtered out every Falcon you had and paid for one -- a bug that
 * only appears once duplicates exist, which is why it never showed up before.
 */
export function sellCar(save: Save, uid: string): Save {
  // Your last car is not for sale. Without it you own nothing to enter, and
  // no amount of credits buys you back in below the cheapest car in the
  // catalogue -- the save would be a dead end you could not spend your way
  // out of.
  if (save.owned.length <= 1) return save;
  const held = heldOf(save, uid);
  if (!held) return save;
  const spec = carById(held.id);
  if (!spec) return save;
  // the build goes with the car, and is paid for at its own rate
  return {
    ...save,
    credits: save.credits + sellValueFor(spec, held.km, held.mods),
    owned: save.owned.filter((o) => o.uid !== uid),
  };
}

/**
 * Fit a part to a car in the garage.
 *
 * Refuses the same way buy, sell and repaint refuse -- by returning the save
 * unchanged -- so a click that should not have been possible does nothing
 * rather than throwing under a handler. Fitting the level already on the car
 * is one of those: a no-op that would charge for nothing.
 *
 * There is deliberately no check on what the part does to your class. Being
 * priced out of class D by your own turbo is a consequence, not an error, and
 * the shop shows it to you before you pay. Refusing the sale would make the
 * class cap a rule about SHOPPING instead of a rule about racing.
 */
export function installPart(
  save: Save,
  uid: string,
  part: PartId,
  level: PartLevel,
): Save {
  const held = heldOf(save, uid);
  if (!held) return save;
  const spec = carById(held.id);
  if (!spec) return save;
  if (!canFit(held.mods, part, level)) return save;
  const price = partPrice(spec, held.km, part, level);
  if (save.credits < price) return save;
  return {
    ...save,
    credits: save.credits - price,
    owned: save.owned.map((o) =>
      o.uid === uid ? { ...o, mods: withPart(o.mods, part, level) } : o,
    ),
  };
}

/**
 * Rebuild the engine: the km on it go back to zero and the power it lost comes
 * back. The car's OWN odometer does not move -- that is its history and it is
 * what the trade prices it on. A rebuild that reset the odometer would be
 * clocking the car, and it would also be a money printer: buy a hammered car
 * cheap, rebuild, sell as a low-km example.
 *
 * That split is the entire reason `wearKm` is a separate number from `km`.
 */
export function rebuildEngine(save: Save, uid: string): Save {
  const held = heldOf(save, uid);
  if (!held) return save;
  const spec = carById(held.id);
  if (!spec) return save;
  // nothing worth paying to put back
  if (!needsRebuild(held.km, held.mods)) return save;
  const price = rebuildPrice(spec, held.km, held.mods);
  if (save.credits < price) return save;
  return {
    ...save,
    credits: save.credits - price,
    owned: save.owned.map((o) => (o.uid === uid ? { ...o, mods: withRebuild(o.mods) } : o)),
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
