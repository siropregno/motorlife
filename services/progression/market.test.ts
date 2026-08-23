import { describe, it, expect } from "vitest";
import { levelOf, PART_IDS } from "@contracts/mods";
import { CARS } from "@catalog/cars";
import { buyCar, priceOf, sellValueFor, SELL_RATE } from "./economy";
import { priceWithKm } from "./mileage";
import { modCount, modsValue } from "./mods";
import { SAVE_VERSION, modsOwned, type Save } from "./save";
import {
  DEALERS,
  LOT_SIZE,
  MODDED_CHANCE,
  MODDED_MAX_LEVEL,
  MODDED_MAX_PARTS,
  USED_RATE,
  dealerById,
  stockOf,
  usedLot,
} from "./market";

describe("dealers", () => {
  it("has a stable id, name and tagline for each", () => {
    expect(DEALERS.length).toBeGreaterThan(1);
    const ids = DEALERS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const d of DEALERS) {
      expect(d.name.length).toBeGreaterThan(0);
      expect(d.tagline.length).toBeGreaterThan(0);
      expect(dealerById(d.id)).toBe(d);
    }
    expect(dealerById("nothing-here")).toBeUndefined();
  });

  it("puts every car on at least one forecourt", () => {
    // the point of predicates over hand-written rosters: a new car cannot end
    // up for sale nowhere
    for (const car of CARS) {
      const where = DEALERS.filter((d) => d.carries(car)).map((d) => d.id);
      expect(where.length, `${car.id} is at no dealer`).toBeGreaterThan(0);
    }
  });

  it("gives each dealer something to sell, and the right something", () => {
    for (const d of DEALERS) expect(stockOf(d).length).toBeGreaterThan(0);

    const exclusivos = dealerById("exclusivos")!;
    expect(stockOf(exclusivos).map((o) => o.spec.id)).toContain("ferrari-f40");
    for (const { spec: c } of stockOf(exclusivos)) {
      expect(c.cls === "supercar" || priceOf(c) >= 150_000).toBe(true);
    }

    const beto = dealerById("donbeto")!;
    for (const { spec: c } of stockOf(beto)) expect(priceOf(c)).toBeLessThanOrEqual(35_000);
    // and Don Beto is not quietly selling an F40
    expect(stockOf(beto).map((o) => o.spec.id)).not.toContain("ferrari-f40");
  });

  it("hides what you already own", () => {
    const d = dealerById("pacheco")!;
    const all = stockOf(d);
    const one = all[0]!.spec;
    const after = stockOf(d, [one.id]);
    expect(after).toHaveLength(all.length - 1);
    expect(after.map((o) => o.spec.id)).not.toContain(one.id);
  });
});

describe("used pricing", () => {
  it("is cheaper than the same car at the same odometer new", () => {
    expect(USED_RATE).toBeLessThan(1);
    for (let seed = 0; seed < 20; seed++) {
      for (const o of usedLot(seed)) {
        expect(o.price).toBeLessThan(priceWithKm(priceOf(o.spec), o.spec, o.km));
      }
    }
  });

  /**
   * The one that matters, and the reason km had to go into the save.
   *
   * If any listing anywhere costs less than the trade pays to take it back,
   * the loop buy, sell, repeat prints credits forever. This walks REAL offers
   * rather than a hypothetical price, because the exploit would live in a
   * listing, not in a formula.
   */
  it("never lists a car below what selling that same car pays back", () => {
    expect(USED_RATE).toBeGreaterThan(SELL_RATE);
    for (let seed = 0; seed < 30; seed++) {
      for (const o of usedLot(seed)) {
        // with its parts on both sides -- see the round-trip test below for why
        expect(o.price, `${o.spec.id} @ ${o.km} km is an arbitrage`).toBeGreaterThan(
          sellValueFor(o.spec, o.km, o.mods),
        );
      }
    }
    for (const d of DEALERS) {
      for (const o of stockOf(d)) {
        expect(o.price, `${o.spec.id} at ${d.id} is an arbitrage`).toBeGreaterThan(
          sellValueFor(o.spec, o.km),
        );
      }
    }
  });

  /**
   * A round trip prices the SAME OBJECT on both sides, parts included.
   *
   * `sellValueFor(spec, km, o.mods)` rather than `sellValueFor(spec, km)`: a
   * Marketplace car can come with a turbo on it and the listing charged for it,
   * so quoting the sale against a stock car is comparing a modified car's price
   * to an unmodified car's trade-in. That reads as a 26% loss on a listing that
   * actually loses 15, and it is the same class of mistake -- pricing two
   * different objects -- that km being in the save exists to prevent.
   */
  it("loses you money on a round trip whatever the odometer", () => {
    for (let seed = 0; seed < 20; seed++) {
      for (const o of usedLot(seed)) {
        const loss = o.price - sellValueFor(o.spec, o.km, o.mods);
        expect(loss).toBeGreaterThan(0);
        expect(loss / o.price).toBeLessThan(0.25);
      }
    }
  });

  /** A shed-kept car costs MORE, which is the whole point of the feature. */
  it("charges a premium for a survivor even second hand", () => {
    const seen: number[] = [];
    for (let seed = 0; seed < 200; seed++) {
      for (const o of usedLot(seed)) {
        if (o.condition.band === "survivor") {
          seen.push(o.price / (priceOf(o.spec) * USED_RATE));
        }
      }
    }
    expect(seen.length).toBeGreaterThan(0);
    for (const r of seen) expect(r).toBeGreaterThan(1.3);
  });
});

