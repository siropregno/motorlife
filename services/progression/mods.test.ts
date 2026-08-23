import { describe, it, expect } from "vitest";
import type { CarSpec } from "@contracts/car";
import type { Mods } from "@contracts/mods";
import { PART_IDS } from "@contracts/mods";
import { CARS } from "@catalog/cars";
import { ratingOf } from "@catalog/rating";
import { engineWear } from "@sim/mods";
import {
  canFit,
  LADDER,
  modCount,
  modsSummary,
  modsValue,
  needsRebuild,
  partPrice,
  PART_RESALE,
  rebuildPrice,
  REBUILD_FLOOR,
  withPart,
  withRebuild,
} from "./mods";
import {
  installPart,
  rebuildEngine,
  sellValueFor,
  priceOf,
  SELL_RATE,
} from "./economy";
import { migrate, SAVE_VERSION, type Save, modsOwned } from "./save";
import { priceWithKm } from "./mileage";

const byId = (id: string) => CARS.find((c) => c.id === id) as CarSpec;
const r12 = byId("renault-12-tl");
const f40 = byId("ferrari-f40");

const saveWith = (mods?: Mods, credits = 5_000_000): Save => ({
  version: SAVE_VERSION,
  credits,
  owned: [
    { id: "renault-12-tl", km: 200_000, ...(mods ? { mods } : {}) },
    { id: "ford-falcon-sprint", km: 100_000 },
  ],
  racesRun: 0,
  lotNudge: 0,
});

// ---------------------------------------------------------------------------

describe("what a part costs", () => {
  it("scales with the car, so it is a real decision on a cheap one", () => {
    // the same part on a car worth twenty times as much costs more
    expect(partPrice(f40, 0, "turbo", 3)).toBeGreaterThan(partPrice(r12, 0, "turbo", 3));
  });

  it("is monotonic up the ladder", () => {
    for (const part of PART_IDS) {
      let prev = 0;
      for (const level of LADDER) {
        const p = partPrice(r12, 0, part, level);
        expect(p, `${part} ${level}`).toBeGreaterThan(prev);
        prev = p;
      }
    }
  });

  it("taking a part off is labour, not a refund", () => {
    /*
     * It must cost something. Free removal would let you flip a car between
     * two class ratings before every event depending on which grid suited
     * you, which turns the class cap into a menu setting.
     */
    for (const part of PART_IDS) {
      const off = partPrice(r12, 0, part, 0);
      expect(off, part).toBeGreaterThan(0);
      expect(off, part).toBeLessThanOrEqual(partPrice(r12, 0, part, 1));
    }
  });

  it("a removal is never worth more than the part it removes", () => {
    for (const c of CARS) {
      for (const part of PART_IDS) {
        expect(partPrice(c, 0, part, 0), `${c.id}/${part}`).toBeLessThan(
          partPrice(c, 0, part, 3),
        );
      }
    }
  });

  it("never rounds to nothing on the cheapest car in the catalogue", () => {
    const cheapest = [...CARS].sort((a, b) => priceOf(a) - priceOf(b))[0] as CarSpec;
    for (const part of PART_IDS) {
      for (const level of LADDER) {
        expect(partPrice(cheapest, 400_000, part, level), part).toBeGreaterThan(0);
      }
    }
  });

  it("charges the full tier, not the step up from what is fitted", () => {
    // buying street then racing must cost MORE than buying racing outright,
    // or the ladder is strictly free and everyone climbs it the same way
    const street = partPrice(r12, 0, "turbo", 1);
    const racing = partPrice(r12, 0, "turbo", 3);
    expect(street + racing).toBeGreaterThan(racing);
  });
});

