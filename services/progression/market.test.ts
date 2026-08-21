import { describe, it, expect } from "vitest";
import { CARS } from "@catalog/cars";
import { priceOf, sellValueFor, SELL_RATE } from "./economy";
import {
  DEALERS,
  LOT_SIZE,
  USED_RATE,
  dealerById,
  stockOf,
  usedLot,
  usedPriceOf,
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
    expect(stockOf(exclusivos).map((c) => c.id)).toContain("ferrari-f40");
    for (const c of stockOf(exclusivos)) {
      expect(c.cls === "supercar" || priceOf(c) >= 150_000).toBe(true);
    }

    const beto = dealerById("donbeto")!;
    for (const c of stockOf(beto)) expect(priceOf(c)).toBeLessThanOrEqual(35_000);
    // and Don Beto is not quietly selling an F40
    expect(stockOf(beto).map((c) => c.id)).not.toContain("ferrari-f40");
  });

  it("hides what you already own", () => {
    const d = dealerById("pacheco")!;
    const all = stockOf(d);
    const one = all[0]!;
    const after = stockOf(d, [one.id]);
    expect(after).toHaveLength(all.length - 1);
    expect(after.map((c) => c.id)).not.toContain(one.id);
  });
});

describe("used pricing", () => {
  it("is cheaper than new", () => {
    for (const c of CARS) expect(usedPriceOf(c)).toBeLessThan(priceOf(c));
  });

  /**
   * The one that matters. If a used car costs less than the catalogue pays to
   * buy it back, the loop buy-used -> sell -> repeat prints credits forever.
   */
  it("never sells below what selling pays back", () => {
    expect(USED_RATE).toBeGreaterThan(SELL_RATE);
    for (const c of CARS) {
      expect(usedPriceOf(c), `${c.id} is an arbitrage`).toBeGreaterThan(sellValueFor(c));
    }
  });

  it("loses you money on a round trip, by about a tenth of new", () => {
    for (const c of CARS) {
      const loss = usedPriceOf(c) - sellValueFor(c);
      expect(loss / priceOf(c)).toBeGreaterThan(0.05);
      expect(loss / priceOf(c)).toBeLessThan(0.15);
    }
  });
});

describe("the used lot", () => {
  it("is the same list every time for a given rotation", () => {
    for (const seed of [0, 1, 7, 42]) {
      expect(usedLot(seed).map((c) => c.id)).toEqual(usedLot(seed).map((c) => c.id));
    }
  });

  it("turns over when the seed does", () => {
    const lots = [0, 1, 2, 3, 4].map((s) => usedLot(s).map((c) => c.id).join("|"));
    expect(new Set(lots).size).toBeGreaterThan(1);
  });

  it("fills the lot and never repeats a car within it", () => {
    for (let seed = 0; seed < 40; seed++) {
      const lot = usedLot(seed);
      expect(lot).toHaveLength(LOT_SIZE);
      expect(new Set(lot.map((c) => c.id)).size).toBe(LOT_SIZE);
    }
  });

  it("never lists a car you own", () => {
    const owned = CARS.slice(0, 5).map((c) => c.id);
    for (let seed = 0; seed < 20; seed++) {
      for (const c of usedLot(seed, owned)) expect(owned).not.toContain(c.id);
    }
  });

  it("is mostly junk, with a treasure now and then", () => {
    // "mostly shitty but a little treasure from time to time" as a number:
    // across many rotations, most lots are all-common and a minority are not
    let withTreasure = 0;
    const N = 200;
    for (let seed = 0; seed < N; seed++) {
      const lot = usedLot(seed);
      if (lot.some((c) => !["common", "uncommon"].includes(c.rarity))) withTreasure++;
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
    for (const c of lot) expect(owned).not.toContain(c.id);
  });
});
