import { RHO, G, ACCEL_STEP_M } from "./constants";

/**
 * The minimum a car has to be for the physics to run it. DerivedCar satisfies
 * this structurally, so nothing here depends on the catalog or on derive().
 */
export interface PhysicsCar {
  kW: number;
  kg: number;
  /** Mass actually being accelerated, including fuel. */
  massKg: number;
  cda: number;
  /**
   * Downforce area, Cl x A, m². Zero for a stock road car; the aero slider
   * bolts a wing on. Kept separate from mechanical grip because downforce
   * scales with v² and mechanical grip does not, which is the entire reason
   * a wing is a trade rather than free.
   */
  clA: number;
  /** Mechanical grip, g. Never scaled by the calibration scalar. */
  muLateral: number;
  /**
   * Grip available under braking. Separate from muLateral because brake bias
   * moves one and not the other -- folding it into muLateral made rearward
   * bias a free CORNERING boost, which is why its answer was +0.25 at every
   * circuit on every car. Defaults to muLateral for anything that has not
   * set it.
   */
  muBrake?: number;
  eta: number;
  driven: number;
  transferSign: -1 | 0 | 1;
  crr: number;
  shiftS: number;
  /** Calibration scalar. Longitudinal only. */
  k: number;
}

/**
 * Longitudinal grip: the calibration scalar is fitted against a straight-line
 * 0-100 time, so it may only ever touch this. Letting it reach muLateral
 * means a car with a good launch silently corners better, which is the one
 * bug that quietly wrecks the whole design.
 */
export function muLongitudinal(car: PhysicsCar): number {
  return car.muLateral * car.k;
}

/** Drag plus rolling resistance at speed v, newtons. */
export function resistance(car: PhysicsCar, v: number, massKg: number): number {
  return 0.5 * RHO * car.cda * v * v + car.crr * massKg * G;
}

/**
 * Tractive force available at speed v, newtons. Power-limited above the
 * traction limit, traction-limited below it, with load transferring onto or
 * off the driven axle depending on layout.
 */
export function tractiveForce(car: PhysicsCar, v: number, massKg: number): number {
  const power = car.kW * 1000 * car.eta * car.k;
  const mu = muLongitudinal(car);
  const fPower = power / Math.max(v, 0.5);
  const staticLimit = mu * massKg * G * car.driven;
  // one pass is enough: the guess only sets how much load has moved
  const aGuess = Math.min(fPower, staticLimit) / massKg;
  const frac =
    car.transferSign === 0
      ? 1
      : Math.max(0.15, Math.min(0.95, car.driven + car.transferSign * 0.25 * (aGuess / G)));
  return Math.min(fPower, mu * massKg * G * frac);
}

/** Deceleration under braking, m/s². Uses lateral grip, not the fitted one. */
export function brakeDecel(car: PhysicsCar): number {
  return (car.muBrake ?? car.muLateral) * G;
}

/**
 * Steady-state cornering speed, m/s.
 *
 * With a wing, grip comes from weight plus downforce, and downforce grows with
 * the square of the speed you are trying to solve for:
 *
 *     m*v²/r  =  mu * (m*g + 0.5*rho*ClA*v²)
 *
 * That rearranges without iteration:
 *
 *     v²  =  mu*g*r / (1 - mu*rho*ClA*r / (2m))
 *
 * and the denominator is why a wing is worth a great deal in a 300 m sweeper
 * and almost nothing in a hairpin. With clA = 0 it collapses to sqrt(mu*g*r).
 */
export function cornerSpeed(car: PhysicsCar, radiusM: number): number {
  const denom = 1 - (car.muLateral * RHO * car.clA * radiusM) / (2 * car.massKg);
  // below this the closed form runs away; no road car gets near it
  const safe = Math.max(denom, 0.2);
  return Math.sqrt((car.muLateral * G * radiusM) / safe);
}

export interface AccelResult {
  timeS: number;
  exitV: number;
}

/** Integrate acceleration from v0 over `dist` metres of straight. */
export function accelerate(
  car: PhysicsCar,
  v0: number,
  dist: number,
  massKg: number,
): AccelResult {
  let v = Math.max(v0, 0.5);
  let t = 0;
  let s = 0;
  while (s < dist) {
    const step = Math.min(ACCEL_STEP_M, dist - s);
    const a = (tractiveForce(car, v, massKg) - resistance(car, v, massKg)) / massKg;
    if (a <= 0) {
      // at terminal speed for this car: coast the rest at constant v
      t += (dist - s) / v;
      break;
    }
    t += step / v;
    v += (a * step) / v;
    s += step;
  }
  return { timeS: t, exitV: v };
}

/**
 * 0 to 100 km/h from a standstill, seconds. This is what the calibration
 * scalar is fitted against, so it must include the shift losses a real
 * published figure includes.
 */
export function zeroToHundred(car: PhysicsCar, massKg: number, shifts = 2): number {
  const target = 100 / 3.6;
  const dt = 0.0005;
  let v = 0.001;
  let t = 0;
  while (v < target && t < 120) {
    const a = (tractiveForce(car, v, massKg) - resistance(car, v, massKg)) / massKg;
    if (a <= 0) break;
    v += a * dt;
    t += dt;
  }
  return t + shifts * car.shiftS;
}
