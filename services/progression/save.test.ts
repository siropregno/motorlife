import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  SAVE_KEY,
  SAVE_VERSION,
  STARTING_SAVE,
  clearSave,
  colorOfHeld,
  colorOwned,
  kmOwned,
  loadSave,
  migrate,
  ownedIds,
  ownsCar,
  resetSave,
  writeSave,
  type Save,
} from "./save";

/**
 * The tests run in node, where there is no localStorage, and every function
 * here is written to survive that -- which is exactly why it has to be faked
 * to test anything. A Map is enough: the four methods the module calls, and
 * nothing else.
 *
 * `throwing` is the private-mode / quota case. It is the branch that decides
 * whether a full disk takes the game down or only stops it persisting, and
 * there is no other way to reach it.
 */
function fakeStorage(throwing = false) {
  const mem = new Map<string, string>();
  return {
    mem,
    getItem: (k: string) => (throwing ? boom() : (mem.get(k) ?? null)),
    setItem: (k: string, v: string) => {
      if (throwing) boom();
      mem.set(k, v);
    },
    removeItem: (k: string) => {
      if (throwing) boom();
      mem.delete(k);
    },
    clear: () => mem.clear(),
  };
}

function boom(): never {
  throw new Error("storage is not available");
}

type Fake = ReturnType<typeof fakeStorage>;
const g = globalThis as { localStorage?: unknown };

function use(store: Fake | undefined) {
  if (store) g.localStorage = store;
  else delete g.localStorage;
}

let store: Fake;

beforeEach(() => {
  store = fakeStorage();
  use(store);
});

afterEach(() => use(undefined));

/** A save that is nothing like the starting one, so a reset to it is visible. */
const PLAYED: Save = {
  version: SAVE_VERSION,
  credits: 412_500,
  racesRun: 37,
  owned: [
    { id: "ferrari-f40", km: 12_000, color: "red" },
    { id: "bmw-m3-e30", km: 240_100, color: "black" },
  ],
};

describe("reading the shelf", () => {
  it("hands a new player the starting garage", () => {
    expect(loadSave()).toEqual(STARTING_SAVE);
  });

  it("reads back exactly what was written", () => {
    writeSave(PLAYED);
    expect(loadSave()).toEqual(PLAYED);
  });

  it("starts fresh rather than half-reading a shape it does not know", () => {
    store.mem.set(SAVE_KEY, JSON.stringify({ version: 99, credits: 1, owned: [], racesRun: 0 }));
    expect(loadSave()).toEqual(STARTING_SAVE);
  });

  it("starts fresh on junk instead of throwing", () => {
    store.mem.set(SAVE_KEY, "{not json");
    expect(loadSave()).toEqual(STARTING_SAVE);
  });

  it("still plays with no storage at all", () => {
    use(undefined);
    expect(loadSave()).toEqual(STARTING_SAVE);
    expect(() => writeSave(PLAYED)).not.toThrow();
  });

  it("and plays when storage throws, it just does not persist", () => {
    use(fakeStorage(true));
    expect(loadSave()).toEqual(STARTING_SAVE);
    expect(() => writeSave(PLAYED)).not.toThrow();
    expect(() => clearSave()).not.toThrow();
  });
});

