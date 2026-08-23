/**
 * A car as you type it: six required fields, all readable off a Wikipedia
 * infobox in about ten seconds. Everything the physics needs beyond this is
 * derived (see @sim/derive) or comes from an era/class table -- never looked up
 * per car.
 */

/** Where the engine sits and which axle it drives. */
export type Layout = "FWD" | "FR" | "MR" | "RR" | "AWD";

/** One dropdown value you know just by looking at the car. */
export type CarClass =
  | "economy"
  | "saloon"
  | "truck"
  | "muscle"
  | "sports"
  | "supercar"
  | "race";

/** Collection tier. Drives acquisition and duel eligibility, not physics. */
export type Rarity =
  | "common"
  | "uncommon"
  | "rare"
  | "vrare"
  | "exclusive"
  | "unique";

/** How much the sim actually knows about this car. */
export type Confidence = "rough" | "estimated" | "calibrated";

export interface CarSpec {
  id: string;
  make: string;
  /** Model as shown on the card, e.g. "R12 TL". */
  model: string;

  // --- the six required fields -------------------------------------------
  year: number;
  /** Engine power at the flywheel, kilowatts. */
  kW: number;
  /** Kerb mass, kilograms. */
  kg: number;
  layout: Layout;
  cls: CarClass;

  // --- optional, and each one buys real accuracy -------------------------
  /** Published top speed, km/h. Derives drag exactly (see @sim/derive). */
  topKph?: number;
  /** Published 0-100 km/h, seconds. Fits the calibration scalar. */
  zeroTo100?: number;
  /** Peak torque, Nm. Display only; the model does not read it. */
  nm?: number;

  // --- presentation -------------------------------------------------------
  rarity: Rarity;
  /** Free-text class shown on the card, e.g. "Super Sedan". */
  blurb: string;
  /**
   * The single photo, for a car that comes in one colour only. A car with
   * `colors` derives its photo per colour instead and ignores this.
   */
  image?: string;
  /**
   * Paint options, as filename slugs. The photo for each is
   * `/<photo|id>-<color>.webp`, so adding a colour is a file plus a word here.
   */
  colors?: string[];
  /**
   * Filename stem for the photos, when it is not the id.
   *
   * The renders arrive named after the car as it is spoken about -- a
   * "Fuego GTA Max", a "Taunus 2300GT" -- while the id is what the sim needs.
   * Renaming every drop to match ids was a losing fight; declaring the stem
   * once per car is not.
   */
  photo?: string;
  logo?: string;
}

/** What derive() works out so the physics never needs a lookup table. */
export interface DerivedCar extends CarSpec {
  /** Drag area, m². From top speed if given, else a class estimate. */
  cda: number;
  /** Downforce area, Cl x A, m². Zero stock; the aero slider adds a wing. */
  clA: number;
  /** Mass being accelerated, kg. Equals kg until fuel is added. */
  massKg: number;
  /** Mechanical grip, g. Era x class x tyre load sensitivity. */
  muLateral: number;
  /** Drivetrain efficiency, from layout. */
  eta: number;
  /** Static fraction of mass on the driven axle. */
  driven: number;
  /** +1 if load transfers onto the driven axle under power, -1 if off it. */
  transferSign: -1 | 0 | 1;
  /** Rolling resistance coefficient, from era. */
  crr: number;
  /** Gearshift time, seconds, from era. */
  shiftS: number;
  /**
   * Calibration scalar fitted to the published 0-100. Scales power and the
   * launch traction limit ONLY -- never lateral grip, or a good launch would
   * silently make the car corner better.
   */
  k: number;
  confidence: Confidence;
  /** Power-to-weight, kW per tonne. Display. */
  kWPerTonne: number;
}
