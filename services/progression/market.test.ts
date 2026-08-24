import { describe, it, expect } from "vitest";
import { RARITIES } from "@contracts/car";
import { levelOf, PART_IDS } from "@contracts/mods";
import { CARS } from "@catalog/cars";
import { ratingOf } from "@catalog/rating";
import { buyCar, priceOf, sellValueFor, SELL_RATE } from "./economy";
import { priceWithKm } from "./mileage";
import { modCount, modsValue } from "./mods";
import { SAVE_VERSION, modsOf, type Save } from "./save";
import {
  DEALERS,
  DEALER_PERIOD,
  LOT_SIZE,
  MODDED_CHANCE,
  MODDED_MAX_LEVEL,
  MODDED_MAX_PARTS,
  ORDINARY,
  SCARCE,
  SHOWPIECE_CHANCE,
  USED_RATE,
  dealerById,
  dealerEra,
  isShowpiece,
  onFloor,
  racesToRotation,
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

  /**
   * There is deliberately NO rule that every car is on some forecourt.
   *
   * There was one, and it was the wrong shape: it made "you can walk into a
   * shop and buy this" a property of every car in the catalogue, which forecloses
   * the thing a collection game most wants to be able to say -- that some car is
   * hard to come by. A car nobody stocks, that you have to wait for the
   * Marketplace to turn up, is a feature; a rule that forbids it is a rule
   * against ever having one.
   *
   * What has to stay true is weaker and is the thing actually worth protecting:
   * every car can be got hold of SOMEHOW. A car that no forecourt carries and
   * that the lot cannot draw is not rare, it is missing.
   */
  it("can sell you every car in the catalogue, one way or another", () => {
    const reachable = new Set<string>();
    for (const d of DEALERS) for (const o of stockOf(d)) reachable.add(o.spec.id);
    for (let seed = 0; seed < 400; seed++) {
      for (const o of usedLot(seed)) reachable.add(o.spec.id);
    }
    for (const car of CARS) {
      expect(reachable.has(car.id), `${car.id} cannot be bought anywhere`).toBe(true);
    }
  });

  /**
   * And this is what makes a forecourt gap SAFE to open.
   *
   * The rule above allows a car that no dealer carries, on the understanding
   * that the lot can still find it. That understanding is only worth anything
   * if the lot really does reach every tier -- the scarcest included, which is
   * the one a gap would be opened on. If `unique` ever stopped turning up
   * second-hand, taking the F40 off Recoleta's floor would quietly make it
   * unobtainable rather than rare.
   */
  it("puts every tier within reach of the used lot, scarcest included", () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 400; seed++) {
      for (const o of usedLot(seed)) seen.add(o.spec.rarity);
    }
    for (const r of RARITIES) {
      const exists = CARS.some((c) => c.rarity === r);
      if (!exists) continue;
      expect(seen.has(r), `no ${r} car ever turns up second-hand`).toBe(true);
    }
  });

  it("gives each dealer something to sell, in every rotation", () => {
    // across eras, not just era 0: a showpiece comes and goes, and a house
    // whose floor could empty out would render "0 autos · desde 0 cr"
    for (let era = 0; era < 60; era++) {
      for (const d of DEALERS) {
        expect(stockOf(d, era).length, `${d.id} is empty in era ${era}`).toBeGreaterThan(0);
      }
    }
  });

  it("sells the right something", () => {
    const exclusivos = dealerById("exclusivos")!;
    // the F40 is on the ROSTER always; whether it is on the floor is a roll,
    // so this asks the predicate rather than one era's stock
    expect(CARS.filter((c) => exclusivos.carries(c)).map((c) => c.id)).toContain("ferrari-f40");
    for (let era = 0; era < 20; era++) {
      for (const { spec: c } of stockOf(exclusivos, era)) {
        expect(c.cls === "supercar" || SCARCE.includes(c.rarity), c.id).toBe(true);
      }
    }

    const beto = dealerById("donbeto")!;
    for (const { spec: c } of stockOf(beto)) expect(ORDINARY, c.id).toContain(c.rarity);
    // and Don Beto is not quietly selling an F40
    expect(stockOf(beto).map((o) => o.spec.id)).not.toContain("ferrari-f40");
  });

  /**
   * The two corrections that moved these cuts off `priceOf`, as tests.
   *
   * Both were the same bug: priceOf is mostly rarity with a nudge from the
   * class index, so cutting on price meant a car's LAP TIME could push it off a
   * forecourt. A slow vrare is still a hard car to find and a quick uncommon is
   * still an ordinary car, and neither shop should care how they go.
   *
   * The awkward cases are built by taking the catalogue's fastest and slowest
   * cars and RELABELLING them -- real physics, one field changed. Inventing a
   * spec instead does not work and is worth knowing why: `derive` refuses a car
   * whose power and top speed disagree, so a made-up 300 kW / 900 kg body with
   * someone else's top speed throws on import rather than reaching the dealer.
   * Changing only the tier is also the honest experiment: it isolates the one
   * variable, and what is being asked is whether the predicate reads it.
   */
  const byIndex = [...CARS].sort((a, b) => ratingOf(a).index - ratingOf(b).index);
  const slowest = byIndex[0]!;
  const quickest = byIndex.at(-1)!;

  it("keeps a slow vrare on the exclusive floor, because scarce is not fast", () => {
    const slow = { ...slowest, id: "slow-vrare", rarity: "vrare" as const };
    expect(dealerById("exclusivos")!.carries(slow)).toBe(true);
    // and it is genuinely slow enough that the old price floor would have
    // dropped it: this is the case that used to fall off the forecourt
    expect(priceOf(slow)).toBeLessThan(150_000);
  });

  it("keeps a quick uncommon in the cheap yard, because ordinary is not slow", () => {
    const quick = { ...quickest, id: "quick-uncommon", rarity: "uncommon" as const };
    expect(dealerById("donbeto")!.carries(quick)).toBe(true);
    // and quick enough that the old price ceiling would have dropped it
    expect(priceOf(quick)).toBeGreaterThan(35_000);
  });
});