describe("installing a part", () => {
  it("takes the money and fits the part", () => {
    const s = saveWith();
    const next = installPart(s, "renault-12-tl", "turbo", 2);
    expect(next).not.toBe(s);
    expect(modsOwned(next, "renault-12-tl")?.turbo).toBe(2);
    expect(next.credits).toBe(s.credits - partPrice(r12, 200_000, "turbo", 2));
  });

  it("leaves the other car alone", () => {
    const next = installPart(saveWith(), "renault-12-tl", "turbo", 2);
    expect(modsOwned(next, "ford-falcon-sprint")).toBeUndefined();
  });

  it("refuses a car you do not own", () => {
    const s = saveWith();
    expect(installPart(s, "ferrari-f40", "turbo", 1)).toBe(s);
  });

  it("refuses when you cannot pay", () => {
    const s = saveWith(undefined, 10);
    expect(installPart(s, "renault-12-tl", "turbo", 3)).toBe(s);
  });

  it("refuses to charge for the level already fitted", () => {
    const s = saveWith({ turbo: 2 });
    expect(installPart(s, "renault-12-tl", "turbo", 2)).toBe(s);
  });

  it("allows going back down a tier, and charges for it", () => {
    // taking the racing turbo off and putting a street one on is work
    const s = saveWith({ turbo: 3 });
    const next = installPart(s, "renault-12-tl", "turbo", 1);
    expect(modsOwned(next, "renault-12-tl")?.turbo).toBe(1);
    expect(next.credits).toBeLessThan(s.credits);
  });

  it("keeps the parts already on the car", () => {
    const s = saveWith({ suspension: 2 });
    const next = installPart(s, "renault-12-tl", "turbo", 1);
    expect(modsOwned(next, "renault-12-tl")).toEqual({ suspension: 2, turbo: 1 });
  });
});

describe("the engine rebuild", () => {
  it("is offered on a car that has done real kilometres", () => {
    expect(needsRebuild(200_000, undefined)).toBe(true);
  });

  it("is refused on an engine that has just been rebuilt", () => {
    const s = saveWith({ wearKm: 0 });
    expect(rebuildEngine(s, "renault-12-tl")).toBe(s);
    expect(needsRebuild(200_000, { wearKm: 0 })).toBe(false);
  });

  it("zeroes the engine's kilometres and leaves the car's own alone", () => {
    /*
     * The whole reason wearKm is a separate number. A rebuild that reset the
     * odometer would be clocking the car -- buy hammered, rebuild, sell as a
     * low-km example, repeat.
     */
    const s = saveWith();
    const next = rebuildEngine(s, "renault-12-tl");
    expect(modsOwned(next, "renault-12-tl")?.wearKm).toBe(0);
    expect(next.owned.find((o) => o.id === "renault-12-tl")?.km).toBe(200_000);
  });

  it("does not change what the car is worth", () => {
    const s = saveWith();
    const before = sellValueFor(r12, 200_000, modsOwned(s, "renault-12-tl"));
    const next = rebuildEngine(s, "renault-12-tl");
    const after = sellValueFor(r12, 200_000, modsOwned(next, "renault-12-tl"));
    expect(after).toBe(before);
  });

  it("costs more on a more tired engine", () => {
    const tired = rebuildPrice(r12, 400_000, undefined);
    const fresher = rebuildPrice(r12, 60_000, undefined);
    expect(tired).toBeGreaterThanOrEqual(fresher);
  });

  it("never costs nothing", () => {
    expect(rebuildPrice(r12, 200_000, undefined)).toBeGreaterThanOrEqual(REBUILD_FLOOR);
  });

  it("keeps the parts on the car", () => {
    const s = saveWith({ turbo: 3, suspension: 1 });
    const next = rebuildEngine(s, "renault-12-tl");
    expect(modsOwned(next, "renault-12-tl")?.turbo).toBe(3);
    expect(modsOwned(next, "renault-12-tl")?.suspension).toBe(1);
  });

  it("refuses when you cannot pay", () => {
    const s = saveWith(undefined, 10);
    expect(rebuildEngine(s, "renault-12-tl")).toBe(s);
  });

  it("gives back power a tired car had lost", () => {
    expect(engineWear(0).kW).toBeGreaterThan(engineWear(200_000).kW);
  });
});

describe("the workshop is not a bank", () => {
  /**
   * The failure this guards: fit parts to a cheap car, sell it, get more back
   * than you put in. Any rate at or above what the car itself resells for
   * turns the workshop into a savings account with better terms than the
   * dealership.
   */
  it("parts resell for less than the car does", () => {
    expect(PART_RESALE).toBeLessThan(SELL_RATE);
  });

  it("fitting a part then selling always loses money", () => {
    for (const c of CARS) {
      for (const part of PART_IDS) {
        for (const level of LADDER) {
          const cost = partPrice(c, 0, part, level);
          const gained =
            sellValueFor(c, 0, { [part]: level }) - sellValueFor(c, 0, undefined);
          expect(gained, `${c.id}/${part}/${level}`).toBeLessThan(cost);
        }
      }
    }
  });

  it("a full build never sells for more than it cost", () => {
    const full: Mods = { turbo: 3, exhaust: 3, suspension: 3, gearbox: 3 };
    for (const c of CARS) {
      const cost = PART_IDS.reduce((n, p) => n + partPrice(c, 0, p, 3), 0);
      expect(modsValue(c, 0, full), c.id).toBeLessThan(cost);
    }
  });

  it("a stock car is worth exactly what it was worth before mods existed", () => {
    for (const c of CARS) {
      const plain = Math.round((priceWithKm(priceOf(c), c, 0) * SELL_RATE) / 100) * 100;
      expect(sellValueFor(c, 0), c.id).toBe(plain);
      expect(sellValueFor(c, 0, undefined), c.id).toBe(plain);
      expect(sellValueFor(c, 0, {}), c.id).toBe(plain);
    }
  });

  it("a modified car is worth more than the same car stock", () => {
    expect(sellValueFor(r12, 0, { turbo: 3 })).toBeGreaterThan(sellValueFor(r12, 0));
  });
});

