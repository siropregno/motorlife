/**
 * packages/sim -- the race engine.
 *
 * Pure functions, no IO, no clock, no Math.random, and no runtime imports
 * outside this directory. Type-only imports from @contracts are erased at
 * compile time, so the shipped module still has an empty import graph. A gate
 * test asserts exactly that.
 *
 * The same module runs in the browser (what-if preview in the garage), in
 * Node (the authority that resolves a duel) and in the balance CLI. Byte
 * identical output in all three is the whole point.
 */
export { mulberry32, hashSeed } from "./rng";
export * from "./constants";
export * from "./tables";
export {
  derive,
  cdaFromTopSpeed,
  lateralGrip,
  fitCalibration,
  ImportError,
  CDA_MIN,
  CDA_MAX,
  K_MIN,
  K_MAX,
} from "./derive";
export {
  muLongitudinal,
  resistance,
  tractiveForce,
  brakeDecel,
  cornerSpeed,
  accelerate,
  zeroToHundred,
  type PhysicsCar,
  type AccelResult,
} from "./physics";
export {
  applySetup,
  tyreGrip,
  fuelKg,
  gearFactor,
  type EffectiveCar,
  type TyreState,
} from "./setup";
export { lapTime, referenceLap } from "./lap";
export {
  classIndex,
  meanReferenceLap,
  classOf,
  classCap,
  CLASS_BANDS,
  type ClassLetter,
} from "./rating";
export { simulateRace } from "./race";
export { buildTower, fmt, fmtGap } from "./tower";
