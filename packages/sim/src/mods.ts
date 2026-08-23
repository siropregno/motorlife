import type { DerivedCar } from "@contracts/car";
import type { Mods, PartId, PartLevel } from "@contracts/mods";

/**
 * The same lookup @contracts/mods exports, written out again here.
 *
 * Not an oversight and not worth de-duplicating: packages/sim is required to
 * have an EMPTY runtime import graph -- type-only imports are erased, a value
 * import is not -- and there is a gate test that fails the build if this file
 * imports a function from outside the package. Four characters of duplication
 * is the price of the sim staying a module that can be dropped into a server,
 * a worker or a CLI with nothing behind it.
 */
function levelOf(mods: Mods | undefined, part: PartId): PartLevel {
  return mods?.[part] ?? 0;
}

/**
 * What a modification does to a car the physics can already run.
 *
 * Every part here moves a term that ALREADY EXISTS. Nothing new is invented:
 * a turbo is kW, an exhaust is kW, a suspension is muLateral, a gearbox is
 * shiftS and eta. That is deliberate -- a mod that needed a new equation would
 * be a mod whose behaviour nobody could predict from the rest of the model,
 * and the point of this sim is that the behaviour falls out.
 *
 * It runs AFTER derive(). See contracts/mods.ts for why that is not a detail.
 */

export interface PartTier {
  /** street / sport / racing, as the shop names them. */
  name: string;
  /** Multiplier on flywheel power. */
  kW: number;
  /** Multiplier on mechanical grip. */
  grip: number;
  /** Multiplier on gearshift time. Lower is quicker. */
  shift: number;
  /** Multiplier on drivetrain efficiency. */
  eta: number;
  /** Multiplier on drag area. A loud exhaust does not make a car slippery. */
  cda: number;
  /**
   * Multiplier on how fast this build eats tyres. Grip you buy with a stiffer
   * spring is grip the tyre pays for, the same way the springs SLIDER already
   * works -- otherwise a racing suspension is free lap time and there is no
   * decision in it.
   */
  wear: number;
  /**
   * Price as a fraction of what the car is worth. A percentage rather than a
   * flat fee for the reason repaintPriceFor gives: a flat number is pocket
   * change on an F40 and a mortgage on a 128, and it is the cheap car that the
   * decision should matter to.
   */
  rate: number;
}

/**
 * Turbo: power, and it costs you nothing else directly.
 *
 * The cost is indirect and it is the interesting one -- more power on the same
 * tyre means the traction limit binds sooner, so tractiveForce() caps a
 * turboed FWD car out of a hairpin exactly the way it caps a real one. That
 * behaviour is not written here. It is what the existing load-transfer term
 * does once kW goes up, which is the whole design.
 *
 * Racing is 1.55x rather than something more dramatic because k is fitted, not
 * free: the calibration scalar already absorbed this car's real launch, and
 * stacking a big multiplier on top of a fitted k compounds. 1.55 with the
 * exhaust on top lands a full build near 1.7x stock power, which is roughly
 * what a period big-turbo conversion actually gave you.
 */
const TURBO: Record<Exclude<PartLevel, 0>, PartTier> = {
  1: { name: "calle", kW: 1.12, grip: 1, shift: 1, eta: 1, cda: 1, wear: 1.03, rate: 0.1 },
  2: { name: "sport", kW: 1.3, grip: 1, shift: 1, eta: 1, cda: 1, wear: 1.07, rate: 0.24 },
  3: { name: "competición", kW: 1.55, grip: 1, shift: 1, eta: 1, cda: 1, wear: 1.12, rate: 0.48 },
};

/**
 * Exhaust: the same term as the turbo, a third of the size, and a little drag
 * back for the trouble at the top tier.
 *
 * Two parts moving one number is only a duplicate purchase if they move it by
 * comparable amounts. They do not: the exhaust is a 6-16% part against the
 * turbo's 12-55%, so it is what you fit when the turbo is out of reach or
 * already maxed, and it is a third of the price of the turbo tier beside it.
 * The top tier hands back a percent of drag so it is not a pure free win at
 * the end of a build.
 *
 * The first cut was 4-9% and it was too little to see: three index points on a
 * full-price part. A part you cannot feel is one nobody buys twice.
 */
