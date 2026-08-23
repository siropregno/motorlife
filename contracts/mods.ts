/**
 * Car modifications.
 *
 * Four parts, three levels each, plus an engine rebuild that is not a level at
 * all. The shape is deliberately small: a mod set is four small integers and a
 * boolean's worth of wear, so it fits in the save next to the odometer and
 * costs nothing to pass through the sim.
 *
 * The rule that makes the whole thing work: a mod is a MULTIPLIER APPLIED
 * AFTER derive(). Never before. derive() fits the calibration scalar `k`
 * against the car's published 0-100, so raising kW on the way IN would make
 * the fit compensate to hit that same published time -- a turbo would buy you
 * nothing, or worse, would make the car slower once k hit its lower rail and
 * threw an ImportError on a car that imported fine yesterday. There is a test.
 */

/** The four things you can bolt on. Engine is a rebuild, not a part. */
export type PartId = "turbo" | "exhaust" | "suspension" | "gearbox";

/**
 * 0 is stock -- what the car left the factory with -- and 1/2/3 are the three
 * tiers you can buy. Zero being stock rather than "street" is what lets a mod
 * set default to `{}` and read as "nothing done to it".
 */
export type PartLevel = 0 | 1 | 2 | 3;

export const PART_IDS: PartId[] = ["turbo", "exhaust", "suspension", "gearbox"];
export const PART_LEVELS: PartLevel[] = [0, 1, 2, 3];
export const MAX_LEVEL = 3 as const;

/**
 * What is fitted to one car.
 *
 * Every field optional so an unmodified car is `{}` or absent entirely, which
 * is what every car in an existing save is. `wearKm` is the odometer the
 * engine has run SINCE its last rebuild -- see @progression/mods for why it is
 * a separate number from the car's own km.
 */
export interface Mods {
  turbo?: PartLevel;
  exhaust?: PartLevel;
  suspension?: PartLevel;
  gearbox?: PartLevel;
  /**
   * Kilometres on the current engine. Absent means "the same as the car's
   * odometer", which is the honest reading for a car nobody has rebuilt.
   * A rebuild sets it to 0.
   */
  wearKm?: number;
}

export const NO_MODS: Mods = {};

/** The level of one part, with stock as the answer for anything unset. */
export function levelOf(mods: Mods | undefined, part: PartId): PartLevel {
  return mods?.[part] ?? 0;
}