describe("mods move what class you race in", () => {
  it("the rating cache tells a modified car from a stock one", () => {
    /*
     * The cache was keyed on the car id alone, which was correct while a
     * rating was a property of the model. A turboed R12 and a stock R12 share
     * an id and are not the same car.
     */
    const stock = ratingOf(r12);
    const tuned = ratingOf(r12, { turbo: 3, exhaust: 3, suspension: 3, gearbox: 3 }, 0);
    expect(tuned.index).toBeGreaterThan(stock.index);
  });

  it("the stock rating is unchanged by anything mods do", () => {
    const before = ratingOf(r12).index;
    ratingOf(r12, { turbo: 3 }, 0);
    ratingOf(r12, { suspension: 3 }, 400_000);
    expect(ratingOf(r12).index).toBe(before);
  });

  it("a tired engine rates below a fresh one", () => {
    expect(ratingOf(r12, { wearKm: 400_000 }, 400_000).index).toBeLessThanOrEqual(
      ratingOf(r12, { wearKm: 0 }, 0).index,
    );
  });
});

describe("helpers", () => {
  it("withPart replaces without touching the rest", () => {
    expect(withPart({ turbo: 1, suspension: 2 }, "turbo", 3)).toEqual({
      turbo: 3,
      suspension: 2,
    });
  });

  it("withRebuild keeps the parts", () => {
    expect(withRebuild({ turbo: 2, wearKm: 90_000 })).toEqual({ turbo: 2, wearKm: 0 });
  });

  it("canFit refuses the level already on the car", () => {
    expect(canFit({ turbo: 2 }, "turbo", 2)).toBe(false);
    expect(canFit({ turbo: 2 }, "turbo", 3)).toBe(true);
    expect(canFit(undefined, "turbo", 0)).toBe(false);
  });

  it("summarises what is fitted, and says nothing about a stock car", () => {
    expect(modsSummary(undefined)).toBe("");
    expect(modsSummary({})).toBe("");
    expect(modsSummary({ wearKm: 0 })).toBe("");
    expect(modsSummary({ turbo: 3 })).toBe("Turbo Competición");
    expect(modCount({ turbo: 3, gearbox: 1 })).toBe(2);
    expect(modCount(undefined)).toBe(0);
  });
});

describe("saves written before mods existed", () => {
  it("a v3 save comes up with every car stock", () => {
    const v3 = {
      version: 3,
      credits: 9_000,
      owned: [{ id: "renault-12-tl", km: 214_000, color: "light-blue" }],
      racesRun: 4,
    };
    const up = migrate(v3);
    expect(up?.version).toBe(SAVE_VERSION);
    expect(up?.credits).toBe(9_000);
    expect(up?.racesRun).toBe(4);
    expect(up?.owned[0]?.color).toBe("light-blue");
    expect(up?.owned[0]?.km).toBe(214_000);
    // absent, NOT {wearKm: 0} -- that would be a free rebuild for everyone
    expect(up?.owned[0]?.mods).toBeUndefined();
  });

  it("a v1 save still arrives, through every step", () => {
    const up = migrate({ version: 1, credits: 100, owned: ["renault-12-tl"], racesRun: 0 });
    expect(up?.version).toBe(SAVE_VERSION);
    expect(up?.owned[0]?.mods).toBeUndefined();
    expect(typeof up?.owned[0]?.km).toBe("number");
  });

  it("an unmigrated car's engine is as old as the car", () => {
    const up = migrate({
      version: 3,
      credits: 0,
      owned: [{ id: "renault-12-tl", km: 300_000 }],
      racesRun: 0,
    });
    const held = up?.owned[0];
    // no wearKm means "read the car's odometer", which is the honest answer
    expect(held?.mods?.wearKm).toBeUndefined();
    expect(needsRebuild(held?.km ?? 0, held?.mods)).toBe(true);
  });
});
