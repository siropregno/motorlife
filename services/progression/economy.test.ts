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
  repaintCar,
  repaintPriceFor,
  REPAINT_FLOOR,
} from "./economy";
import type { Save } from "./save";
import { ownedIds, colorOf, colorOfHeld, countOwned, heldOf } from "./save";
import { colorsOf, imageFor, PHOTO_EXT } from "./paint";
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

  /*
   * The 607 in Siro's garage came up blank while the same car on the forecourt
   * had paint on it. v2ToV3 coloured every car in the garage the day colour
   * arrived, but it runs once -- this car was bought AFTER that, back when its
   * model still had no photos, so it was stored with no colour and the save was
   * already v3 by the time the art landed. Nothing was ever going to revisit it.
   *
   * The catalogue is the test rather than the 607, because this is not about
   * the 607: it is about every car that gets paint after someone already owns
   * one, which is every art drop from here on.
   */
  it("gives a car bought before its paint existed a colour anyway", () => {
    for (const car of CARS.filter((c) => colorsOf(c).length > 0)) {
      const save: Save = {
        version: SAVE_VERSION,
        credits: 0,
        racesRun: 0,
        lotNudge: 0,
        nextUid: 2,
        sold: [],
        owned: [{ uid: "1", id: car.id, km: 1_000 }], // no `color`, the pre-paint shape
      };
      const color = colorOf(save, "1");
      expect(color, `${car.id} resolves to no colour`).toBeDefined();
      expect(colorsOf(car), `${car.id} got a colour it does not come in`).toContain(color);
      // the point of all of it: the card shows a photo instead of a hole
      expect(imageFor(car, color), `${car.id} still has no photo`).toBe(
        `/${car.photo ?? car.id}-${color}.${PHOTO_EXT}`,
      );
      expect(colorOfHeld(save.owned[0]!)).toBe(color);
    }
  });

  it("leaves a stored colour alone rather than redrawing it", () => {
    const save: Save = {
      version: SAVE_VERSION,
      credits: 0,
      racesRun: 0,
      lotNudge: 0,
      nextUid: 2,
      sold: [],
      owned: [{ uid: "1", id: "bmw-m3-e30", km: 1_000, color: "white" }],
    };
    expect(colorOf(save, "1")).toBe("white");
    expect(colorOfHeld(save.owned[0]!)).toBe("white");
  });

  it("has no colour for a car that is not in the garage", () => {
    expect(colorOf(STARTING_SAVE, "nobody")).toBeUndefined();
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

/**
 * A car in the garage with an ordinary odometer on it for these tests.
 *
 * The uid is deliberately NOT the model id, and it is worth saying why. Naming
 * the unit after its model would have let every test below keep calling
 * `sellCar(s, "ford-f100")` unchanged -- and pass identically against the old
 * model-keyed economy, which is the one thing this file now has to be able to
 * tell apart. A uid that spells out the model proves nothing about a function
 * that looks the model up.
 */
const held = (id: string, uid: string) => ({ uid, id, km: 100_000 });

const R12 = "u1";
const F100 = "u2";

const save = (over: Partial<Save> = {}): Save => ({
  version: SAVE_VERSION,
  credits: 100_000,
  nextUid: 3,
  sold: [],
  owned: [held("renault-12-tl", R12), held("ford-f100", F100)],
  racesRun: 0,
  lotNudge: 0,
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
    //
    // It now covers the R12 too, which it used to skip: buying a car you own is
    // allowed, so the round trip on a SECOND unit has to lose money the same
    // way the first one did. That is the whole safety argument for duplicates
    // -- both sides price (spec, km, mods), so a second copy is not a discount.
    /*
     * The wallet has to cover the DEAREST car in the catalogue at this
     * odometer, and it did not: at 2.000.000 the F40 (2.606.900 at 100.000 km)
     * was refused for lack of money, so its "round trip" was two no-ops and the
     * loop quietly stopped testing the one car most worth testing. The
     * `not.toBe(start)` above is what makes that impossible to miss again --
     * a refused purchase now fails here rather than at the final assertion.
     */
    for (const car of CARS) {
      const start = save({ credits: 20_000_000, owned: [held("renault-12-tl", R12)] });
      const km = 100_000;
      const bought = buyCar(start, car.id, priceWithKm(priceOf(car), car, km), km);
      expect(bought, `${car.id} was not sold`).not.toBe(start);
      const back = sellCar(bought, bought.owned.at(-1)!.uid);
      expect(back.owned).toEqual(start.owned);
      expect(back.credits).toBeLessThan(start.credits);
    }
  });

  it("refuses to sell your last car", () => {
    const s = save({ owned: [held("renault-12-tl", R12)] });
    expect(sellCar(s, R12)).toBe(s);
  });

  it("refuses to sell a car you do not own", () => {
    const s = save();
    expect(sellCar(s, "u9")).toBe(s);
    // and a MODEL id is not a car: it names what, never which
    expect(sellCar(s, "ford-f100")).toBe(s);
  });

  it("refuses to sell a car that is not in the catalogue", () => {
    const s = save({ owned: [held("renault-12-tl", R12), held("ghost-car", "u3")] });
    expect(sellCar(s, "u3")).toBe(s);
  });

  it("pays out and drops the car", () => {
    const s = save();
    const after = sellCar(s, F100);
    expect(after.owned).toEqual([held("renault-12-tl", R12)]);
    expect(after.credits).toBe(s.credits + sellValueFor(byId("ford-f100"), 100_000));
    // input untouched
    expect(s.owned).toEqual([held("renault-12-tl", R12), held("ford-f100", F100)]);
  });

  /**
   * Selling ONE of two identical cars.
   *
   * The failure this pins is the reason sellCar takes a uid at all. By model id
   * it filtered `o.id !== carId`, which removes every Falcon in the garage and
   * pays for one -- so a player with two would lose both and be paid half. It
   * could not happen while the garage refused to hold a pair, which is why it
   * had to be fixed in the same change that lets it.
   */
  it("sells the unit you named, not every car of that model", () => {
    const s = save({
      credits: 0,
      nextUid: 3,
      sold: [],
      owned: [
        { uid: "a", id: "ford-f100", km: 40_000 },
        { uid: "b", id: "ford-f100", km: 300_000 },
      ],
    });
    const after = sellCar(s, "b");
    expect(after.owned).toHaveLength(1);
    expect(after.owned[0]!.uid).toBe("a");
    expect(after.owned[0]!.km).toBe(40_000);
    // paid for the one that left, at ITS odometer, not at the other one's
    expect(after.credits).toBe(sellValueFor(byId("ford-f100"), 300_000));
  });
});