describe("resetting the progress", () => {
  it("gives back the same garage a new player gets", () => {
    writeSave(PLAYED);
    expect(resetSave()).toEqual(STARTING_SAVE);
  });

  it("wipes the shelf, so a reload does not bring the old save back", () => {
    writeSave(PLAYED);
    resetSave();
    expect(store.mem.has(SAVE_KEY)).toBe(false);
    expect(loadSave()).toEqual(STARTING_SAVE);
  });

  /*
   * The one that matters. STARTING_SAVE is a module constant: if reset handed
   * it out by reference, the first game to touch its own `owned` would edit
   * the constant, and every later reset in that session would start from the
   * edited one.
   */
  it("hands out a copy, never the constant itself", () => {
    const a = resetSave();
    const b = resetSave();
    expect(a).not.toBe(STARTING_SAVE);
    expect(a).not.toBe(b);
    expect(a.owned).not.toBe(STARTING_SAVE.owned);
    expect(a.owned[0]).not.toBe(STARTING_SAVE.owned[0]);
  });

  it("so mutating what it returned cannot poison the next reset", () => {
    const first = resetSave();
    first.credits = 999_999;
    first.owned.push({ id: "ferrari-f40", km: 0 });
    first.owned[0]!.km = 0;
    expect(resetSave()).toEqual(STARTING_SAVE);
  });

  it("works with no storage, since the game still has to keep playing", () => {
    use(undefined);
    expect(resetSave()).toEqual(STARTING_SAVE);
  });

  it("resets to a garage you can actually race: one car, in the catalogue", () => {
    const fresh = resetSave();
    expect(fresh.owned.length).toBeGreaterThan(0);
    expect(fresh.racesRun).toBe(0);
    expect(fresh.version).toBe(SAVE_VERSION);
  });
});

describe("the little readers over a save", () => {
  it("answer about the cars in it", () => {
    expect(ownedIds(PLAYED)).toEqual(["ferrari-f40", "bmw-m3-e30"]);
    expect(ownsCar(PLAYED, "ferrari-f40")).toBe(true);
    expect(ownsCar(PLAYED, "honda-nsx")).toBe(false);
    expect(kmOwned(PLAYED, "bmw-m3-e30")).toBe(240_100);
    expect(kmOwned(PLAYED, "honda-nsx")).toBeUndefined();
    expect(colorOwned(PLAYED, "ferrari-f40")).toBe("red");
    expect(colorOwned(PLAYED, "honda-nsx")).toBeUndefined();
  });

  /*
   * A car stored with no colour, whose model has paint. The fallback is what
   * keeps its photo from going blank the day that paint ships, and it has to
   * agree with colorOwned or the garage and the sheet would show two colours
   * for one car.
   */
  it("derive a colour for a car that was saved without one", () => {
    const held = { id: "bmw-m3-e30", km: 100_000 };
    const save: Save = { ...PLAYED, owned: [held] };
    const derived = colorOfHeld(held);
    expect(derived).toBeDefined();
    expect(colorOwned(save, "bmw-m3-e30")).toBe(derived);
  });
});

describe("older saves", () => {
  it("bring v1 all the way up, giving each car an ordinary odometer", () => {
    const up = migrate({ version: 1, credits: 9_000, racesRun: 2, owned: ["bmw-m3-e30"] });
    expect(up?.version).toBe(SAVE_VERSION);
    expect(up?.credits).toBe(9_000);
    expect(up?.owned[0]?.id).toBe("bmw-m3-e30");
    expect(up?.owned[0]?.km).toBeGreaterThan(0);
    expect(up?.owned[0]?.color).toBeDefined();
  });

  it("bring v2 up by painting what it holds", () => {
    const up = migrate({ version: 2, credits: 500, racesRun: 0, owned: [{ id: "bmw-m3-e30", km: 1_000 }] });
    expect(up?.owned[0]).toEqual({ id: "bmw-m3-e30", km: 1_000, color: expect.any(String) });
  });

  it("refuse a shape they have never written", () => {
    expect(migrate({ version: 7 })).toBeNull();
    expect(migrate(null)).toBeNull();
    expect(migrate("save")).toBeNull();
  });

  it("and a stored v1 comes up through loadSave, not back as a new game", () => {
    store.mem.set(SAVE_KEY, JSON.stringify({ version: 1, credits: 9_000, racesRun: 2, owned: ["bmw-m3-e30"] }));
    const loaded = loadSave();
    expect(loaded.version).toBe(SAVE_VERSION);
    expect(loaded.credits).toBe(9_000);
  });
});
