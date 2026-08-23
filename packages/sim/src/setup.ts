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
// 0.55 was fantasy. ClA of 1.10 at full wing is downforce-car territory, and
// this catalogue is 1970s saloons with at most a lip spoiler. It mattered
// because the corner-speed solve has ClA*r/2m in the denominator, so a big
// number on a light car at a big-radius corner runs away: it was worth 21% more
// speed through a 400 m corner, which is what made Galvez No. 12 a 7% setup
// window and the 128 IAVA untouchable there. 0.18 is a period touring car.
const AERO_CLA_BASE = 0.18;
const AERO_CLA_SPAN = 0.18;
/**
 * Drag from the wing. Induced drag goes with the square of lift, not linearly,
 * which is exactly why a big wing is cheap at first and ruinous at the top of
 * the range -- and why the answer at Monza is not the answer at Galvez.
 */
// 0.55 left the aero window worth 4.6% of a lap at Galvez No. 12, where the
// optimum wants full wing: not tuning lost you ninety seconds at one circuit
// and twenty at the others. A steeper induced-drag term makes the top of the
// range expensive enough that the gain is bounded.
const AERO_DRAG_QUAD = 1.2;
// A real wing sheds drag roughly in proportion to the lift it makes before
// the induced term takes over, and 0.05 was far too little of it: with ClA cut
// to period values the wing became nearly free and the harness found aero
// pinned at the top rail in 22 of 24 combinations.
const AERO_DRAG_LIN = 0.25;

/**
 * Springs: stiffer helps until it does not.
 *
 * The gain scales with downforce, because what stiff springs are FOR is
 * holding an aero platform -- with no wing on the car there is nothing to
 * hold. That coupling is also what gives the slider a circuit-dependent
 * answer: it is worth having exactly where aero is worth having, and the
 * harness caught it sitting at +0.5 in all 24 combinations without it.
 */
const SPRING_LIN = 0.04;
const SPRING_QUAD = 0.05;

/** Brake bias: rearward brakes later until the rear steps out. Peak at +0.36. */
const BIAS_LIN = 0.09;
const BIAS_QUAD = 0.12;

/** Gearing: shorter pulls harder off the corners, longer runs further. */
const GEAR_LOW_SPEED = 0.1;
const GEAR_TOP_SPEED = 0.06;
/** Speed by which the shorter-gearing advantage has faded, m/s. */
const GEAR_FADE_V = 30;
/**
 * Where running out of gear starts to bite, and over what speed range it
 * reaches full effect. Set for this catalogue: these cars top out between 40
 * and 51 m/s, so a window that opens at 90 km/h and saturates at 162 puts the
 * trade inside the speeds they actually reach.
 */
const GEAR_TOP_FROM_V = 25;
const GEAR_TOP_SPAN = 20;
/**
 * Extreme gearing is wrong in both directions -- too short and the lap is
 * spent on the limiter, too long and the engine never reaches the part of the
 * range that pulls. Without this the response is monotonic in the slider, so
 * the answer is always a rail: the balance harness found gearing pinned at
 * +/-1 in 24 of 24 car-and-circuit combinations. A slider with two answers is
 * a switch.
 */
const GEAR_QUAD = 0.05;

export interface TyreState {
  compound: Compound;
  /** Laps completed on this set. */
  age: number;
}

/**
 * How much faster this setup eats tyres. 1 is neutral.
 *
 * Without this the fastest single lap IS the fastest race lap, exactly, so
 * there is nothing to trade and a predicted-lap readout solves the whole game
 * for you. Downforce presses the tyre harder into the road and stiff springs
 * take the compliance out of it -- both buy pace now and pay for it by lap
 * eight. The number on the Setup screen is still true; it is just no longer
 * the only thing that decides the race.
 */
const WEAR_FROM_AERO = 0.8;
const WEAR_FROM_SPRINGS = 0.35;
/**
 * Rearward brake bias puts the stopping through tyres that are also being
 * asked to put the power down, and they pay for it. Brake bias was the last
 * slider with an upside and no cost, which is why its answer was 0.25 at every
 * circuit on every car -- the peak of its own quadratic, forever.
 */
const WEAR_FROM_BIAS = 0.15;

/**
 * @param modWear what the fitted parts do to tyre life, 1 being stock. It
 *   multiplies rather than adds for the same reason the parts multiply each
 *   other: a racing suspension on a full-wing setup should compound, not sum,
 *   or a stack of small wear costs eventually outruns the grip floor.
 */