describe("repainting", () => {
  /** The M3 comes in four, which is enough to have a "some other colour". */
  const m3 = byId("bmw-m3-e30");
  const M3 = "u3";
  const other = (not: string) => colorsOf(m3).find((c) => c !== not)!;
  const garage = (color?: string, over: Partial<Save> = {}) =>
    save({
      owned: [
        held("renault-12-tl", R12),
        color === undefined ? held(m3.id, M3) : { ...held(m3.id, M3), color },
      ],
      ...over,
    });

  it("costs a fraction of the car, never less than the floor", () => {
    for (const car of CARS) {
      const price = repaintPriceFor(car, 100_000);
      expect(price).toBeGreaterThanOrEqual(REPAINT_FLOOR);
      // and far under what selling costs you, because paint is not a trade
      expect(price).toBeLessThan(sellValueFor(car, 100_000));
    }
    // the expensive car costs more to paint than the cheap one
    expect(repaintPriceFor(byId("ferrari-f40"), 100_000)).toBeGreaterThan(
      repaintPriceFor(byId("renault-12-tl"), 100_000),
    );
  });

  it("changes the colour and charges for it", () => {
    const s = garage("black");
    const to = other("black");
    const after = repaintCar(s, M3, to);
    expect(heldOf(after, M3)!.color).toBe(to);
    expect(after.credits).toBe(s.credits - repaintPriceFor(m3, 100_000));
    expect(heldOf(s, M3)!.color).toBe("black"); // input untouched
  });

  it("leaves the odometer and the rest of the garage alone", () => {
    const s = garage("black");
    const after = repaintCar(s, M3, other("black"));
    expect(heldOf(after, M3)!.km).toBe(100_000);
    expect(heldOf(after, R12)).toEqual(held("renault-12-tl", R12));
  });

  /**
   * Painting ONE of two identical cars.
   *
   * Same failure as selling the pair, one screen over: by model id the map
   * matched both and painted the garage. Two of a model with two colours is
   * most of the reason anyone wants a second unit in the first place.
   */
  it("paints the unit you named, not every car of that model", () => {
    const s = save({
      nextUid: 3,
      sold: [],
      owned: [
        { uid: "a", id: m3.id, km: 100_000, color: "black" },
        { uid: "b", id: m3.id, km: 100_000, color: "black" },
      ],
    });
    const to = other("black");
    const after = repaintCar(s, "b", to);
    expect(heldOf(after, "a")!.color).toBe("black");
    expect(heldOf(after, "b")!.color).toBe(to);
    // and it charged once
    expect(after.credits).toBe(s.credits - repaintPriceFor(m3, 100_000));
  });

  /*
   * Paint is cosmetic and has to stay that way. If a respray moved the sell
   * price, the cheapest colour would become a buy signal and the dearest a
   * money printer -- and the whole feature would be an arbitrage with a
   * picture on it.
   */
  it("does not move what the car is worth", () => {
    const s = garage("black");
    const before = sellValueFor(m3, 100_000);
    const after = repaintCar(s, M3, other("black"));
    expect(sellValueFor(m3, heldOf(after, M3)!.km)).toBe(before);
  });

  it("refuses a colour the car does not come in", () => {
    const s = garage("black");
    expect(repaintCar(s, M3, "chartreuse")).toBe(s);
  });

  it("refuses to charge for the colour it already is", () => {
    const s = garage("black");
    expect(repaintCar(s, M3, "black")).toBe(s);
  });

  /*
   * The car bought before its paint existed shows a DERIVED colour on its
   * card. Charging to repaint it that same colour would take money for a car
   * that looks identical afterwards, which reads as a bug to whoever paid.
   */
  it("refuses the colour a colourless car is already showing", () => {
    const s = garage(undefined);
    const showing = colorOfHeld(heldOf(s, M3)!)!;
    expect(showing).toBeDefined();
    expect(repaintCar(s, M3, showing)).toBe(s);
    // but any other colour still works, and stores a real value this time
    const to = other(showing);
    expect(heldOf(repaintCar(s, M3, to), M3)!.color).toBe(to);
  });

  it("refuses when you are short", () => {
    const s = garage("black", { credits: 10 });
    expect(repaintCar(s, M3, other("black"))).toBe(s);
  });

  it("refuses a car you do not own, or one that is not in the catalogue", () => {
    const s = garage("black");
    expect(repaintCar(s, "u9", "red")).toBe(s);
    const ghost = save({ owned: [held("ghost-car", "u3")] });
    expect(repaintCar(ghost, "u3", "red")).toBe(ghost);
  });

  it("refuses a car that comes in no colours at all", () => {
    const plain = CARS.find((c) => colorsOf(c).length === 0)!;
    const s = save({ owned: [held("renault-12-tl", R12), held(plain.id, "u3")] });
    expect(repaintCar(s, "u3", "red")).toBe(s);
  });
});

