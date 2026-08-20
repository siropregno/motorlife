import { describe, it, expect, beforeEach } from "vitest";
import type { CarSpec } from "@contracts/car";
import { CARS } from "@catalog/cars";
import { ratingOf } from "@catalog/rating";
import { classOf, classCap } from "@sim/rating";
import {
  priceOf,
  purseFor,
  payoutFor,
  eligibleFor,
  classesOpenTo,
  rollShop,
} from "./economy";
import { loadSave, writeSave, clearSave, STARTING_SAVE, shopSeedFor } from "./save";

const byId = (id: string) => CARS.find((c) => c.id === id) as CarSpec;
const m5 = byId("bmw-m5-e60");
const r12 = byId("renault-12-tl");

describe("class index", () => {
  it("ranks cars by what they actually do, not by a weighting", () => {
    // the M5 is four times the power of the R12 and must rate above it
    expect(ratingOf(m5).index).toBeGreaterThan(ratingOf(r12).index);
  });

  it("puts every catalogue car in a readable band", () => {
    for (const c of CARS) {
      const { index, letter } = ratingOf(c);
      expect(index, c.id).toBeGreaterThan(300);
      expect(index, c.id).toBeLessThan(1000);
      expect(index, c.id).toBeLessThanOrEqual(classCap(letter));
      expect(classOf(index)).toBe(letter);
    }
  });

  it("is stable across calls", () => {
    expect(ratingOf(m5).index).toBe(ratingOf(m5).index);
  });
});

describe("class caps keep a race a race", () => {
  it("a slow car's class does not admit a much faster one", () => {
    const slowClass = ratingOf(r12).letter;
    const field = eligibleFor(slowClass);
    expect(field.map((c) => c.id)).toContain(r12.id);
    // this is the whole point: without it the M5 wins by minutes
    expect(field.map((c) => c.id)).not.toContain(m5.id);
  });

  it("a car may enter its own class and every faster field above it", () => {
    const open = classesOpenTo(r12);
    expect(open).toContain(ratingOf(r12).letter);
    expect(open).toContain("X");
    expect(classesOpenTo(m5)).not.toContain("D");
  });
});

describe("the purse belongs to the event, not the car", () => {
  it("pays the same for the same class and position whoever wins", () => {
    // there is no car argument at all -- that is the guarantee
    expect(payoutFor("D", 1, 4)).toBe(payoutFor("D", 1, 4));
    expect(purseFor("A")).toBeGreaterThan(purseFor("D"));
  });

  it("pays more for winning than for finishing behind", () => {
    const p1 = payoutFor("C", 1, 4);
    const p2 = payoutFor("C", 2, 4);
    const p4 = payoutFor("C", 4, 4);
    expect(p1).toBeGreaterThan(p2);
    expect(p2).toBeGreaterThan(p4);
    expect(p4).toBeGreaterThan(0);
  });

  it("does not pay a full purse to a thin grid", () => {
    expect(payoutFor("C", 1, 2)).toBeLessThan(payoutFor("C", 1, 4));
  });
});

describe("price", () => {
  it("is dominated by rarity rather than by lap time", () => {
    // the epic costs many times the common even though it is only ~30% faster
    const ratio = priceOf(m5) / priceOf(r12);
    const speedRatio = ratingOf(m5).index / ratingOf(r12).index;
    expect(ratio).toBeGreaterThan(speedRatio * 3);
  });

  it("is a positive round number for every car", () => {
    for (const c of CARS) {
      const p = priceOf(c);
      expect(p, c.id).toBeGreaterThan(0);
      expect(p % 100, c.id).toBe(0);
    }
  });
});

describe("shop", () => {
  it("is deterministic for a seed", () => {
    const a = rollShop(1234, []).map((l) => l.spec.id);
    const b = rollShop(1234, []).map((l) => l.spec.id);
    expect(a).toEqual(b);
  });

  it("never lists something you already own, and never duplicates", () => {
    const owned = [r12.id];
    for (let seed = 0; seed < 60; seed++) {
      const ids = rollShop(seed, owned).map((l) => l.spec.id);
      expect(ids).not.toContain(r12.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("rotates with races run", () => {
    const early = { ...STARTING_SAVE, racesRun: 0 };
    const later = { ...STARTING_SAVE, racesRun: 9 };
    expect(shopSeedFor(early)).not.toBe(shopSeedFor(later));
  });

  it("empties gracefully once you own everything", () => {
    expect(rollShop(7, CARS.map((c) => c.id))).toEqual([]);
  });
});

describe("save", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
  });

  it("round-trips", () => {
    const s = { ...STARTING_SAVE, credits: 41_250, racesRun: 5 };
    writeSave(s);
    expect(loadSave()).toEqual(s);
  });

  it("starts fresh rather than half-reading an unknown shape", () => {
    // a save from a future version must not be partially trusted
    (globalThis.localStorage as Storage).setItem(
      "motorlife.save",
      JSON.stringify({ version: 99, credits: 999_999 }),
    );
    expect(loadSave()).toEqual(STARTING_SAVE);
  });

  it("survives garbage in storage", () => {
    (globalThis.localStorage as Storage).setItem("motorlife.save", "{not json");
    expect(loadSave()).toEqual(STARTING_SAVE);
    clearSave();
    expect(loadSave()).toEqual(STARTING_SAVE);
  });

  it("starts you with one car and something to spend", () => {
    clearSave();
    const s = loadSave();
    expect(s.owned).toHaveLength(1);
    expect(s.credits).toBeGreaterThan(0);
    expect(CARS.map((c) => c.id)).toContain(s.owned[0]);
  });
});