describe("the used lot", () => {
  it("is the same list every time for a given rotation", () => {
    for (const seed of [0, 1, 7, 42]) {
      expect(usedLot(seed).map((o) => o.spec.id)).toEqual(usedLot(seed).map((o) => o.spec.id));
    }
  });

  it("turns over when the seed does", () => {
    const lots = [0, 1, 2, 3, 4].map((s) => usedLot(s).map((o) => o.spec.id).join("|"));
    expect(new Set(lots).size).toBeGreaterThan(1);
  });

  it("fills the lot and never repeats a car within it", () => {
    for (let seed = 0; seed < 40; seed++) {
      const lot = usedLot(seed);
      expect(lot).toHaveLength(LOT_SIZE);
      expect(new Set(lot.map((o) => o.spec.id)).size).toBe(LOT_SIZE);
    }
  });

  it("never lists a car you own", () => {
    const owned = CARS.slice(0, 5).map((c) => c.id);
    for (let seed = 0; seed < 20; seed++) {
      for (const o of usedLot(seed, owned)) expect(owned).not.toContain(o.spec.id);
    }
  });

  it("is mostly junk, with a treasure now and then", () => {
    // "mostly shitty but a little treasure from time to time" as a number:
    // across many rotations, most lots are all-common and a minority are not
    let withTreasure = 0;
    const N = 200;
    for (let seed = 0; seed < N; seed++) {
      const lot = usedLot(seed);
      if (lot.some((o) => !["common", "uncommon"].includes(o.spec.rarity))) withTreasure++;
    }
    expect(withTreasure).toBeGreaterThan(N * 0.15);
    expect(withTreasure).toBeLessThan(N * 0.5);
  });

  it("still fills a lot when the cheap half of the catalogue is owned", () => {
    // late game: everything common is in your garage already
    const owned = CARS.filter((c) => c.rarity === "common" || c.rarity === "uncommon").map(
      (c) => c.id,
    );
    const lot = usedLot(3, owned);
    expect(lot.length).toBeGreaterThan(0);
    for (const o of lot) expect(owned).not.toContain(o.spec.id);
  });
});

/**
 * Cars somebody had already worked on.
 *
 * The Marketplace is a private sale, so a listing can arrive with parts on it.
 * These pin the three things that make that safe rather than exploitable: it
 * stays rare, it stays modest, and it is PAID FOR.
 */
