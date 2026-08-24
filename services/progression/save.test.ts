import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  SAVE_KEY,
  SAVE_VERSION,
  STARTING_SAVE,
  clearSave,
  colorOf,
  colorOfHeld,
  countOwned,
  heldOf,
  kmOf,
  loadSave,
  migrate,
  mintUid,
  ownedIds,
  ownsCar,
  ownsUid,
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
  lotNudge: 9,
  nextUid: 3,
  owned: [
    { uid: "1", id: "ferrari-f40", km: 12_000, color: "red" },
    { uid: "2", id: "bmw-m3-e30", km: 240_100, color: "black" },
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
    first.owned.push({ uid: "9", id: "ferrari-f40", km: 0 });
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
  it("answer about the cars in it, by unit", () => {
    expect(heldOf(PLAYED, "1")?.id).toBe("ferrari-f40");
    expect(heldOf(PLAYED, "nobody")).toBeUndefined();
    expect(ownsUid(PLAYED, "2")).toBe(true);
    expect(ownsUid(PLAYED, "3")).toBe(false);
    expect(kmOf(PLAYED, "2")).toBe(240_100);
    expect(kmOf(PLAYED, "3")).toBeUndefined();
    expect(colorOf(PLAYED, "1")).toBe("red");
    expect(colorOf(PLAYED, "3")).toBeUndefined();
  });

  it("and by model, where a model id can still honestly answer", () => {
    expect(ownedIds(PLAYED)).toEqual(["ferrari-f40", "bmw-m3-e30"]);
    expect(ownsCar(PLAYED, "ferrari-f40")).toBe(true);
    expect(ownsCar(PLAYED, "honda-nsx")).toBe(false);
    expect(countOwned(PLAYED, "ferrari-f40")).toBe(1);
    expect(countOwned(PLAYED, "honda-nsx")).toBe(0);
  });

  /**
   * The whole point of the uid, as a reader test.
   *
   * Two of one model, and every question about one of them has to come back
   * about THAT one. On a model id every line below answers about the first
   * Falcon, which is the bug the uid exists to make impossible.
   */
  it("tell two of the same model apart", () => {
    const twins: Save = {
      ...PLAYED,
      nextUid: 3,
      owned: [
        { uid: "1", id: "ford-falcon-sprint", km: 40_000, color: "white", mods: { turbo: 3 } },
        { uid: "2", id: "ford-falcon-sprint", km: 310_000, color: "red" },
      ],
    };
    expect(countOwned(twins, "ford-falcon-sprint")).toBe(2);
    expect(kmOf(twins, "1")).toBe(40_000);
    expect(kmOf(twins, "2")).toBe(310_000);
    expect(colorOf(twins, "1")).toBe("white");
    expect(colorOf(twins, "2")).toBe("red");
    expect(heldOf(twins, "1")?.mods).toEqual({ turbo: 3 });
    expect(heldOf(twins, "2")?.mods).toBeUndefined();
  });

  /*
   * A car stored with no colour, whose model has paint. The fallback is what
   * keeps its photo from going blank the day that paint ships, and it has to
   * agree with colorOf or the garage and the sheet would show two colours
   * for one car.
   */
  it("derive a colour for a car that was saved without one", () => {
    const held = { uid: "1", id: "bmw-m3-e30", km: 100_000 };
    const save: Save = { ...PLAYED, owned: [held] };
    const derived = colorOfHeld(held);
    expect(derived).toBeDefined();
    expect(colorOf(save, "1")).toBe(derived);
  });
});

/**
 * Naming a car.
 *
 * The counter is the whole defence against two cars sharing a uid, which is
 * the one failure that would put the game back where it was before uids: two
 * cars behind one name, selling one selling both.
 */
describe("minting a uid", () => {
  it("hands out the counter, and moves past anything already taken", () => {
    expect(mintUid(PLAYED)).toBe("3");
    // a counter that has fallen behind the garage -- hand-edited, or a save
    // written by a bug -- must not mint a name that is already in use
    expect(mintUid({ ...PLAYED, nextUid: 1 })).toBe("3");
    expect(mintUid({ ...PLAYED, nextUid: 0 })).toBe("3");
    expect(mintUid({ ...PLAYED, nextUid: Number.NaN })).toBe("3");
  });

  it("never reuses the name of a car that was sold", () => {
    // the reason nextUid is stored rather than derived from the garage: with
    // "one past the highest", selling #2 and buying again would recreate it,
    // and anything still holding "2" -- the car you are in, the ramp -- would
    // silently point at a different car
    const sold: Save = { ...PLAYED, owned: [PLAYED.owned[0]!] };
    expect(mintUid(sold)).toBe("3");
  });
});

