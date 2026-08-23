import type { CarSpec } from "./car";
import type { Mods } from "./mods";

/** Tyre compounds. Softer is faster and wears quicker. */
export type Compound = "soft" | "medium" | "hard";

/**
 * The four setup sliders. Each runs -1..+1 with 0 as the baseline, so a
 * default build is all zeroes and every slider reads as "how far from
 * standard", which is what a player is actually deciding.
 */
export interface Setup {
  /** Downforce vs drag. + is more wing: faster corners, slower straights. */
  aero: number;
  /** Gearing. + is longer: higher top speed, lazier acceleration. */
  gearing: number;
  /** Suspension stiffness. + is stiffer: more grip until it runs out. */
  springs: number;
  /** Brake bias. + is rearward: later braking until it steps out. */
  brakeBias: number;
}

export interface Build {
  carId: string;
  compound: Compound;
  setup: Setup;
  /**
   * What is bolted to the car for this race. Part of the BUILD rather than of
   * the entry, because a build is the complete answer to "what are you
   * running" -- parts, tyres and setup -- and the race has to be reproducible
   * from it alone. Absent means stock.
   */
  mods?: Mods;
  /**
   * The odometer the car arrives with. Engine wear reads it, so the same car
   * with the same parts is a shade slower at 300.000 km than at 20.000, and a
   * replay has to know which one ran.
   */
  km?: number;
}

/** One entry on the grid. */
export interface Entry {
  id: string;
  label: string;
  car: CarSpec;
  build: Build;
  /** Driver consistency, 0..1. Scales the seeded per-lap jitter. */
  consistency: number;
  /** Lap on which this entry pits. */
  pitLap: number;
  /** Compound fitted at the stop. Strategy variety is what makes it tense. */
  pitCompound: Compound;
  /** Whether this entry is the player. */
  you: boolean;
}

/** One lap of one entry. */
export interface LapRecord {
  lap: number;
  timeS: number;
  /** Cumulative time after this lap. */
  totalS: number;
  compound: Compound;
  /** Laps on the current set of tyres. */
  tyreAge: number;
  pitted: boolean;
}

export interface EntryResult {
  entryId: string;
  laps: LapRecord[];
  totalS: number;
  bestLapS: number;
  position: number;
  /** Gap to the winner, seconds. */
  gapS: number;
}

export interface RaceResult {
  trackId: string;
  seed: number;
  laps: number;
  entries: EntryResult[];
  /** Fastest lap of the race, seconds. */
  fastestLapS: number;
  fastestLapEntryId: string;
}

/** One row of the timing tower at one lap. */
export interface TowerRow {
  entryId: string;
  position: number;
  gapS: number;
  lastLapS: number;
  compound: Compound;
  tyreAge: number;
  isFastestLap: boolean;
  isPersonalBest: boolean;
}

export interface TowerTick {
  lap: number;
  rows: TowerRow[];
  events: { text: string; kind: "" | "fastest" | "good" }[];
}