/**
 * The showpiece: a car a forecourt deals in but only sometimes HAS.
 *
 * This is what finally makes rarity do something other than move a price. An
 * `exclusive` or a `unique` is on the roster forever and on the floor some
 * rotations, so walking into Recoleta is a question with an answer that
 * changes -- rather than a menu where the F40 has been sitting since the day
 * you started.
 */
describe("what is actually on the floor", () => {
  const f40 = CARS.find((c) => c.id === "ferrari-f40")!;
  const eras = (spec: typeof f40, n = 400) =>
    Array.from({ length: n }, (_, era) => onFloor(spec, era));

  it("leaves an ordinary car on the floor every single rotation", () => {
    for (const c of CARS.filter((x) => !isShowpiece(x))) {
      expect(eras(c, 60).every(Boolean), `${c.id} went missing`).toBe(true);
    }
  });

  it("brings a showpiece and takes it away again", () => {
    for (const c of CARS.filter(isShowpiece)) {
      const on = eras(c);
      expect(on.some(Boolean), `${c.id} is never in stock`).toBe(true);
      expect(on.some((x) => !x), `${c.id} is always in stock`).toBe(true);
    }
  });

  it("at roughly the rate its tier claims", () => {
    for (const c of CARS.filter(isShowpiece)) {
      const rate = eras(c).filter(Boolean).length / 400;
      const want = SHOWPIECE_CHANCE[c.rarity]!;
      // a real sample around the roll, not a mean pinned to three decimals
      expect(rate, `${c.id} at ${rate}`).toBeGreaterThan(want * 0.6);
      expect(rate, `${c.id} at ${rate}`).toBeLessThan(want * 1.4);
    }
  });

  it("makes the top of the catalogue scarcer than the tier below it", () => {
    // the ladder has to point the right way, or the roll is decoration
    expect(SHOWPIECE_CHANCE.unique!).toBeLessThan(SHOWPIECE_CHANCE.exclusive!);
  });

  it("gives the same answer every time you look, within one rotation", () => {
    for (let era = 0; era < 40; era++) {
      expect(onFloor(f40, era)).toBe(onFloor(f40, era));
      const a = stockOf(dealerById("exclusivos")!, era).map((o) => o.spec.id);
      const b = stockOf(dealerById("exclusivos")!, era).map((o) => o.spec.id);
      expect(a).toEqual(b);
    }
  });

  /**
   * Every house that deals in a car agrees about whether there is one around.
   *
   * The roll is salted with the car and the era and deliberately NOT with the
   * dealer. Rolling per dealer would put the M3 E30 on Panamericana's floor and
   * not on Recoleta's in the same rotation, which reads as a bug rather than as
   * scarcity -- and would halve the effect, since a car carried by two houses
   * would get two chances to appear.
   */
  it("is one answer per car, not one per house", () => {
    const shared = CARS.filter(
      (c) => isShowpiece(c) && DEALERS.filter((d) => d.carries(c)).length > 1,
    );
    expect(shared.length, "no showpiece is carried by two houses").toBeGreaterThan(0);
    for (const c of shared) {
      for (let era = 0; era < 40; era++) {
        const houses = DEALERS.filter((d) => d.carries(c));
        const listed = houses.map((d) => stockOf(d, era).some((o) => o.spec.id === c.id));
        expect(new Set(listed).size, `${c.id} disagrees in era ${era}`).toBe(1);
      }
    }
  });

  /**
   * And the safety net under all of it.
   *
   * A car that is off the forecourt this rotation is scarce; a car with no way
   * to be bought at all is missing. The Marketplace draws from the whole
   * catalogue and does not care about eras, so it is the floor under the roll.
   */
  it("never leaves a showpiece unbuyable, because the lot does not roll", () => {
    const viaLot = new Set<string>();
    for (let seed = 0; seed < 400; seed++) {
      for (const o of usedLot(seed)) viaLot.add(o.spec.id);
    }
    for (const c of CARS.filter(isShowpiece)) {
      expect(viaLot.has(c.id), `${c.id} is only ever on a forecourt roll`).toBe(true);
    }
  });

  /**
   * A dealer no longer hides what you own, and that is deliberate.
   *
   * It used to take your garage and subtract it, which was the shop enforcing
   * something the GARAGE could not do: hold two of a model. It can now, and a
   * second unit is a thing to want, so the forecourt carries the same list
   * whatever is in your garage. The roster is a fact about the dealer.
   *
   * Stated as an EQUALITY against roster-minus-the-floor-roll rather than as
   * "it does not read your garage", because that is the stronger claim and the
   * one that stays honest: there are exactly two things that decide what is on
   * a forecourt, and neither of them is you.
   */
  it("lists the roster minus the floor roll, and nothing else", () => {
    for (let era = 0; era < 20; era++) {
      for (const d of DEALERS) {
        const listed = stockOf(d, era).map((o) => o.spec.id);
        expect(listed).toEqual(
          CARS.filter((c) => d.carries(c) && onFloor(c, era)).map((c) => c.id),
        );
      }
    }
  });
});