/**
 * A save whose uids collide.
 *
 * Not a shape the game writes, and two keystrokes away in devtools. It is
 * repaired on load rather than rejected: rejecting costs the player the whole
 * garage, and a uid is a name nothing outside the save has ever seen, so
 * renaming the second copy loses nothing.
 */
describe("a hand-edited save with duplicate uids", () => {
  it("comes back with one name per car, and every car still there", () => {
    store.mem.set(
      SAVE_KEY,
      JSON.stringify({
        ...PLAYED,
        nextUid: 2,
        owned: [
          { uid: "1", id: "ferrari-f40", km: 12_000, color: "red" },
          { uid: "1", id: "bmw-m3-e30", km: 240_100, color: "black" },
        ],
      }),
    );
    const loaded = loadSave();
    expect(loaded.owned).toHaveLength(2);
    expect(new Set(loaded.owned.map((o) => o.uid)).size).toBe(2);
    // the cars themselves are untouched -- only the name of the second changed
    expect(loaded.owned.map((o) => o.id)).toEqual(["ferrari-f40", "bmw-m3-e30"]);
    expect(loaded.owned[0]!.uid).toBe("1");
    // and the counter is past everything it just handed out, so the next
    // purchase does not walk straight back into the collision
    expect(loaded.owned.every((o) => Number(o.uid) < loaded.nextUid)).toBe(true);
    expect(mintUid(loaded)).not.toBe(loaded.owned[1]!.uid);
  });

  it("leaves an ordinary save exactly as it found it", () => {
    writeSave(PLAYED);
    expect(loadSave()).toEqual(PLAYED);
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
    expect(up?.owned[0]).toEqual({
      uid: "1",
      id: "bmw-m3-e30",
      km: 1_000,
      color: expect.any(String),
    });
  });

  /*
   * v4 -> v5, and the assertion that matters is the ZERO.
   *
   * The lot is seeded with racesRun + lotNudge. Migrating a v4 save to anything
   * but 0 would move a player's Marketplace to a rotation they never reached,
   * the day the game gained a dev button they did not press. A migration is not
   * allowed to change what the game shows.
   */
  it("bring v4 up with the Marketplace exactly where it was", () => {
    const up = migrate({
      version: 4,
      credits: 80_000,
      racesRun: 12,
      owned: [{ id: "bmw-m3-e30", km: 90_000, color: "black", mods: { turbo: 2 } }],
    });
    expect(up?.version).toBe(SAVE_VERSION);
    expect(up?.lotNudge).toBe(0);
    // and nothing else moved on the way up
    expect(up?.credits).toBe(80_000);
    expect(up?.racesRun).toBe(12);
    expect(up?.owned[0]).toEqual({
      uid: "1",
      id: "bmw-m3-e30",
      km: 90_000,
      color: "black",
      mods: { turbo: 2 },
    });
  });

  /**
   * v5 -> v6, and the assertions that matter are the NAMES.
   *
   * Every car in an existing garage gets one, they are all different, and the
   * counter lands past the last of them -- which is what makes the first car
   * bought after this migration take a name no car in the garage has. Nothing
   * else about the save is allowed to move: a migration that shuffled a
   * rotation or moved a wallet would be the game changing under a player who
   * only reloaded the page.
   */
  it("bring v5 up by naming every car in the garage", () => {
    const up = migrate({
      version: 5,
      credits: 250_000,
      racesRun: 22,
      lotNudge: 4,
      owned: [
        { id: "ford-falcon-sprint", km: 180_000, color: "white" },
        { id: "ford-falcon-sprint", km: 40_000, color: "red", mods: { turbo: 2 } },
        { id: "bmw-m3-e30", km: 90_000, color: "black" },
      ],
    });
    expect(up?.version).toBe(SAVE_VERSION);
    expect(up?.owned.map((o) => o.uid)).toEqual(["1", "2", "3"]);
    expect(up?.nextUid).toBe(4);
    // nothing else moved
    expect(up?.credits).toBe(250_000);
    expect(up?.racesRun).toBe(22);
    expect(up?.lotNudge).toBe(4);
    expect(up?.owned[1]).toEqual({
      uid: "2",
      id: "ford-falcon-sprint",
      km: 40_000,
      color: "red",
      mods: { turbo: 2 },
    });
  });

  /*
   * The old garage could not hold two of a model, so no v5 save has a pair in
   * it -- but a hand-edited one can, and the migration must not be what turns
   * that into two cars behind one name.
   */
  it("names a v5 pair separately even though v5 could not have made one", () => {
    const up = migrate({
      version: 5,
      credits: 0,
      racesRun: 0,
      lotNudge: 0,
      owned: [
        { id: "bmw-m3-e30", km: 10_000 },
        { id: "bmw-m3-e30", km: 10_000 },
      ],
    });
    expect(up?.owned[0]!.uid).not.toBe(up?.owned[1]!.uid);
  });

  it("give every older shape a nudge of zero too", () => {
    expect(migrate({ version: 1, credits: 9_000, racesRun: 2, owned: ["bmw-m3-e30"] })?.lotNudge).toBe(0);
    expect(
      migrate({ version: 2, credits: 500, racesRun: 0, owned: [{ id: "bmw-m3-e30", km: 1_000 }] })?.lotNudge,
    ).toBe(0);
    expect(
      migrate({ version: 3, credits: 500, racesRun: 0, owned: [{ id: "bmw-m3-e30", km: 1_000, color: "black" }] })
        ?.lotNudge,
    ).toBe(0);
  });

  it("refuse a shape they have never written", () => {
    expect(migrate({ version: 8 })).toBeNull();
    expect(migrate(null)).toBeNull();
    expect(migrate("save")).toBeNull();
  });

  /*
   * The same reasoning the nudge check below uses, one version later: a v6
   * without nextUid falls through to migrate, which has no route from a broken
   * v6, so it comes back as a new game rather than as a save that mints uids
   * off `undefined`. mintUid would survive that -- it falls back to 1 and scans
   * -- but a save missing a required field is not a save we ever wrote.
   */
  it("refuse a current-version save that is missing the uid counter", () => {
    store.mem.set(
      SAVE_KEY,
      JSON.stringify({
        version: SAVE_VERSION,
        credits: 999,
        racesRun: 3,
        lotNudge: 0,
        owned: [{ uid: "1", id: "bmw-m3-e30", km: 1_000 }],
      }),
    );
    expect(loadSave().credits).toBe(STARTING_SAVE.credits);
  });

  it("and one whose cars have no names", () => {
    store.mem.set(
      SAVE_KEY,
      JSON.stringify({
        version: SAVE_VERSION,
        credits: 999,
        racesRun: 3,
        lotNudge: 0,
        nextUid: 2,
        owned: [{ id: "bmw-m3-e30", km: 1_000 }],
      }),
    );
    expect(loadSave().credits).toBe(STARTING_SAVE.credits);
  });

  /*
   * A stored v5 with the field missing is NOT a v5, and this is the check that
   * says so. isSave requires lotNudge, and without it the save falls through to
   * migrate, which has no route from a broken v5 -- so it comes back as a new
   * game rather than as a save whose seed is `racesRun + undefined`, which is
   * NaN, which is a lot of six identical cars.
   */
  it("refuse a current-version save that is missing the nudge", () => {
    store.mem.set(
      SAVE_KEY,
      JSON.stringify({ version: SAVE_VERSION, credits: 999, racesRun: 3, nextUid: 1, owned: [] }),
    );
    expect(loadSave().credits).toBe(STARTING_SAVE.credits);
  });

  it("and a stored v1 comes up through loadSave, not back as a new game", () => {
    store.mem.set(SAVE_KEY, JSON.stringify({ version: 1, credits: 9_000, racesRun: 2, owned: ["bmw-m3-e30"] }));
    const loaded = loadSave();
    expect(loaded.version).toBe(SAVE_VERSION);
    expect(loaded.credits).toBe(9_000);
  });
});
