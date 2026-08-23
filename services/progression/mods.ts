import type { CarSpec } from "@contracts/car";
import type { Mods, PartId, PartLevel } from "@contracts/mods";
import { levelOf, MAX_LEVEL, PART_IDS } from "@contracts/mods";
import { engineWear, tierOf } from "@sim/mods";
import { priceWithKm } from "./mileage";
import { priceOf } from "./pricing";

/**
 * What a modification costs, and what a garage is allowed to do to a car.
 *
 * The sim decides what a part DOES (packages/sim/src/mods.ts). This decides
 * what it costs and whether you may fit it. Keeping the two apart is what lets
 * the balance harness re-tune a tier's grip without touching the economy, and
 * lets the economy re-price a tier without anyone having to re-run the physics.
 */

/** How a part is named on the shop shelf. */
export const PART_NAME: Record<PartId, string> = {
  turbo: "Turbo",
  exhaust: "Escape",
  suspension: "Suspensión",
  gearbox: "Caja",
};

export const PART_BLURB: Record<PartId, string> = {
  turbo: "Potencia. Lo que la goma pueda aguantar es otra cosa.",
  exhaust: "Unos caballos más, y el ruido que va con ellos.",
  suspension: "Agarre mecánico, pagado en gomas.",
  gearbox: "Cambios más rápidos. La última pieza de un auto terminado.",
};

export const LEVEL_NAME: Record<Exclude<PartLevel, 0>, string> = {
  1: "Calle",
  2: "Sport",
  3: "Competición",
};

/**
 * Price of fitting `level` of `part` to this car.
 *
 * A fraction of what the car is worth, the same shape repaintPriceFor uses and
 * for the same reason: a flat fee is nothing on an F40 and everything on a 128,
 * when the car the decision should matter to is the cheap one.
 *
 * The rate is the tier's FULL rate, not the difference from what is fitted.
 * Going street -> sport charges the sport rate outright, and the street part
 * you already paid for is gone. That is what a real upgrade costs: the old
 * turbo does not come off the car and turn back into money, and pricing the
 * delta instead would make "buy street now, upgrade later" strictly free
 * compared to buying racing once, which turns every purchase into the same
 * ladder climbed in the same order.
 */
export const PART_FLOOR = 400;

/**
 * Taking a part back off is labour, not a refund.
 *
 * It has to cost SOMETHING or "fit racing, remove it, fit it again" is a free
 * way to flip the car between two class ratings depending on which grid suits
 * you this event -- which would turn the class cap into a menu setting. A flat
 * fraction of what a street part costs is the cheapest thing in the workshop
 * and still enough that swapping back and forth is a decision.
 */
export const REMOVE_RATE = 0.25;

export function partPrice(
  spec: CarSpec,
  km: number,
  part: PartId,
  level: PartLevel,
): number {
  const value = priceWithKm(priceOf(spec), spec, km);
  const rate = level === 0 ? tierOf(part, 1).rate * REMOVE_RATE : tierOf(part, level).rate;
  return Math.max(PART_FLOOR, Math.round((value * rate) / 100) * 100);
}

/**
 * The engine rebuild.
 *
 * Priced off the WEAR, not off a tier: a fresh engine costs nothing to rebuild
 * because there is nothing to rebuild, and a car that has been round the clock
 * costs the full rate. Charging a flat fee would make rebuilding a brand-new
 * car a thing you could do, and paying for it would be the player's mistake
 * rather than the game's refusal.
 */
export const REBUILD_RATE = 0.16;
export const REBUILD_FLOOR = 600;
/** Under this much wear there is nothing worth paying to put back. */
export const REBUILD_MIN_FRACTION = 0.05;

export function rebuildPrice(spec: CarSpec, km: number, mods: Mods | undefined): number {
  const wear = engineWear(mods?.wearKm ?? km);
  const value = priceWithKm(priceOf(spec), spec, km);
  return Math.max(REBUILD_FLOOR, Math.round((value * REBUILD_RATE * wear.fraction) / 100) * 100);
}

export function needsRebuild(km: number, mods: Mods | undefined): boolean {
  return engineWear(mods?.wearKm ?? km).fraction >= REBUILD_MIN_FRACTION;
}

/**
 * What fitting this part would do to the car, before you pay for it.
 *
 * Returned as data rather than applied, because the shop has to show you the
 * consequence -- especially the class change -- while you are still deciding.
 * A mod that pushes you out of class D is not a worse mod, but it is a
 * different race, and finding that out after paying is the version of this
 * feature that makes people stop playing.
 */
export function withPart(mods: Mods | undefined, part: PartId, level: PartLevel): Mods {
  return { ...(mods ?? {}), [part]: level };
}

export function withRebuild(mods: Mods | undefined): Mods {
  return { ...(mods ?? {}), wearKm: 0 };
}

/** The three tiers, in the order the shop lays them out. */
export const LADDER: Exclude<PartLevel, 0>[] = [1, 2, 3];

/**
 * Is this a legal move? Fitting a level you already have is not -- it is a
 * no-op that would charge you for nothing, which is the same refusal
 * repaintCar makes about painting a car the colour it already is.
 */
export function canFit(mods: Mods | undefined, part: PartId, level: PartLevel): boolean {
  if (level < 0 || level > MAX_LEVEL) return false;
  return levelOf(mods, part) !== level;
}

/**
 * What the parts on this car are worth on resale, as a fraction of what they
 * cost. Mods travel with the car -- they are bolted to it -- so selling a
 * modified car has to pay something for them or every build is a total loss
 * the moment you change cars.
 *
 * It is well under 1 on purpose, and under SELL_RATE too. Parts are the most
 * illiquid thing in the game: a fitted turbo is worth far less than a boxed
 * one, and a build is a commitment to THAT car. Without the haircut, modding a
 * cheap car and selling it would launder credits through the workshop.
 */
export const PART_RESALE = 0.35;

export function modsValue(spec: CarSpec, km: number, mods: Mods | undefined): number {
  if (!mods) return 0;
  let total = 0;
  for (const part of PART_IDS) {
    const level = levelOf(mods, part);
    if (level > 0) total += partPrice(spec, km, part, level);
  }
  return Math.round((total * PART_RESALE) / 100) * 100;
}

/** A one-line summary of what is fitted, for a card. "" when stock. */
export function modsSummary(mods: Mods | undefined): string {
  if (!mods) return "";
  const bits = PART_IDS.filter((p) => levelOf(mods, p) > 0).map(
    (p) => `${PART_NAME[p]} ${LEVEL_NAME[levelOf(mods, p) as Exclude<PartLevel, 0>]}`,
  );
  return bits.join(" · ");
}

/** How many of the twelve possible upgrades are fitted. For a badge. */
export function modCount(mods: Mods | undefined): number {
  return PART_IDS.filter((p) => levelOf(mods, p) > 0).length;
}
