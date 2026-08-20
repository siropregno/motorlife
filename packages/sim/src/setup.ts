import type { DerivedCar } from "@contracts/car";
import type { Setup, Compound } from "@contracts/race";
import { COMPOUNDS, FUEL_START_KG, FUEL_BURN_KG_PER_LAP } from "./tables";
import type { PhysicsCar } from "./physics";

/**
 * Every slider has an optimum that is not zero, and on most of them the
 * optimum depends on the circuit. That is the whole tuning game: aero trades
 * corner speed against straight-line speed, and the right answer at Monza is
 * the wrong answer at Galvez.
 */

/**
 * Aero: + is more wing. Downforce area at the baseline setting, and how much
 * the slider adds. Modelled as real downforce rather than a grip multiplier,
 * so it pays in fast corners, does nothing in hairpins, and costs drag
 * everywhere -- which is what makes the right answer circuit-dependent.
 */
// base == span, so aero=-1 is the stock car with no wing at all and no part
// of the slider is a dead zone where the clamp has already bottomed out
const AERO_CLA_BASE = 0.55;
const AERO_CLA_SPAN = 0.55;
/**
 * Drag from the wing. Induced drag goes with the square of lift, not linearly,
 * which is exactly why a big wing is cheap at first and ruinous at the top of
 * the range -- and why the answer at Monza is not the answer at Galvez.
 */
const AERO_DRAG_QUAD = 0.55;
const AERO_DRAG_LIN = 0.05;

/** Springs: stiffer helps until it does not. Peak sits at +0.4. */
const SPRING_LIN = 0.04;
const SPRING_QUAD = 0.05;

/** Brake bias: rearward brakes later until the rear steps out. Peak at +0.36. */
const BIAS_LIN = 0.05;
const BIAS_QUAD = 0.07;

/** Gearing: shorter pulls harder off the corners, longer runs further. */
const GEAR_LOW_SPEED = 0.1;
const GEAR_TOP_SPEED = 0.06;
/** Speed by which the shorter-gearing advantage has faded, m/s. */
const GEAR_FADE_V = 30;

export interface TyreState {
  compound: Compound;
  /** Laps completed on this set. */
  age: number;
}

/** Grip left in a set of tyres, as a multiplier. Falls with accumulated laps. */
export function tyreGrip(state: TyreState): number {
  const c = COMPOUNDS[state.compound];
  return c.grip * (1 - c.wear * Math.pow(Math.max(state.age, 0), 1.35) * 0.02);
}

/** Fuel still aboard after `lap` laps, kg. The car gets lighter and faster. */
export function fuelKg(lap: number): number {
  return Math.max(0, FUEL_START_KG - FUEL_BURN_KG_PER_LAP * lap);
}

export interface EffectiveCar extends PhysicsCar {
  /** Extra tractive force multiplier at low speed, from gearing. */
  gearLowSpeed: number;
  /** Top speed multiplier, from gearing. */
  gearTopSpeed: number;
}

/**
 * Collapse a car, a setup, a tyre state and a fuel load into the numbers the
 * lap model actually reads. Everything downstream is pure geometry.
 */
export function applySetup(
  car: DerivedCar,
  setup: Setup,
  tyres: TyreState,
  lap: number,
): EffectiveCar {
  const springMul = 1 + SPRING_LIN * setup.springs - SPRING_QUAD * setup.springs ** 2;
  const biasMul = 1 + BIAS_LIN * setup.brakeBias - BIAS_QUAD * setup.brakeBias ** 2;
  const clA = Math.max(0, AERO_CLA_BASE + AERO_CLA_SPAN * setup.aero);

  return {
    kW: car.kW,
    kg: car.kg,
    massKg: car.kg + fuelKg(lap),
    // a wing costs drag everywhere, and only pays where the corner is fast
    cda: car.cda + AERO_DRAG_QUAD * clA * clA + AERO_DRAG_LIN * clA,
    clA,
    // braking rides on mechanical grip, so fold the bias gain in here
    muLateral: car.muLateral * springMul * tyreGrip(tyres) * biasMul,
    eta: car.eta,
    driven: car.driven,
    transferSign: car.transferSign,
    crr: car.crr,
    shiftS: car.shiftS,
    k: car.k,
    gearLowSpeed: 1 - GEAR_LOW_SPEED * setup.gearing,
    gearTopSpeed: 1 + GEAR_TOP_SPEED * setup.gearing,
  };
}

/** Tractive force multiplier from gearing, fading out with speed. */
export function gearFactor(car: EffectiveCar, v: number): number {
  const fade = Math.max(0, 1 - v / GEAR_FADE_V);
  return 1 + (car.gearLowSpeed - 1) * fade;
}