describe("buying", () => {
  it("refuses when you are short", () => {
    const s = save({ credits: 10 });
    expect(buyCar(s, "bmw-m5-e60", priceOf(m5), 0)).toBe(s);
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
    expect(after.owned.at(-1)).toEqual({ uid: "3", id: "bmw-m5-e60", km: 42_000 });
  });

  /**
   * The feature: a second one of something you already have.
   *
   * There used to be a refusal here -- "refuses a car you already own" -- and
   * it was not an economic rule, it was the garage admitting it could not hold
   * a pair. It can now, so the shop sells one.
   */
  it("sells you a second one of a car you already have", () => {
    const s = save({ credits: 500_000 });
    const price = 12_000;
    const after = buyCar(s, "ford-f100", price, 40_000, "red");
    expect(after).not.toBe(s);
    expect(countOwned(after, "ford-f100")).toBe(2);
    expect(after.credits).toBe(s.credits - price);
  });

  it("and the second one is a car of its own, not an echo of the first", () => {
    const s = save({ credits: 500_000 });
    const after = buyCar(s, "ford-f100", 12_000, 40_000, "red");
    const [first, second] = after.owned.filter((o) => o.id === "ford-f100");
    expect(first!.uid).not.toBe(second!.uid);
    // the one that was already there kept its own odometer and its own paint
    expect(first!.uid).toBe(F100);
    expect(first!.km).toBe(100_000);
    expect(first!.color).toBeUndefined();
    expect(second!.km).toBe(40_000);
    expect(second!.color).toBe("red");
  });

  it("names every car it hands over, and never twice", () => {
    let s = save({ credits: 5_000_000 });
    for (let i = 0; i < 8; i++) s = buyCar(s, "ford-f100", 100, 40_000);
    expect(s.owned).toHaveLength(10);
    expect(new Set(s.owned.map((o) => o.uid)).size).toBe(10);
    // and the counter is past all of them, so the next one is safe too
    expect(s.owned.every((o) => o.uid === R12 || o.uid === F100 || Number(o.uid) < s.nextUid))
      .toBe(true);
  });

  /*
   * Selling one of a pair and buying again must not recreate the uid that just
   * left. Anything still holding it -- the car you are sitting in, the car on
   * the workshop ramp -- would silently be pointed at a different car.
   */
  it("does not hand a new car the name of one that was just sold", () => {
    const bought = buyCar(save({ credits: 500_000 }), "ford-f100", 12_000, 40_000);
    const gone = bought.owned.at(-1)!.uid;
    const sold = sellCar(bought, gone);
    const again = buyCar(sold, "ford-f100", 12_000, 40_000);
    expect(again.owned.at(-1)!.uid).not.toBe(gone);
  });
});