describe("modified listings", () => {
  const lots = (n: number) =>
    Array.from({ length: n }, (_, seed) => usedLot(seed)).flat();

  it("turns up now and then, not on most of the lot", () => {
    const all = lots(300);
    const modded = all.filter((o) => modCount(o.mods) > 0);
    const rate = modded.length / all.length;
    expect(modded.length).toBeGreaterThan(0);
    // the roll is MODDED_CHANCE per car; allow real spread around it rather
    // than pinning a sample mean to three decimals
    expect(rate).toBeGreaterThan(MODDED_CHANCE * 0.6);
    expect(rate).toBeLessThan(MODDED_CHANCE * 1.4);
  });

  /**
   * The ceiling that keeps the workshop worth visiting.
   *
   * A full racing build at 70% of list would be strictly better than building
   * the car yourself, which turns the taller into a screen you visit once to
   * confirm you should have waited for the lot to rotate.
   */
  it("never carries a full build, and never competición", () => {
    for (const o of lots(300)) {
      const fitted = modCount(o.mods);
      expect(fitted).toBeLessThanOrEqual(MODDED_MAX_PARTS);
      for (const part of PART_IDS) {
        expect(levelOf(o.mods, part), `${o.spec.id} ${part}`).toBeLessThanOrEqual(
          MODDED_MAX_LEVEL,
        );
      }
    }
  });

  /**
   * A listing with parts costs MORE than the same car without them, by exactly
   * what the trade pays for those parts.
   *
   * Charging less would be the arbitrage USED_RATE exists to close, smuggled in
   * through the workshop: buy the car at 70%, sell it with a build the trade
   * pays 35% of list for. Charging exactly modsValue keeps the round trip
   * losing the same fraction it loses on a stock car, which is what the
   * round-trip test measures.
   */
  it("charges for the parts, at what the trade pays for them", () => {
    const modded = lots(300).filter((o) => modCount(o.mods) > 0);
    expect(modded.length).toBeGreaterThan(0);
    for (const o of modded) {
      const parts = modsValue(o.spec, o.km, o.mods);
      expect(parts, `${o.spec.id} parts are free`).toBeGreaterThan(0);
      const stock = Math.round((priceWithKm(priceOf(o.spec), o.spec, o.km) * USED_RATE) / 100) * 100;
      expect(o.price).toBe(stock + parts);
    }
  });

  /** A dealer sells what the factory built. */
  it("never turns up on a concesionaria's floor", () => {
    for (const d of DEALERS) {
      for (const o of stockOf(d)) expect(o.mods).toBeUndefined();
    }
  });

  /**
   * The engine is NOT rebuilt.
   *
   * `wearKm` absent means "the engine has done the car's own km", which is the
   * honest reading of a used car nobody has rectified. Setting it to 0 would
   * hand every modified listing a free rebuild -- worth more than the parts,
   * and paid for by nobody.
   */
  it("does not quietly hand over a fresh engine", () => {
    for (const o of lots(300)) {
      if (o.mods) expect(o.mods.wearKm).toBeUndefined();
    }
  });

  /**
   * The lot is a thing players learn. Adding parts must not have reshuffled
   * WHICH cars are on any rotation -- see the second-pass comment in usedLot.
   */
  it("is still the same list of cars every time for a given rotation", () => {
    for (const seed of [0, 1, 7, 42]) {
      const a = usedLot(seed);
      const b = usedLot(seed);
      expect(a.map((o) => o.spec.id)).toEqual(b.map((o) => o.spec.id));
      expect(a.map((o) => JSON.stringify(o.mods ?? null))).toEqual(
        b.map((o) => JSON.stringify(o.mods ?? null)),
      );
    }
  });

  /**
   * The whole point of the feature reaching the garage: you paid for a turbo,
   * you own a turbo.
   */
  it("puts the parts in the save when you buy one", () => {
    const o = lots(300).find((x) => modCount(x.mods) > 0)!;
    const save: Save = {
      version: SAVE_VERSION,
      credits: 5_000_000,
      owned: [],
      racesRun: 0,
    };
    const after = buyCar(save, o.spec.id, o.price, o.km, o.color, o.mods);
    expect(after).not.toBe(save);
    expect(modsOwned(after, o.spec.id)).toEqual(o.mods);
    expect(after.credits).toBe(save.credits - o.price);
  });

  /** And a stock car writes no `mods` key at all -- absent, never `{}`. */
  it("leaves a stock purchase with no mods field", () => {
    const o = lots(50).find((x) => modCount(x.mods) === 0)!;
    const save: Save = {
      version: SAVE_VERSION,
      credits: 5_000_000,
      owned: [],
      racesRun: 0,
    };
    const after = buyCar(save, o.spec.id, o.price, o.km, o.color, o.mods);
    expect(after.owned[0]).not.toHaveProperty("mods");
  });
});
