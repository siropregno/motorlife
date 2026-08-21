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
  sellValueFor,
  buyCar,
  sellCar,
} from "./economy";
import type { Save } from "./save";
import { ownedIds } from "./save";
import { priceWithKm } from "./mileage";
import {
  loadSave,
  writeSave,
  clearSave,
  STARTING_SAVE,
  SAVE_VERSION,
} from "./save";

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

  /**
   * v1 stored `owned: string[]`. A player with credits and a garage must not
   * lose either because a field was added -- "start again" is a bad answer to
   * a schema change, which is why the version has been in the file since the
   * first line.
   */
  it("carries a v1 garage across instead of wiping it", () => {
    (globalThis.localStorage as Storage).setItem(
      "motorlife.save",
      JSON.stringify({
        version: 1,
        credits: 87_400,
        owned: ["renault-12-tl", "ford-f100"],
        racesRun: 11,
      }),
    );
    const s = loadSave();
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.credits).toBe(87_400);
    expect(s.racesRun).toBe(11);
    expect(s.owned.map((o) => o.id)).toEqual(["renault-12-tl", "ford-f100"]);
    // the cars arrive with an honest odometer, not a windfall: there is no
    // record of what they had, and 0 km would hand every old save a free sale
    for (const o of s.owned) expect(o.km).toBeGreaterThan(0);
  });

  it("starts you with one car and something to spend", () => {
    clearSave();
    const s = loadSave();
    expect(s.owned).toHaveLength(1);
    expect(s.credits).toBeGreaterThan(0);
    expect(CARS.map((c) => c.id)).toContain(s.owned[0]!.id);
    // and it arrives with an odometer, because nothing in this catalogue is 0 km
    expect(s.owned[0]!.km).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------

/** A car in the garage with an ordinary odometer on it for these tests. */
const held = (id: string) => ({ id, km: 100_000 });

const save = (over: Partial<Save> = {}): Save => ({
  version: SAVE_VERSION,
  credits: 100_000,
  owned: [held("renault-12-tl"), held("ford-f100")],
  racesRun: 0,
  ...over,
});

describe("selling", () => {
  it("always takes a haircut, so a round trip is never free", () => {
    for (const car of CARS) {
      // priced at the SAME odometer on both sides, which is the invariant
      expect(sellValueFor(car, 100_000)).toBeLessThan(priceWithKm(priceOf(car), car, 100_000));
      expect(sellValueFor(car, 100_000)).toBeGreaterThan(0);
    }
  });

  it("buy then sell strictly loses credits", () => {
    // The exploit this rules out: park a car in the dealership between events
    // and pull it back out whenever a class cap suits you, at no cost.
    for (const car of CARS) {
      const start = save({ credits: 2_000_000, owned: [held("renault-12-tl")] });
      const km = 100_000;
      const bought = buyCar(start, car.id, priceWithKm(priceOf(car), car, km), km);
      if (car.id === "renault-12-tl") {
        expect(bought).toBe(start); // already owned, nothing happens
        continue;
      }
      const back = sellCar(bought, car.id);
      expect(back.owned).toEqual(start.owned);
      expect(back.credits).toBeLessThan(start.credits);
    }
  });

  it("refuses to sell your last car", () => {
    const s = save({ owned: [held("renault-12-tl")] });
    expect(sellCar(s, "renault-12-tl")).toBe(s);
  });

  it("refuses to sell a car you do not own", () => {
    const s = save();
    expect(sellCar(s, "bmw-m5-e60")).toBe(s);
  });

  it("refuses to sell a car that is not in the catalogue", () => {
    const s = save({ owned: [held("renault-12-tl"), held("ghost-car")] });
    expect(sellCar(s, "ghost-car")).toBe(s);
  });

  it("pays out and drops the car", () => {
    const s = save();
    const after = sellCar(s, "ford-f100");
    expect(after.owned).toEqual([held("renault-12-tl")]);
    expect(after.credits).toBe(s.credits + sellValueFor(byId("ford-f100"), 100_000));
    expect(s.owned).toEqual([held("renault-12-tl"), held("ford-f100")]); // input untouched
  });

  it("leaves the sold car buyable again", () => {
    // the dealership lists the catalogue minus what you own, so this is the
    // whole condition now that stock no longer rotates
    const s = sellCar(save(), "ford-f100");
    const forSale = CARS.filter((c) => !ownedIds(s).includes(c.id)).map((c) => c.id);
    expect(forSale).toContain("ford-f100");
  });
});

describe("buying", () => {
  it("refuses when you are short", () => {
    const s = save({ credits: 10 });
    expect(buyCar(s, "bmw-m5-e60", priceOf(m5), 0)).toBe(s);
  });

  it("refuses a car you already own", () => {
    const s = save();
    expect(buyCar(s, "ford-f100", 1, 0)).toBe(s);
  });

  it("refuses a car that is not in the catalogue", () => {
    const s = save();
    expect(buyCar(s, "ghost-car", 1, 0)).toBe(s);
  });

  it("charges exactly the price it was shown at", () => {
    const s = save({ credits: 500_000 });
    const price = priceOf(m5);
    const after = buyCar(s, "bmw-m5-e60", price, 42_000);
    expect(after.credits).toBe(s.credits - price);
    expect(ownedIds(after)).toContain("bmw-m5-e60");
    // and the odometer it was sold with came along
    expect(after.owned.at(-1)).toEqual({ id: "bmw-m5-e60", km: 42_000 });
  });
});
