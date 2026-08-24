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
export const SAVE_VERSION = 6 as const;

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
  /**
   * THIS car. Not this model -- you can own three Falcons, and they are three
   * objects with three odometers, three colours and three sets of parts.
   *
   * Every other field here was already per-car; the id was the only thing
   * standing in for identity, and it could not: `owned.find(o => o.id === id)`
   * answers "the first Falcon" to a question about a particular one, so a
   * second unit shared the first one's engine, took the first one's paint and
   * was the one that got sold when you sold the other. The uid is what makes
   * the lookup mean the car you clicked.
   *
   * Minted from `Save.nextUid` and never reused inside a save -- see mintUid.
   * It is a string rather than a number so nothing is tempted to do arithmetic
   * with it: it is a name, and its only operation is equality.
   */
  uid: string;
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
  /**
   * The next name to hand out, and the reason a uid is never recycled.
   *
   * A counter in the SAVE rather than a random id, because every function that
   * writes to the save is pure -- buyCar takes a save and returns one, and the
   * tests lean on that. `crypto.randomUUID()` inside buyCar would make the
   * next uid a fact about the machine instead of a fact about the save.
   *
   * Deriving it instead -- "one more than the highest uid in the garage" --
   * would reuse names: sell the newest car and the next one you buy takes its
   * uid, so anything still holding the old one (the car you are sitting in,
   * the car on the workshop ramp) would silently point at a different car.
   * A counter only ever goes up.
   */
  nextUid: number;
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
  owned: [{ uid: "1", id: "renault-12-tl", km: 214_000, color: "light-blue" }],
  nextUid: 2,
  racesRun: 0,
  lotNudge: 0,
};

/**
 * The next uid, as a pure function of the save.
 *
 * It skips over anything already taken rather than trusting `nextUid` blindly.
 * The counter is the fast answer and it is right every time the game itself
 * wrote the save; the scan is what stops a hand-edited save -- this is a
 * localStorage game, people open devtools -- from minting a name that is
 * already in the garage, which would put two cars behind one uid and make
 * selling one of them sell both.
 */
export function mintUid(save: Save): string {
  const taken = new Set(save.owned.map((o) => o.uid));
  let n = Number.isFinite(save.nextUid) ? Math.max(1, Math.floor(save.nextUid)) : 1;
  while (taken.has(String(n))) n++;
  return String(n);
}

/**
 * The cars, by unit.
 *
 * These take a uid, not a model id, and that is the whole change: a question
 * about km, paint or parts is a question about ONE car, and with two Falcons
 * in the garage a model id is not enough to name which.
 */
export const heldOf = (save: Save, uid: string): OwnedCar | undefined =>
  save.owned.find((o) => o.uid === uid);
export const ownsUid = (save: Save, uid: string): boolean =>
  save.owned.some((o) => o.uid === uid);
export const kmOf = (save: Save, uid: string): number | undefined => heldOf(save, uid)?.km;

/**
 * The cars, by model.
 *
 * Still useful, and deliberately not phrased as "the" anything: `ownsCar` asks
 * whether at least one is in the garage and `countOwned` says how many, which
 * are the two honest questions a model id can answer now. `ownedIds` may
 * repeat, because the garage may.
 */
export const ownedIds = (save: Save): string[] => save.owned.map((o) => o.id);
export const ownsCar = (save: Save, id: string): boolean =>
  save.owned.some((o) => o.id === id);
