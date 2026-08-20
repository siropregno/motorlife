import type { CarSpec, DerivedCar, Confidence } from "@contracts/car";
import { RHO, G } from "./constants";
import {
  eraGrip,
  eraCrr,
  eraShift,
  CLASS_GRIP,
  CLASS_CDA,
  LAYOUTS,
  LOAD_SENSITIVITY,
} from "./tables";
import { zeroToHundred, type PhysicsCar } from "./physics";

/** A derived CdA outside this band means the published figures disagree. */
export const CDA_MIN = 0.4;
export const CDA_MAX = 1.4;
/** A fitted scalar outside this band means the model is wrong for that car. */
export const K_MIN = 0.6;
export const K_MAX = 1.5;

export class ImportError extends Error {
  constructor(
    public readonly carId: string,
    message: string,
  ) {
    super(`${carId}: ${message}`);
    this.name = "ImportError";
  }
}

/**
 * The move that removes a whole research project.
 *
 * At top speed the car is not accelerating, so engine power exactly balances
 * drag plus rolling resistance:
 *
 *     eta*P  =  0.5*rho*CdA*v^3  +  Crr*m*g*v
 *
 * That has one unknown in it, and it is the one you could not look up. A
 * published top speed is therefore a measurement of drag, not a guess.
 */
export function cdaFromTopSpeed(
  kW: number,
  kg: number,
  topKph: number,
  year: number,
  eta: number,
): number | null {
  const v = topKph / 3.6;
  const totalResistance = (eta * kW * 1000) / v;
  const rolling = eraCrr(year) * kg * G;
  const drag = totalResistance - rolling;
  if (drag <= 0) return null;
  return (2 * drag) / (RHO * v * v);
}

/**
 * Lateral grip. Era gives the tyre technology, class gives what kind of car
 * it obviously is, and load sensitivity means a heavy car gets less grip per
 * kilo -- which is what stops "heavy and powerful" from being a free win.
 */
export function lateralGrip(spec: CarSpec): number {
  return (
    eraGrip(spec.year) *
    CLASS_GRIP[spec.cls] *
    (1 - LOAD_SENSITIVITY * (spec.kg / 1000 - 1))
  );
}

/**
 * Fit the one scalar that makes the sim reproduce a published 0-100 exactly.
 * It absorbs gearing, launch technique, turbo lag and whichever magazine took
 * the measurement, none of which you have to look up.
 *
 * Bisection, not Newton: the function is monotonic in k and this cannot
 * diverge.
 */
export function fitCalibration(base: PhysicsCar, massKg: number, target: number): number {
  let lo = 0.3;
  let hi = 2.5;
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    const t = zeroToHundred({ ...base, k: mid }, massKg);
    if (t > target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * derive() runs a 48-step bisection over a millisecond-resolution integration,
 * and simulateRace calls it for every entry. Memoise it: the function is pure,
 * so the only cost of caching is the key. Without this a 200-race determinism
 * check spends all its time re-fitting the same four cars.
 */
const cache = new Map<string, DerivedCar>();

function cacheKey(s: CarSpec): string {
  return [
    s.id,
    s.year,
    s.kW,
    s.kg,
    s.layout,
    s.cls,
    s.topKph ?? "",
    s.zeroTo100 ?? "",
  ].join("|");
}

export function derive(spec: CarSpec): DerivedCar {
  const key = cacheKey(spec);
  const hit = cache.get(key);
  if (hit) return hit;
  const out = deriveUncached(spec);
  cache.set(key, out);
  return out;
}

/**
 * Six typed fields in, a car the physics can run out. Throws rather than
 * quietly returning something plausible: every wrong version of this during
 * development produced lap times that looked entirely reasonable.
 */
export function deriveUncached(spec: CarSpec): DerivedCar {
  const layout = LAYOUTS[spec.layout];

  let cda: number;
  let confidence: Confidence;
  if (spec.topKph !== undefined) {
    const d = cdaFromTopSpeed(spec.kW, spec.kg, spec.topKph, spec.year, layout.eta);
    if (d === null) {
      throw new ImportError(
        spec.id,
        `published power (${spec.kW} kW) cannot reach the published top speed ` +
          `(${spec.topKph} km/h) against rolling resistance alone`,
      );
    }
    if (d < CDA_MIN || d > CDA_MAX) {
      throw new ImportError(
        spec.id,
        `derived CdA ${d.toFixed(3)} m² is outside ${CDA_MIN}-${CDA_MAX}; ` +
          `the published power and top speed disagree with each other`,
      );
    }
    cda = d;
    confidence = "estimated";
  } else {
    cda = CLASS_CDA[spec.cls];
    confidence = "rough";
  }

  const base: PhysicsCar = {
    kW: spec.kW,
    kg: spec.kg,
    massKg: spec.kg,
    cda,
    clA: 0, // stock road car: no wing until the setup sheet adds one
    muLateral: lateralGrip(spec),
    eta: layout.eta,
    driven: layout.driven,
    transferSign: layout.sign,
    crr: eraCrr(spec.year),
    shiftS: eraShift(spec.year),
    k: 1,
  };

  let k = 1;
  if (spec.zeroTo100 !== undefined) {
    k = fitCalibration(base, spec.kg, spec.zeroTo100);
    if (k < K_MIN || k > K_MAX) {
      throw new ImportError(
        spec.id,
        `calibration scalar ${k.toFixed(3)} is outside ${K_MIN}-${K_MAX}; ` +
          `the model is wrong for this car, not merely imprecise`,
      );
    }
    confidence = "calibrated";
  }

  return {
    ...spec,
    cda,
    clA: 0,
    massKg: spec.kg,
    muLateral: base.muLateral,
    eta: base.eta,
    driven: base.driven,
    transferSign: base.transferSign,
    crr: base.crr,
    shiftS: base.shiftS,
    k,
    confidence,
    kWPerTonne: spec.kW / (spec.kg / 1000),
  };
}