const EXHAUST: Record<Exclude<PartLevel, 0>, PartTier> = {
  1: { name: "calle", kW: 1.06, grip: 1, shift: 1, eta: 1, cda: 1, wear: 1, rate: 0.03 },
  2: { name: "sport", kW: 1.11, grip: 1, shift: 1, eta: 1, cda: 1.005, wear: 1, rate: 0.07 },
  3: { name: "competición", kW: 1.16, grip: 1, shift: 1, eta: 1, cda: 1.012, wear: 1, rate: 0.14 },
};

/**
 * Suspension: mechanical grip, paid for in tyres.
 *
 * It moves muLateral, which is the one term the calibration scalar is FORBIDDEN
 * from reaching (see physics.ts). A mod may reach it because a mod is not a
 * fit -- it is a real change to the car, and the whole reason lateral grip is
 * walled off from k is so that a change to it has to be deliberate.
 *
 * The wear cost is what stops racing suspension being strictly correct on
 * every car at every circuit. It buys a lap now and gives some back by lap
 * eight, exactly like the springs slider it sits under.
 */
const SUSPENSION: Record<Exclude<PartLevel, 0>, PartTier> = {
  1: { name: "calle", kW: 1, grip: 1.03, shift: 1, eta: 1, cda: 1, wear: 1.05, rate: 0.08 },
  2: { name: "sport", kW: 1, grip: 1.07, shift: 1, eta: 1, cda: 1, wear: 1.14, rate: 0.19 },
  3: { name: "competición", kW: 1, grip: 1.12, shift: 1, eta: 1, cda: 1, wear: 1.28, rate: 0.38 },
};

/**
 * Gearbox: shift losses, and real driveline efficiency with them.
 *
 * The smallest part of the four by lap time, and meant to be -- a dog box does
 * not turn a saloon into a race car. But it has to be worth SOMETHING, and the
 * first version was not: shift time alone moved the class index by one point
 * on every car in the balance table, which is a part you would never buy and
 * could not feel. A slider nobody moves is decoration; so is a part nobody
 * fits.
 *
 * The fix is efficiency, not more shift time. eta is a multiplier on every
 * newton the engine puts down at every speed, so it is felt on the whole lap
 * rather than fourteen times a race -- which is also the honest model of what
 * a built gearbox and a fresh diff actually do. 4% at the top is a straight
 * drivetrain against a tired one, and it keeps the gearbox the quietest of the
 * four while making it a part rather than a rounding error.
 */
const GEARBOX: Record<Exclude<PartLevel, 0>, PartTier> = {
  1: { name: "calle", kW: 1, grip: 1, shift: 0.9, eta: 1.012, cda: 1, wear: 1, rate: 0.07 },
  2: { name: "sport", kW: 1, grip: 1, shift: 0.75, eta: 1.026, cda: 1, wear: 1, rate: 0.17 },
  3: { name: "competición", kW: 1, grip: 1, shift: 0.58, eta: 1.04, cda: 1, wear: 1, rate: 0.34 },
};

export const PART_TIERS: Record<PartId, Record<Exclude<PartLevel, 0>, PartTier>> = {
  turbo: TURBO,
  exhaust: EXHAUST,
  suspension: SUSPENSION,
  gearbox: GEARBOX,
};

/** Stock: the identity tier, so nothing downstream needs a null check. */
export const STOCK_TIER: PartTier = {
  name: "de fábrica",
  kW: 1,
  grip: 1,
  shift: 1,
  eta: 1,
  cda: 1,
  wear: 1,
  rate: 0,
};

export function tierOf(part: PartId, level: PartLevel): PartTier {
  return level === 0 ? STOCK_TIER : PART_TIERS[part][level];
}