export const countOwned = (save: Save, id: string): number =>
  save.owned.filter((o) => o.id === id).length;

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
export const colorOf = (save: Save, uid: string): string | undefined => {
  const held = heldOf(save, uid);
  return held ? (held.color ?? colorForOwned(held.id)) : undefined;
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
export const modsOf = (save: Save, uid: string): Mods | undefined => heldOf(save, uid)?.mods;

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

/** The pre-uid shape, which is what v4 and v5 hold. */
interface LegacyCar {
  id: string;
  km: number;
  color?: string;
  mods?: Mods;
}

function isLegacyCar(x: unknown): x is LegacyCar {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Partial<LegacyCar>;
  if (typeof o.id !== "string" || typeof o.km !== "number") return false;
  if (o.mods !== undefined && !isMods(o.mods)) return false;
  return true;
}

function isOwnedCar(x: unknown): x is OwnedCar {
  if (!isLegacyCar(x)) return false;
  const uid = (x as Partial<OwnedCar>).uid;
  return typeof uid === "string" && uid.length > 0;
}

function isSave(v: unknown): v is Save {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Partial<Save>;
  return (
    s.version === SAVE_VERSION &&
    typeof s.credits === "number" &&
    Array.isArray(s.owned) &&
    s.owned.every(isOwnedCar) &&
    typeof s.nextUid === "number" &&
    typeof s.racesRun === "number" &&
    typeof s.lotNudge === "number"
  );
}

/**
 * Make the uids in a save unique, and the counter safe to mint from.
 *
 * `isSave` only says every car HAS a uid, which is not the property the rest of
 * the game leans on: it leans on every car having a DIFFERENT one. Two cars
 * behind one uid is not a shape this game ever writes, but it is two keystrokes
 * away in devtools, and the result would be quiet and nasty rather than loud --
 * `heldOf` answers with the first of the pair, so the workshop would fit parts
 * to one and the sheet would read the other, and `sellCar` filters by uid, so
 * selling one of them would sell both for the price of one.
 *
 * So it is repaired rather than rejected. Rejecting is what `isSave` does to a
 * shape it does not recognise, and it costs the player their whole garage; a
 * duplicate uid is a save we DO recognise with one field to fix, and renaming
 * the second copy loses nothing at all -- a uid is a name, and nothing outside
 * the save has ever seen it.
 *
 * Returns the save it was GIVEN when there is nothing to fix, which is every
 * ordinary load. The callers compare by identity, and a fresh object per load
 * would say "something changed" on every boot.
 */
function repair(save: Save): Save {
  const seen = new Set<string>();
  let dirty = false;
  const owned = save.owned.map((o) => {
    if (!seen.has(o.uid)) {
      seen.add(o.uid);
      return o;
    }
    dirty = true;
    let n = Math.max(1, Math.floor(Number.isFinite(save.nextUid) ? save.nextUid : 1));
    while (seen.has(String(n))) n++;
    seen.add(String(n));
    return { ...o, uid: String(n) };
  });
  // The counter has to end up past everything it just handed out, or the next
  // purchase walks the same collision it was scanned out of.
  const highest = [...seen].reduce((n, uid) => Math.max(n, Number(uid) || 0), 0);
  const nextUid = Math.max(Math.floor(save.nextUid) || 1, highest + 1);
  if (!dirty && nextUid === save.nextUid) return save;
  return { ...save, owned, nextUid };
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
  owned: LegacyCar[];
  racesRun: number;
}

interface SaveV5 {
  version: 5;
  credits: number;
  owned: LegacyCar[];
  racesRun: number;
  lotNudge: number;
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
const v4ToV5 = (s: SaveV4): SaveV5 => ({
  version: 5,
  credits: s.credits,
  racesRun: s.racesRun,
  owned: s.owned.map((o) => ({ ...o })),
  lotNudge: 0,
});

/**
 * v5 -> v6: every car gets a name of its own.
 *
 * The garage was a list keyed by model, so it could not hold two of anything;
 * the uid is what lets it. Numbering is positional -- first car in the list is
 * "1" -- because there is nothing else to go on, and it does not matter: a uid
 * means nothing except "not the other one", and no save has ever shown it to
 * anybody.
 *
 * `nextUid` lands one past the last one handed out, which is what makes the
 * first car bought after the migration take a name no car in the garage has.
 */
const v5ToV6 = (s: SaveV5): Save => ({
  version: SAVE_VERSION,
  credits: s.credits,
  racesRun: s.racesRun,
  owned: s.owned.map((o, i) => ({ uid: String(i + 1), ...o })),
  nextUid: s.owned.length + 1,
  lotNudge: s.lotNudge,
});

function isSaveV4(v: unknown): v is SaveV4 {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Partial<SaveV4>;
  return (
    s.version === 4 &&
    typeof s.credits === "number" &&
    Array.isArray(s.owned) &&
    s.owned.every(isLegacyCar) &&
    typeof s.racesRun === "number"
  );
}

function isSaveV5(v: unknown): v is SaveV5 {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Partial<SaveV5>;
  return (
    s.version === 5 &&
    typeof s.credits === "number" &&
    Array.isArray(s.owned) &&
    s.owned.every(isLegacyCar) &&
    typeof s.racesRun === "number" &&
    typeof s.lotNudge === "number"
  );
}

/** Any shape we have ever written, brought to the current one. */
export function migrate(old: unknown): Save | null {
  if (isSaveV1(old)) return v5ToV6(v4ToV5(v3ToV4(v2ToV3(v1ToV2(old)))));
  if (isSaveV2(old)) return v5ToV6(v4ToV5(v3ToV4(v2ToV3(old))));
  if (isSaveV3(old)) return v5ToV6(v4ToV5(v3ToV4(old)));
  if (isSaveV4(old)) return v5ToV6(v4ToV5(old));
  if (isSaveV5(old)) return v5ToV6(old);
  return null;
}

export function loadSave(): Save {
  if (typeof localStorage === "undefined") return { ...STARTING_SAVE };
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return { ...STARTING_SAVE };
    const parsed: unknown = JSON.parse(raw);
    // repair, not merely validate: see its comment for the one thing isSave
    // cannot say, which is that the uids are all DIFFERENT.
    if (isSave(parsed)) return repair(parsed);
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
