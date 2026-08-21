/**
 * Persistence. localStorage for now -- there are no accounts yet.
 *
 * The version field is here from the first line rather than added later,
 * because the moment a real player has credits in a save you cannot change
 * the shape without a migration, and retrofitting a version onto unversioned
 * data means guessing.
 */

import { carById } from "@catalog/cars";
import { kmFor } from "./mileage";

export const SAVE_KEY = "motorlife.save";
export const SAVE_VERSION = 2 as const;

/** The odometer a v1 car arrives with: an ordinary one for its year. */
function kmForOwned(id: string): number {
  const spec = carById(id);
  return spec ? kmFor(spec, "garage") : 0;
}

/**
 * A car in your garage, and the odometer it came with.
 *
 * v1 stored `owned: string[]`. The moment kilometres moved the price, an id
 * on its own stopped being enough: a car bought cheap because it had been
 * round the clock would sell at the flat catalogue rate, and buy-cheap-sell-
 * flat is a money printer. The km travels with the car so both sides of the
 * trade price the same object.
 */
export interface OwnedCar {
  id: string;
  km: number;
}

export interface Save {
  version: typeof SAVE_VERSION;
  credits: number;
  owned: OwnedCar[];
  racesRun: number;
}

/** You start with the cheapest thing in the catalogue and enough to look. */
export const STARTING_SAVE: Save = {
  version: SAVE_VERSION,
  credits: 6_000,
  owned: [{ id: "renault-12-tl", km: 214_000 }],
  racesRun: 0,
};

export const ownedIds = (save: Save): string[] => save.owned.map((o) => o.id);
export const ownsCar = (save: Save, id: string): boolean =>
  save.owned.some((o) => o.id === id);
export const kmOwned = (save: Save, id: string): number | undefined =>
  save.owned.find((o) => o.id === id)?.km;

function isSave(v: unknown): v is Save {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Partial<Save>;
  return (
    s.version === SAVE_VERSION &&
    typeof s.credits === "number" &&
    Array.isArray(s.owned) &&
    s.owned.every(
      (x) => typeof x === "object" && x !== null && typeof x.id === "string" && typeof x.km === "number",
    ) &&
    typeof s.racesRun === "number"
  );
}

/**
 * v1 -> v2. Carries the garage across rather than wiping it: an existing save
 * has real credits and real cars in it, and "start again" is a bad answer to
 * a field being added. The cars arrive with an honest odometer for their year
 * -- there is no record of what they had, and pretending they were all shed
 * finds would hand every old save a windfall on the first sale.
 */
interface SaveV1 {
  version: 1;
  credits: number;
  owned: string[];
  racesRun: number;
}

function isSaveV1(v: unknown): v is SaveV1 {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Partial<SaveV1>;
  return (
    s.version === 1 &&
    typeof s.credits === "number" &&
    Array.isArray(s.owned) &&
    s.owned.every((x) => typeof x === "string") &&
    typeof s.racesRun === "number"
  );
}

export function migrate(v1: SaveV1, kmOf: (id: string) => number): Save {
  return {
    version: SAVE_VERSION,
    credits: v1.credits,
    racesRun: v1.racesRun,
    owned: v1.owned.map((id) => ({ id, km: kmOf(id) })),
  };
}

export function loadSave(): Save {
  if (typeof localStorage === "undefined") return { ...STARTING_SAVE };
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return { ...STARTING_SAVE };
    const parsed: unknown = JSON.parse(raw);
    if (isSave(parsed)) return parsed;
    if (isSaveV1(parsed)) return migrate(parsed, kmForOwned);
    // unknown or future shape: start fresh rather than half-reading it
    return { ...STARTING_SAVE };
  } catch {
    return { ...STARTING_SAVE };
  }
}

export function writeSave(save: Save): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // quota or private mode: the game still plays, it just will not persist
  }
}

export function clearSave(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}
