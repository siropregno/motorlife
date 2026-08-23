/**
 * Persistence. localStorage for now -- there are no accounts yet.
 *
 * The version field is here from the first line rather than added later,
 * because the moment a real player has credits in a save you cannot change
 * the shape without a migration, and retrofitting a version onto unversioned
 * data means guessing.
 */

import type { Mods } from "@contracts/mods";
import { carById } from "@catalog/cars";
import { kmFor } from "./mileage";
import { colorFor } from "./paint";

export const SAVE_KEY = "motorlife.save";
export const SAVE_VERSION = 5 as const;

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
  /**
   * What is bolted to this car, and how many km its engine has done since the
   * last rebuild. Absent for a car nobody has touched, which is every car in
   * a save written before v4.
   *
   * It lives on the OWNED car rather than on the model for the same reason the
   * odometer does: two people can own the same model and they are not the same
   * object. It travels with the car through a sale, which is why sellValueFor
   * has to price it -- see modsValue.
   */
  mods?: Mods;
}

export interface Save {
  version: typeof SAVE_VERSION;
  credits: number;
  owned: OwnedCar[];
  racesRun: number;
  /**
   * How many extra rotations the Marketplace has been pushed through by hand.
   *
   * The lot is seeded off `racesRun`, because racing is the only clock the game
   * has. The dev tools can turn the lot over without racing, and the obvious
   * way to do that -- bump racesRun -- would be a lie: racesRun is a stat the
   * player is shown, the race screen counts with it, and inflating it to shuffle
   * a shop would corrupt a number that means something else. So the nudge is its
   * own counter and the seed is the SUM. Racing still rotates the lot exactly
   * once, whatever the nudge is; the nudge just moves where the sequence starts.
   */
  lotNudge: number;
}

