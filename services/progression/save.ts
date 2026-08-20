/**
 * Persistence. localStorage for now -- there are no accounts yet.
 *
 * The version field is here from the first line rather than added later,
 * because the moment a real player has credits in a save you cannot change
 * the shape without a migration, and retrofitting a version onto unversioned
 * data means guessing.
 */

export const SAVE_KEY = "motorlife.save";
export const SAVE_VERSION = 1 as const;

export interface Save {
  version: typeof SAVE_VERSION;
  credits: number;
  /** Car ids you own. */
  owned: string[];
  racesRun: number;
}

/** You start with the cheapest thing in the catalogue and enough to look. */
export const STARTING_SAVE: Save = {
  version: SAVE_VERSION,
  credits: 6_000,
  owned: ["renault-12-tl"],
  racesRun: 0,
};

function isSave(v: unknown): v is Save {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Partial<Save>;
  return (
    s.version === SAVE_VERSION &&
    typeof s.credits === "number" &&
    Array.isArray(s.owned) &&
    s.owned.every((x) => typeof x === "string") &&
    typeof s.racesRun === "number"
  );
}

export function loadSave(): Save {
  if (typeof localStorage === "undefined") return { ...STARTING_SAVE };
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return { ...STARTING_SAVE };
    const parsed: unknown = JSON.parse(raw);
    if (isSave(parsed)) return parsed;
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

/** Shop stock rotates every few races rather than on every render. */
export const RACES_PER_SHOP_ROTATION = 3;

export function shopSeedFor(save: Save): number {
  return Math.floor(save.racesRun / RACES_PER_SHOP_ROTATION) * 7919 + 104729;
}
