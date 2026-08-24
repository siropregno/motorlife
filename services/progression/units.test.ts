import { describe, it, expect } from "vitest";
import { CARS } from "@catalog/cars";
import { ratingOf } from "@catalog/rating";
import { buyCar, installPart, rebuildEngine, repaintCar, sellCar, sellValueFor } from "./economy";
import { colorsOf } from "./paint";
import { dealerById, dealerEra, stockOf, usedLot } from "./market";
import {
  SAVE_VERSION,
  countOwned,
  heldOf,
  ownedIds,
  type Save,
} from "./save";

/**
 * Two of the same car.
 *
 * The other files here each test one function. This one tests the FEATURE, by
 * walking the thing a player actually does: you already have a Falcon, you buy
 * a second one, you build that one for a circuit, and the first one has to come
 * out the far end exactly as it went in.
 *
 * Every step of it was broken before uids, and broken quietly -- the garage was
 * a list keyed by model, so `owned.find(o => o.id === id)` answered "the first
 * Falcon" to every question about either of them. Nothing threw. You paid for a
 * turbo and it appeared on the wrong car; you sold one and both left; you
 * painted one and the garage changed colour. That is why this file exists as a
 * journey rather than as more unit tests: the failure was never in one function,
 * it was in what the whole chain agreed a car was.
 */

const FALCON = "ford-falcon-sprint";
const falcon = CARS.find((c) => c.id === FALCON)!;
/**
 * The Falcon's palette, asserted rather than assumed.
 *
 * Three of these tests tell the two units apart by their paint, so a Falcon
 * that lost its colours would turn every one of them into a comparison of
 * `undefined` with `undefined` -- passing while checking nothing.
 */
const PAINT = colorsOf(falcon);
if (PAINT.length < 2) throw new Error(`${FALCON} needs at least two colours for these tests`);

const fresh = (): Save => ({
  version: SAVE_VERSION,
  credits: 2_000_000,
  nextUid: 2,
  owned: [{ uid: "1", id: FALCON, km: 300_000, color: PAINT[0]! }],
  racesRun: 0,
  lotNudge: 0,
});

describe("owning two of one model", () => {
  it("walks the whole errand without either car touching the other", () => {
    const start = fresh();

    // 1. buy the second one. A tidier example: half the kilometres.
    const bought = buyCar(start, FALCON, 40_000, 40_000, PAINT[1]!);
    expect(bought).not.toBe(start);
    expect(countOwned(bought, FALCON)).toBe(2);

    const [old_, young] = bought.owned;
    expect(old_!.uid).not.toBe(young!.uid);
    const KEEP = old_!.uid;
    const BUILD = young!.uid;

    // 2. build the new one. The tired one must not gain a turbo it never
    //    got, and must not be charged for one.
    const tuned = installPart(bought, BUILD, "turbo", 3);
    expect(heldOf(tuned, BUILD)?.mods?.turbo).toBe(3);
    expect(heldOf(tuned, KEEP)?.mods).toBeUndefined();

    // 3. rectify its engine. Same again: one engine, not both.
    const rebuilt = rebuildEngine(tuned, BUILD);
    expect(heldOf(rebuilt, BUILD)?.mods?.wearKm).toBe(0);
    expect(heldOf(rebuilt, KEEP)?.mods).toBeUndefined();

    // 4. paint it. The garage does not change colour.
    const painted = repaintCar(rebuilt, BUILD, PAINT[2] ?? PAINT[0]!);
    expect(heldOf(painted, KEEP)?.color).toBe(PAINT[0]);

    // 5. the two are now genuinely different cars, and they rate differently
    const a = heldOf(painted, KEEP)!;
    const b = heldOf(painted, BUILD)!;
    expect(ratingOf(falcon, b.mods, b.km).index).toBeGreaterThan(
      ratingOf(falcon, a.mods, a.km).index,
    );

    // 6. sell the tired one. ONE car leaves, and the money is for that one.
    const sold = sellCar(painted, KEEP);
    expect(sold.owned).toHaveLength(1);
    expect(sold.owned[0]!.uid).toBe(BUILD);
    expect(sold.credits).toBe(painted.credits + sellValueFor(falcon, a.km, a.mods));

    // 7. and the survivor kept everything that was done to it
    expect(heldOf(sold, BUILD)?.mods?.turbo).toBe(3);
    expect(heldOf(sold, BUILD)?.km).toBe(40_000);
  });

  /**
   * The pair has to survive a trip through storage.
   *
   * Everything above works on values in memory. The save is JSON, and a uid
   * that did not round-trip would put both cars back behind one name on the
   * next reload -- which is the original bug, arriving a page refresh later.
   */
  it("survives being written and read back", () => {
    const two = buyCar(fresh(), FALCON, 40_000, 40_000);
    const back = JSON.parse(JSON.stringify(two)) as Save;
    expect(back.owned.map((o) => o.uid)).toEqual(two.owned.map((o) => o.uid));
    expect(new Set(back.owned.map((o) => o.uid)).size).toBe(2);
    expect(ownedIds(back)).toEqual([FALCON, FALCON]);
  });

  /**
   * Both forecourts will actually sell you the second one.
   *
   * The service-level rule is in market.test.ts; this is the thing that makes
   * the feature reachable rather than merely representable. Without it, a
   * garage that CAN hold two and a shop that will not sell you a second is a
   * data model with no way in.
   */
  it("is reachable from a forecourt you already bought from", () => {
    const owned = fresh();
    const era = dealerEra(owned.racesRun + owned.lotNudge);
    for (const id of ["pacheco", "donbeto", "panamericana", "exclusivos"]) {
      const d = dealerById(id)!;
      if (!d.carries(falcon)) continue;
      expect(stockOf(d, era).map((o) => o.spec.id)).toContain(FALCON);
    }
  });

  it("and the Marketplace can list a car that is already in your garage", () => {
    // it no longer subtracts your garage, so over enough rotations the car you
    // own turns up second-hand -- with somebody else's kilometres on it
    let seen = 0;
    for (let seed = 0; seed < 200; seed++) {
      if (usedLot(seed).some((o) => o.spec.id === FALCON)) seen++;
    }
    expect(seen).toBeGreaterThan(0);
  });

  /**
   * The one number that must NOT move.
   *
   * A duplicate has to be a thing you want, never a thing you farm. Both sides
   * of a trade price (spec, km, mods), so the second unit loses exactly the
   * spread the first one did -- there is no discount for repetition and no
   * bonus for it.
   */
  it("prices the second one exactly like the first", () => {
    const one = buyCar(fresh(), FALCON, 40_000, 40_000);
    const two = buyCar(one, FALCON, 40_000, 40_000);
    const a = two.owned[1]!;
    const b = two.owned[2]!;
    expect(sellValueFor(falcon, a.km, a.mods)).toBe(sellValueFor(falcon, b.km, b.mods));
    // and selling either one back still loses the spread
    expect(sellValueFor(falcon, 40_000)).toBeLessThan(40_000);
  });
});