/**
 * The forecourts turning over.
 *
 * The concesionaria's promise is "the car you want is here at a price you can
 * plan for", and rotation must not break it -- so what changes is the UNIT, not
 * the roster. Same models forever, a different example of each every
 * DEALER_PERIOD races.
 */
describe("the dealer rotation", () => {
  const pacheco = dealerById("pacheco")!;

  it("counts eras off the game's one clock, at a slower rate than the lot", () => {
    expect(DEALER_PERIOD).toBeGreaterThan(1);
    expect(dealerEra(0)).toBe(0);
    expect(dealerEra(DEALER_PERIOD - 1)).toBe(0);
    expect(dealerEra(DEALER_PERIOD)).toBe(1);
    expect(dealerEra(DEALER_PERIOD * 3 + 2)).toBe(3);
  });

  it("counts down to the change, and never says zero races left", () => {
    for (let clock = 0; clock < DEALER_PERIOD * 4; clock++) {
      const left = racesToRotation(clock);
      expect(left).toBeGreaterThan(0);
      expect(left).toBeLessThanOrEqual(DEALER_PERIOD);
      // the honest promise: racing that many times lands you in the next era
      expect(dealerEra(clock + left)).toBe(dealerEra(clock) + 1);
      expect(dealerEra(clock + left - 1)).toBe(dealerEra(clock));
    }
  });

  it("is the same floor every time you look, within one era", () => {
    const a = stockOf(pacheco, 3);
    const b = stockOf(pacheco, 3);
    expect(a.map((o) => `${o.spec.id}|${o.km}|${o.color}|${o.price}`)).toEqual(
      b.map((o) => `${o.spec.id}|${o.km}|${o.color}|${o.price}`),
    );
  });

  it("keeps the same cars but changes which ones, era to era", () => {
    const before = stockOf(pacheco, 0);
    const after = stockOf(pacheco, 1);
    // the roster is the promise: the car you were saving for is still here
    expect(after.map((o) => o.spec.id)).toEqual(before.map((o) => o.spec.id));
    // and the units are not the same units
    const moved = before.filter((o, i) => o.km !== after[i]!.km).length;
    expect(moved).toBeGreaterThan(before.length / 2);
  });

  it("turns over on every dealer at once, not one at a time", () => {
    for (const d of DEALERS) {
      const before = stockOf(d, 7).map((o) => o.km).join("|");
      const after = stockOf(d, 8).map((o) => o.km).join("|");
      expect(after, `${d.id} did not turn over`).not.toBe(before);
    }
  });

  /*
   * The prices have to stay honest across every rotation, not only at era 0.
   * A dealer listing below what the trade pays for the same object is the money
   * printer USED_RATE exists to close, and a new odometer every five races is a
   * new chance to land on one.
   */
  it("never lists below what selling that same car pays back, in any era", () => {
    for (let era = 0; era < 12; era++) {
      for (const d of DEALERS) {
        for (const o of stockOf(d, era)) {
          expect(o.price, `${o.spec.id} at ${d.id} era ${era} is an arbitrage`).toBeGreaterThan(
            sellValueFor(o.spec, o.km),
          );
        }
      }
    }
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

  /*
   * It used to skip anything in your garage. It does not any more, for the
   * reason stockOf does not: a private sale is the most natural place in the
   * game to find a SECOND one of something, with its own kilometres and
   * somebody else's turbo on it. The side effect is the assertion below -- the
   * lot stays six deep late in the game rather than thinning as you buy the
   * catalogue, which is what the old "still fills a lot" test was worrying at.
   */
  it("draws from the whole catalogue, however much of it you own", () => {
    for (let seed = 0; seed < 40; seed++) {
      expect(usedLot(seed)).toHaveLength(LOT_SIZE);
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
      nextUid: 1,
      racesRun: 0,
      lotNudge: 0,
    };
    const after = buyCar(save, o.spec.id, o.price, o.km, o.color, o.mods);
    expect(after).not.toBe(save);
    expect(modsOf(after, after.owned[0]!.uid)).toEqual(o.mods);
    expect(after.credits).toBe(save.credits - o.price);
  });

  /** And a stock car writes no `mods` key at all -- absent, never `{}`. */
  it("leaves a stock purchase with no mods field", () => {
    const o = lots(50).find((x) => modCount(x.mods) === 0)!;
    const save: Save = {
      version: SAVE_VERSION,
      credits: 5_000_000,
      owned: [],
      nextUid: 1,
      racesRun: 0,
      lotNudge: 0,
    };
    const after = buyCar(save, o.spec.id, o.price, o.km, o.color, o.mods);
    expect(after.owned[0]).not.toHaveProperty("mods");
  });
});