/** You start with the cheapest thing in the catalogue and enough to look. */
export const STARTING_SAVE: Save = {
  version: SAVE_VERSION,
  credits: 6_000,
  owned: [{ id: "renault-12-tl", km: 214_000, color: "light-blue" }],
  racesRun: 0,
  lotNudge: 0,
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

/**
 * What is fitted to a car in the garage, and what is fitted to a car you are
 * already holding.
 *
 * Both return undefined for a stock car rather than an empty object, because
 * `undefined` is what every function downstream already treats as "nothing
 * done to it" -- levelOf, modEffect and modsValue all take `Mods | undefined`
 * -- and manufacturing an empty object here would put a `{}` into the save on
 * the first read of a car nobody has modified.
 */
export const modsOwned = (save: Save, id: string): Mods | undefined =>
  save.owned.find((o) => o.id === id)?.mods;

export const modsOfHeld = (o: OwnedCar): Mods | undefined => o.mods;

/**
 * A mods blob out of storage.
 *
 * Levels are clamped to 0..3 rather than merely checked, because this is the
 * one field a player can edit by hand in devtools and a level of 99 would
 * index straight past PART_TIERS into undefined -- which is a crash at the
 * next lap solve, not a cheat. Clamping turns tampering into an ordinary
 * maximum-spec car.
 */
function isMods(v: unknown): v is Mods {
  if (typeof v !== "object" || v === null) return false;
  const m = v as Record<string, unknown>;
  for (const k of ["turbo", "exhaust", "suspension", "gearbox"]) {
    const lv = m[k];
    if (lv === undefined) continue;
    if (typeof lv !== "number" || !Number.isInteger(lv) || lv < 0 || lv > 3) return false;
  }
  if (m.wearKm !== undefined && (typeof m.wearKm !== "number" || m.wearKm < 0)) return false;
  return true;
}

function isOwnedCar(x: unknown): x is OwnedCar {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Partial<OwnedCar>;
  if (typeof o.id !== "string" || typeof o.km !== "number") return false;
  if (o.mods !== undefined && !isMods(o.mods)) return false;
  return true;
}

function isSave(v: unknown): v is Save {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Partial<Save>;
  return (
    s.version === SAVE_VERSION &&
    typeof s.credits === "number" &&
    Array.isArray(s.owned) &&
    s.owned.every(isOwnedCar) &&
    typeof s.racesRun === "number" &&
    typeof s.lotNudge === "number"
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

interface SaveV3 {
  version: 3;
  credits: number;
  owned: { id: string; km: number; color?: string }[];
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

interface SaveV4 {
  version: 4;
  credits: number;
  owned: OwnedCar[];
  racesRun: number;
}

function isSaveV3(v: unknown): v is SaveV3 {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Partial<SaveV3>;
  return (
    s.version === 3 &&
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

const v2ToV3 = (s: SaveV2): SaveV3 => ({
  version: 3,
  credits: s.credits,
  racesRun: s.racesRun,
  owned: s.owned.map((o) => {
    const color = colorForOwned(o.id);
    return color === undefined ? { id: o.id, km: o.km } : { id: o.id, km: o.km, color };
  }),
});

/**
 * v3 -> v4: mods arrive, and every existing car is stock.
 *
 * `mods` is left ABSENT rather than set to `{}`, which is the whole migration.
 * An absent mods field means "engine has done exactly the car's own km", which
 * is the honest reading of a car that existed before anyone could rebuild one
 * -- writing `{ wearKm: 0 }` instead would hand every car in every existing
 * save a free engine rebuild the day this shipped, and hand the biggest gift
 * to whoever had been driving the most tired car.
 */
const v3ToV4 = (s: SaveV3): SaveV4 => ({
  version: 4,
  credits: s.credits,
  racesRun: s.racesRun,
  owned: s.owned.map((o) => ({ ...o })),
});

/**
 * v4 -> v5: the Marketplace nudge arrives, and every existing save is at zero.
 *
 * Zero rather than anything derived, and that is the whole migration: the lot
 * seed is racesRun + lotNudge, so a nudge of 0 leaves every save looking at
 * exactly the rotation it was looking at before this field existed. Nobody's
 * shop shuffles because the game gained a dev button.
 */
const v4ToV5 = (s: SaveV4): Save => ({
  version: SAVE_VERSION,
  credits: s.credits,
  racesRun: s.racesRun,
  owned: s.owned.map((o) => ({ ...o })),
  lotNudge: 0,
});

function isSaveV4(v: unknown): v is SaveV4 {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Partial<SaveV4>;
  return (
    s.version === 4 &&
    typeof s.credits === "number" &&
    Array.isArray(s.owned) &&
    s.owned.every(isOwnedCar) &&
    typeof s.racesRun === "number"
  );
}

/** Any shape we have ever written, brought to the current one. */
export function migrate(old: unknown): Save | null {
  if (isSaveV1(old)) return v4ToV5(v3ToV4(v2ToV3(v1ToV2(old))));
  if (isSaveV2(old)) return v4ToV5(v3ToV4(v2ToV3(old)));
  if (isSaveV3(old)) return v4ToV5(v3ToV4(old));
  if (isSaveV4(old)) return v4ToV5(old);
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

/**
 * Start again: the stored save goes, and you get the same first garage a new
 * player gets.
 *
 * It both clears storage AND returns the fresh save, rather than only clearing
 * and letting the caller reload the page. A reload would work, but it throws
 * away every piece of state React holds that is not in the save -- the car you
 * are sitting in, the circuit, the setup sliders -- and those have to be reset
 * TOO. Handing the caller a value lets one setSave do all of it.
 *
 * The copy is not decoration. STARTING_SAVE is a module-level object, so
 * returning it directly would hand every reset the same array of owned cars;
 * buying a car after resetting would mutate the constant if anything ever
 * pushed instead of spreading, and the next reset would start you with it.
 * `owned` is copied one level deeper for the same reason.
 */
export function resetSave(): Save {
  clearSave();
  return { ...STARTING_SAVE, owned: STARTING_SAVE.owned.map((o) => ({ ...o })) };
}