/**
 * Engine wear.
 *
 * The odometer already moved the PRICE of a car. This is what makes it move
 * the car itself, and it is the reason the engine rebuild is a purchase rather
 * than a fifth power part: rebuilding does not make a car faster than it left
 * the factory, it stops it being slower than it left the factory. That is a
 * different verb from every other mod in the list, which is exactly why it
 * earns a slot.
 *
 * Tuned against the odometer curve in @progression/mileage, whose whole point
 * is that a used car saturates near 182.000 km. So the loss saturates too --
 * with a 60.000 km time constant, an honest old car sits around 4-5% down and
 * a genuinely hammered one approaches the 8% rail. Small enough that a stock
 * shed-find is still a good buy; big enough that a rebuild is a real half-tier
 * of power on a car that has earned it.
 */
export const WEAR_TAU_KM = 60_000;
export const WEAR_MAX_KW = 0.08;
export const WEAR_MAX_GRIP = 0.04;

export interface EngineWear {
  km: number;
  /** Multiplier on power. 1 is a fresh engine. */
  kW: number;
  /** Multiplier on grip: old dampers and bushes, not just the engine. */
  grip: number;
  /** 0..1, for a bar on screen. 1 is worn out. */
  fraction: number;
}

export function engineWear(km: number): EngineWear {
  const f = 1 - Math.exp(-Math.max(0, km) / WEAR_TAU_KM);
  return {
    km: Math.max(0, km),
    kW: 1 - WEAR_MAX_KW * f,
    grip: 1 - WEAR_MAX_GRIP * f,
    fraction: f,
  };
}

/**
 * Everything one mod set does, collapsed into one set of multipliers.
 *
 * Multiplicative rather than additive, and it matters: two parts that each add
 * 10% of a term would add 20%, and a third would add 30% forever, so a stack
 * of small parts eventually beats physics. Multiplying compounds gently and
 * never runs away, which is also how the real parts stack -- a turbo makes
 * more of the exhaust than the exhaust makes on its own.
 */
export interface ModEffect {
  kW: number;
  grip: number;
  shift: number;
  eta: number;
  cda: number;
  wear: number;
}

export const NO_EFFECT: ModEffect = { kW: 1, grip: 1, shift: 1, eta: 1, cda: 1, wear: 1 };

/**
 * @param mods   what is fitted
 * @param carKm  the car's own odometer, used when the engine has never been
 *               rebuilt and therefore has exactly as many km on it as the car
 */
export function modEffect(mods: Mods | undefined, carKm: number): ModEffect {
  const wear = engineWear(mods?.wearKm ?? carKm);
  let out: ModEffect = { ...NO_EFFECT, kW: wear.kW, grip: wear.grip };
  for (const part of ["turbo", "exhaust", "suspension", "gearbox"] as PartId[]) {
    const t = tierOf(part, levelOf(mods, part));
    out = {
      kW: out.kW * t.kW,
      grip: out.grip * t.grip,
      shift: out.shift * t.shift,
      eta: out.eta * t.eta,
      cda: out.cda * t.cda,
      wear: out.wear * t.wear,
    };
  }
  return out;
}

/**
 * A derived car with its mods on it.
 *
 * `k` is passed through UNTOUCHED, and that is the single most important line
 * in this file. k was fitted so the STOCK car reproduces its published 0-100.
 * Scaling kW after the fit is what makes a turbo actually do something: the
 * fit is a property of the standard car, and the mod is a departure from it.
 * Re-fitting with the mod applied would silently cancel the mod out.
 *
 * `wearMul` rides along rather than being folded into muLateral, because tyre
 * wear is a per-lap accumulation that applySetup owns and this function does
 * not know what lap it is.
 */
export interface ModdedCar extends DerivedCar {
  /** How much faster this car's parts eat tyres. 1 is stock. */
  modWear: number;
}

export function applyMods(car: DerivedCar, mods: Mods | undefined, carKm: number): ModdedCar {
  const e = modEffect(mods, carKm);
  const kW = car.kW * e.kW;
  return {
    ...car,
    kW,
    cda: car.cda * e.cda,
    muLateral: car.muLateral * e.grip,
    eta: car.eta * e.eta,
    shiftS: car.shiftS * e.shift,
    kWPerTonne: kW / (car.kg / 1000),
    modWear: e.wear,
  };
}