export function wearMultiplier(setup: Setup, modWear = 1): number {
  const clA = Math.max(0, AERO_CLA_BASE + AERO_CLA_SPAN * setup.aero);
  return (
    (1 +
      WEAR_FROM_AERO * (clA - AERO_CLA_BASE) +
      WEAR_FROM_SPRINGS * Math.max(0, setup.springs) +
      WEAR_FROM_BIAS * Math.max(0, setup.brakeBias)) *
    modWear
  );
}

/**
 * A tyre this far gone is slow, not frictionless. Without the floor the wear
 * term runs past 1 on a long stint and grip goes negative, which is not a
 * worn tyre, it is a car that drives backwards.
 */
const GRIP_FLOOR = 0.45;

/** Grip left in a set of tyres, as a multiplier. Falls with accumulated laps. */
export function tyreGrip(state: TyreState, wearMul = 1): number {
  const c = COMPOUNDS[state.compound];
  const lost = c.wear * wearMul * Math.pow(Math.max(state.age, 0), 1.35) * 0.02;
  return c.grip * Math.max(GRIP_FLOOR, 1 - lost);
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
  /** Loss from running gearing at an extreme, either way. */
  gearPenalty: number;
}

/**
 * Collapse a car, a setup, a tyre state and a fuel load into the numbers the
 * lap model actually reads. Everything downstream is pure geometry.
 */
/**
 * `car` may be a plain DerivedCar or one that has been through applyMods. The
 * mod's tyre cost rides in an optional field rather than in a fifth parameter
 * so that every existing caller -- the rating harness, the rival solver, the
 * Setup readout -- keeps working unchanged and a stock car is `modWear` 1.
 */
export function applySetup(
  car: DerivedCar & { modWear?: number },
  setup: Setup,
  tyres: TyreState,
  lap: number,
): EffectiveCar {
  const wearMul = wearMultiplier(setup, car.modWear ?? 1);
  const clAForSprings = Math.max(0, AERO_CLA_BASE + AERO_CLA_SPAN * setup.aero);
  const springMul =
    1 +
    SPRING_LIN * setup.springs * (clAForSprings / AERO_CLA_BASE) -
    SPRING_QUAD * setup.springs ** 2;
  const biasMul = 1 + BIAS_LIN * setup.brakeBias - BIAS_QUAD * setup.brakeBias ** 2;
  const clA = Math.max(0, AERO_CLA_BASE + AERO_CLA_SPAN * setup.aero);

  return {
    kW: car.kW,
    kg: car.kg,
    massKg: car.kg + fuelKg(lap),
    // a wing costs drag everywhere, and only pays where the corner is fast
    cda: car.cda + AERO_DRAG_QUAD * clA * clA + AERO_DRAG_LIN * clA,
    clA,
    muLateral: car.muLateral * springMul * tyreGrip(tyres, wearMul),
    // bias moves the braking number ONLY. How much that is worth is a
    // property of the circuit -- a lap with heavy braking zones rewards it and
    // a flowing one does not -- which is what makes it a decision rather than
    // a free 0.25 everywhere.
    muBrake: car.muLateral * springMul * tyreGrip(tyres, wearMul) * biasMul,
    eta: car.eta,
    driven: car.driven,
    transferSign: car.transferSign,
    crr: car.crr,
    shiftS: car.shiftS,
    k: car.k,
    gearLowSpeed: 1 - GEAR_LOW_SPEED * setup.gearing,
    gearTopSpeed: 1 + GEAR_TOP_SPEED * setup.gearing,
    gearPenalty: 1 - GEAR_QUAD * setup.gearing ** 2,
  };
}

/** Tractive force multiplier from gearing, fading out with speed. */
export function gearFactor(car: EffectiveCar, v: number): number {
  // short gearing pulls harder off the corner, and the advantage is gone by
  // the time the car is travelling properly
  const low = Math.max(0, 1 - v / GEAR_FADE_V);
  // ...and runs out of gear at the far end of a straight, which is the other
  // half of the trade. Without this term long gearing had no cost anywhere
  // and every car on every circuit wanted it pinned at +1.
  const high = Math.min(1, Math.max(0, (v - GEAR_TOP_FROM_V) / GEAR_TOP_SPAN));
  return (1 + (car.gearLowSpeed - 1) * low + (car.gearTopSpeed - 1) * high) * car.gearPenalty;
}
