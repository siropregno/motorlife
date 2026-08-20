import type { CarClass, Layout } from "@contracts/car";
import type { Compound } from "@contracts/race";

/**
 * Everything the physics needs that is not one of the six typed fields lives
 * here, indexed by era, class or layout. These are not per-car data and they
 * are never looked up per car -- that is the whole point. You know a car's
 * decade and whether it is a sports car; that is enough.
 */

/** Longitudinal/lateral tyre grip available in a given decade, g. */
export function eraGrip(year: number): number {
  if (year < 1975) return 0.8;
  if (year < 1990) return 0.9;
  if (year < 2005) return 1.0;
  if (year < 2015) return 1.05;
  return 1.1;
}

/** Rolling resistance coefficient by era. */
export function eraCrr(year: number): number {
  if (year < 1980) return 0.015;
  if (year < 2000) return 0.013;
  return 0.01;
}

/** Time lost to a gearshift, seconds. */
export function eraShift(year: number): number {
  if (year < 1990) return 0.5;
  if (year < 2005) return 0.4;
  return 0.35;
}

/** Grip multiplier by what kind of car it obviously is. */
export const CLASS_GRIP: Record<CarClass, number> = {
  economy: 0.92,
  saloon: 0.96,
  truck: 0.85,
  muscle: 0.98,
  sports: 1.06,
  supercar: 1.12,
  race: 1.3,
};

/** Fallback drag area when no top speed is published, m². */
export const CLASS_CDA: Record<CarClass, number> = {
  economy: 0.72,
  saloon: 0.78,
  truck: 1.05,
  muscle: 0.82,
  sports: 0.64,
  supercar: 0.6,
  race: 0.9,
};

export interface LayoutData {
  /** Static fraction of mass over the driven axle. */
  driven: number;
  /**
   * Which way load moves under power. FWD transfers off the nose and spins
   * up; rear drive transfers onto the driven axle and hooks up. One sign
   * gives you the whole behaviour.
   */
  sign: -1 | 0 | 1;
  /** Drivetrain efficiency. */
  eta: number;
}

export const LAYOUTS: Record<Layout, LayoutData> = {
  FWD: { driven: 0.62, sign: -1, eta: 0.87 },
  FR: { driven: 0.48, sign: 1, eta: 0.87 },
  MR: { driven: 0.58, sign: 1, eta: 0.87 },
  RR: { driven: 0.62, sign: 1, eta: 0.87 },
  AWD: { driven: 1.0, sign: 0, eta: 0.84 },
};

/**
 * Tyre load sensitivity: grip per kilo falls as the car gets heavier. Real
 * effect, and it is what stops "heavy and powerful" being a free win.
 */
export const LOAD_SENSITIVITY = 0.1;

export interface CompoundData {
  /** Grip multiplier at zero wear. */
  grip: number;
  /** Wear rate coefficient. */
  wear: number;
  label: string;
}

export const COMPOUNDS: Record<Compound, CompoundData> = {
  soft: { grip: 1.04, wear: 0.075, label: "S" },
  medium: { grip: 1.0, wear: 0.048, label: "M" },
  hard: { grip: 0.965, wear: 0.03, label: "H" },
};

/** Fuel burned per lap, kg. The car gets lighter and faster as it runs. */
export const FUEL_BURN_KG_PER_LAP = 2.2;
/** Fuel carried at the start, kg. */
export const FUEL_START_KG = 55;
