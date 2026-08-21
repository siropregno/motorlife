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
import { colorFor } from "./paint";

export const SAVE_KEY = "motorlife.save";
export const SAVE_VERSION = 3 as const;

/** What an already-owned car arrives with when a field is added under it. */
function kmForOwned(id: string): number {
  const spec = carById(id);
  return spec ? kmFor(spec, "garage") : 0;
}

function colorForOwned(id: string): string | undefined {
  const spec = carById(id);
  return spec ? colorFor(spec, "garage") : undefined;
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
  /** Absent for a car that only comes in one colour. */
  color?: string;
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
  owned: [{ id: "renault-12-tl", km: 214_000, color: "light-blue" }],
  racesRun: 0,
};

export const ownedIds = (save: Save): string[] => save.owned.map((o) => o.id);
export const ownsCar = (save: Save, id: string): boolean =>
  save.owned.some((o) => o.id === id);
export const kmOwned = (save: Save, id: string): number | undefined =>
  save.owned.find((o) => o.id === id)?.km;

/**
 * The colour of a car in the garage.
 *
 * Falls back to a derived one when the save has none, and that fallback is the
 * whole point. v2ToV3 painted every car in the garage the day colour arrived,
 * but a migration runs ONCE: a car bought after that day, while its model still
 * had no photos, was stored with no colour and stayed that way. When the art
 * for that model finally landed, the forecourt showed it in paint and the
 * owner's own copy went blank -- `imageFor` with no colour falls back to
 * `spec.image`, and a car with colours has no `spec.image` to fall back to.
 *
 * Fixing it here rather than in a v4 makes it self-healing. Every future drop
 * of paint for a car someone already owns is the same bug, and a migration
 * would have to be written again each time. The salt is "garage", the one
 * v2ToV3 used, so a car that was migrated and a car that was bought before its
 * paint existed end up the same colour by the same rule.
 */
export const colorOwned = (save: Save, id: string): string | undefined => {
  const held = save.owned.find((o) => o.id === id);
  return held ? (held.color ?? colorForOwned(id)) : undefined;
};

/** The same fallback, for code that already holds the car rather than the save. */
export const colorOfHeld = (o: OwnedCar): string | undefined =>
  o.color ?? colorForOwned(o.id);

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
 * Older shapes, and the way up from each.
 *
 * An existing save has real credits and real cars in it, so "start again" is
 * a bad answer to a field being added. Every version knows how to become the
 * current one, and the chain runs oldest to newest -- add a v4 and v1 still
 * arrives, because v1 becomes v2 becomes v3 becomes v4 rather than each
 * version needing a route from every other.
 *
 * What a migrated car gets is deliberately ORDINARY. There is no record of
 * what these cars had on the clock, and handing them all a shed-find odometer
 * would be a windfall on the first sale.
 */
interface SaveV1 {
  version: 1;
  credits: number;
  owned: string[];
  racesRun: number;
}

interface SaveV2 {
  version: 2;
  credits: number;
  owned: { id: string; km: number }[];
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

function isSaveV2(v: unknown): v is SaveV2 {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Partial<SaveV2>;
  return (
    s.version === 2 &&
    typeof s.credits === "number" &&
    Array.isArray(s.owned) &&
    s.owned.every(
      (x) => typeof x === "object" && x !== null && typeof x.id === "string" && typeof x.km === "number",
    ) &&
    typeof s.racesRun === "number"
  );
}

const v1ToV2 = (s: SaveV1): SaveV2 => ({
  version: 2,
  credits: s.credits,
  racesRun: s.racesRun,
  owned: s.owned.map((id) => ({ id, km: kmForOwned(id) })),
});

const v2ToV3 = (s: SaveV2): Save => ({
  version: SAVE_VERSION,
  credits: s.credits,
  racesRun: s.racesRun,
  owned: s.owned.map((o) => {
    const color = colorForOwned(o.id);
    return color === undefined ? { id: o.id, km: o.km } : { id: o.id, km: o.km, color };
  }),
});

/** Any shape we have ever written, brought to the current one. */
export function migrate(old: unknown): Save | null {
  if (isSaveV1(old)) return v2ToV3(v1ToV2(old));
  if (isSaveV2(old)) return v2ToV3(old);
  return null;
}

export function loadSave(): Save {
  if (typeof localStorage === "undefined") return { ...STARTING_SAVE };
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return { ...STARTING_SAVE };
    const parsed: unknown = JSON.parse(raw);
    if (isSave(parsed)) return parsed;
    const up = migrate(parsed);
    if (up) return up;
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
