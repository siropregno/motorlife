import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CarSpec } from "@contracts/car";
import type { Mods } from "@contracts/mods";
import type { Setup } from "@contracts/race";
import type { TrackSpec } from "@contracts/track";
import { CARS } from "@catalog/cars";
import { TRACKS } from "@catalog/tracks";
import { derive } from "./derive";
import { applyMods, engineWear, modEffect, tierOf, PART_TIERS, WEAR_MAX_KW } from "./mods";
import { applySetup, wearMultiplier } from "./setup";
import { lapTime } from "./lap";
import { classIndex } from "./rating";
import { topSpeed, zeroToHundred } from "./physics";

const byId = (id: string) => CARS.find((c) => c.id === id) as CarSpec;
const r12 = byId("renault-12-tl");
const m5 = byId("bmw-m5-e60");
const FLAT: Setup = { aero: 0, gearing: 0, springs: 0, brakeBias: 0 };
const FRESH = { compound: "medium" as const, age: 0 };
const monza = TRACKS.find((t) => t.id === "monza") as TrackSpec;

const FULL: Mods = { turbo: 3, exhaust: 3, suspension: 3, gearbox: 3, wearKm: 0 };
const NEW = (m: Mods = {}): Mods => ({ ...m, wearKm: 0 });

const lap = (spec: CarSpec, mods: Mods | undefined, track = monza, km = 0) =>
  lapTime(applySetup(applyMods(derive(spec), mods, km), FLAT, FRESH, 0), track);

// ---------------------------------------------------------------------------

describe("the calibration scalar survives modification", () => {
  /**
   * THE bug this whole design exists to avoid. derive() fits `k` so the stock
   * car reproduces its published 0-100. If a mod were applied before that fit,
   * the fit would compensate to hit the same published time and the mod would
   * buy nothing -- or would drive k into its rail and throw ImportError on a
   * car that imported fine a moment ago.
   */
  it("a turbo does not change k", () => {
    const stock = derive(r12);
    const tuned = applyMods(stock, NEW({ turbo: 3 }), 0);
    expect(tuned.k).toBe(stock.k);
  });

  it("a turbo makes the car actually accelerate faster", () => {
    const stock = derive(r12);
    const tuned = applyMods(stock, NEW({ turbo: 3 }), 0);
    expect(zeroToHundred(tuned, tuned.kg)).toBeLessThan(zeroToHundred(stock, stock.kg));
  });

  it("every catalogue car stays finite and quicker with a full build", () => {
    for (const c of CARS) {
      const stock = lap(c, NEW());
      const tuned = lap(c, FULL);
      expect(Number.isFinite(stock), c.id).toBe(true);
      expect(Number.isFinite(tuned), c.id).toBe(true);
      expect(tuned, c.id).toBeLessThan(stock);
    }
  });
});

describe("a part may not reach a term that is not its own", () => {
  /**
   * The same wall physics.ts puts between k and lateral grip, applied to the
   * parts: an exhaust that quietly added grip would be a cornering upgrade
   * sold as a power one, and nobody could tell from the shop.
   */
  it("power parts leave lateral grip alone", () => {
    const stock = derive(m5);
    for (const part of ["turbo", "exhaust"] as const) {
      const tuned = applyMods(stock, NEW({ [part]: 3 }), 0);
      expect(tuned.muLateral, part).toBeCloseTo(stock.muLateral, 12);
    }
  });

  it("grip and gearbox parts leave power alone", () => {
    const stock = derive(m5);
    for (const part of ["suspension", "gearbox"] as const) {
      const tuned = applyMods(stock, NEW({ [part]: 3 }), 0);
      expect(tuned.kW, part).toBeCloseTo(stock.kW, 12);
    }
  });

  it("a suspension is grip, and only grip", () => {
    const stock = derive(m5);
    const tuned = applyMods(stock, NEW({ suspension: 3 }), 0);
    expect(tuned.muLateral).toBeGreaterThan(stock.muLateral);
    expect(tuned.cda).toBeCloseTo(stock.cda, 12);
    expect(tuned.shiftS).toBeCloseTo(stock.shiftS, 12);
  });
});

describe("every tier is worth more than the one below it", () => {
  it("the ladder is monotonic on the term each part moves", () => {
    for (const [part, tiers] of Object.entries(PART_TIERS)) {
      const gain = (t: (typeof tiers)[1]) => t.kW * t.grip * (2 - t.shift) * t.eta;
      expect(gain(tiers[2]), part).toBeGreaterThan(gain(tiers[1]));
      expect(gain(tiers[3]), part).toBeGreaterThan(gain(tiers[2]));
    }
  });

  it("a higher tier is never slower on track", () => {
    for (const part of ["turbo", "exhaust", "suspension", "gearbox"] as const) {
      let prev = lap(m5, NEW());
      for (const level of [1, 2, 3] as const) {
        const t = lap(m5, NEW({ [part]: level }));
        expect(t, `${part} ${level}`).toBeLessThanOrEqual(prev);
        prev = t;
      }
    }
  });
});

describe("grip bought from a part is paid for in tyres", () => {
  /**
   * If racing suspension were free lap time it would be strictly correct on
   * every car at every circuit, which is not a decision. The cost has to land
   * on the same axis the springs SLIDER already pays on, or the two would
   * disagree about what stiffness costs.
   */
  it("a racing suspension eats tyres faster", () => {
    expect(wearMultiplier(FLAT, modEffect(NEW({ suspension: 3 }), 0).wear)).toBeGreaterThan(
      wearMultiplier(FLAT, 1),
    );
  });

  it("the part's cost compounds with the slider's rather than replacing it", () => {
    const stiff: Setup = { ...FLAT, springs: 1 };
    const partOnly = wearMultiplier(FLAT, modEffect(NEW({ suspension: 3 }), 0).wear);
    const sliderOnly = wearMultiplier(stiff, 1);
    const both = wearMultiplier(stiff, modEffect(NEW({ suspension: 3 }), 0).wear);
    expect(both).toBeGreaterThan(partOnly);
    expect(both).toBeGreaterThan(sliderOnly);
  });

  it("a worn set on a racing suspension is slower than a fresh one", () => {
    const car = applyMods(derive(m5), NEW({ suspension: 3 }), 0);
    const fresh = lapTime(applySetup(car, FLAT, { compound: "medium", age: 0 }, 0), monza);
    const worn = lapTime(applySetup(car, FLAT, { compound: "medium", age: 10 }, 10), monza);
    expect(worn).toBeGreaterThan(fresh);
  });
});

describe("engine wear", () => {
  it("a fresh engine loses nothing", () => {
    expect(engineWear(0).kW).toBe(1);
    expect(engineWear(0).grip).toBe(1);
    expect(engineWear(0).fraction).toBe(0);
  });

  it("is monotonic: more kilometres never means more power", () => {
    let prev = engineWear(0).kW;
    for (let km = 10_000; km <= 500_000; km += 10_000) {
      const now = engineWear(km).kW;
      expect(now, `${km}`).toBeLessThanOrEqual(prev);
      prev = now;
    }
  });

  it("saturates rather than running to zero", () => {
    expect(engineWear(10_000_000).kW).toBeGreaterThan(1 - WEAR_MAX_KW - 1e-9);
    expect(engineWear(10_000_000).kW).toBeLessThan(1);
  });

  it("an unrebuilt engine has done exactly the car's kilometres", () => {
    // no wearKm in the mods: the engine is as old as the car
    expect(modEffect({ turbo: 1 }, 200_000).kW).toBeCloseTo(
      modEffect({ turbo: 1, wearKm: 200_000 }, 0).kW,
      12,
    );
  });

  it("a rebuild gives back exactly what the wear took", () => {
    const tired = modEffect({ wearKm: 250_000 }, 0);
    const rebuilt = modEffect({ wearKm: 0 }, 0);
    expect(rebuilt.kW).toBeGreaterThan(tired.kW);
    expect(rebuilt.kW).toBe(1);
  });

  it("a hammered car laps slower than the same car fresh", () => {
    const tired = lap(r12, { wearKm: 400_000 });
    const fresh = lap(r12, { wearKm: 0 });
    expect(tired).toBeGreaterThan(fresh);
  });
});

describe("mods move the class index", () => {
  /**
   * The class cap is the only defence against "buy the cheapest car in the
   * class, fit everything, win forever". It only works if the index can see
   * the parts.
   */
  const refs = TRACKS.filter((t) => ["monza", "galvez-6", "galvez-12"].includes(t.id));

  it("a full build rates above the same car stock", () => {
    const stock = classIndex(applyMods(derive(r12), NEW(), 0), refs);
    const tuned = classIndex(applyMods(derive(r12), FULL, 0), refs);
    expect(tuned).toBeGreaterThan(stock);
  });

  it("the index moves enough to matter -- a class is 60 points", () => {
    for (const c of CARS) {
      const stock = classIndex(applyMods(derive(c), NEW(), 0), refs);
      const tuned = classIndex(applyMods(derive(c), FULL, 0), refs);
      // a full build is a real step, not a rounding error
      expect(tuned - stock, c.id).toBeGreaterThan(20);
    }
  });
});

describe("nothing produces an impossible car", () => {
  it("no lap time is NaN or infinite on any car, part and level", () => {
    for (const c of CARS.slice(0, 6)) {
      for (const part of ["turbo", "exhaust", "suspension", "gearbox"] as const) {
        for (const level of [0, 1, 2, 3] as const) {
          for (const track of TRACKS) {
            const t = lap(c, NEW({ [part]: level }), track, 400_000);
            expect(Number.isFinite(t), `${c.id}/${part}/${level}/${track.id}`).toBe(true);
            expect(t).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it("a full build on the fastest car at maximum wear is still a real lap", () => {
    for (const track of TRACKS) {
      const t = lap(byId("ferrari-f40"), { ...FULL, wearKm: 999_999 }, track, 999_999);
      expect(Number.isFinite(t)).toBe(true);
      expect(t).toBeGreaterThan(30);
      expect(t).toBeLessThan(400);
    }
  });

  it("stock is exactly the unmodified car", () => {
    const stock = derive(m5);
    const none = applyMods(stock, undefined, 0);
    expect(none.kW).toBe(stock.kW);
    expect(none.muLateral).toBe(stock.muLateral);
    expect(none.cda).toBe(stock.cda);
    expect(none.shiftS).toBe(stock.shiftS);
    expect(none.eta).toBe(stock.eta);
    expect(none.modWear).toBe(1);
  });

  it("stock and level 0 are the same car", () => {
    expect(tierOf("turbo", 0)).toBe(tierOf("gearbox", 0));
    expect(lap(m5, NEW({ turbo: 0 }))).toBe(lap(m5, NEW()));
  });
});

describe("top speed is the inverse of the drag derivation", () => {
  /**
   * cdaFromTopSpeed reads a published top speed and solves for drag.
   * topSpeed takes that drag back and says how fast the car goes. Round
   * tripping has to return the published figure, or one of the two is wrong --
   * and since the whole catalogue's drag comes from the first, that would be
   * every car.
   */
  it("returns the published figure for every car in the catalogue", () => {
    for (const c of CARS) {
      if (c.topKph === undefined) continue;
      const d = derive(c);
      // at the published top speed the car is not accelerating, so k plays no
      // part -- this is the same balance derive solved, read the other way
      const kph = topSpeed({ ...d, k: 1 }, c.kg) * 3.6;
      expect(kph, c.id).toBeCloseTo(c.topKph, 0);
    }
  });

  it("a turbo makes a car faster in a straight line", () => {
    const stock = derive(m5);
    const tuned = applyMods(stock, NEW({ turbo: 3 }), 0);
    expect(topSpeed(tuned, tuned.kg)).toBeGreaterThan(topSpeed(stock, stock.kg));
  });

  it("a tired engine tops out lower", () => {
    const fresh = applyMods(derive(m5), { wearKm: 0 }, 0);
    const tired = applyMods(derive(m5), { wearKm: 400_000 }, 0);
    expect(topSpeed(tired, tired.kg)).toBeLessThan(topSpeed(fresh, fresh.kg));
  });

  /**
   * A sanity rail, not a balance rule.
   *
   * What it is for is NaN, a negative root, and the drag solve running away --
   * every one of which produces a number that is obviously wrong the moment you
   * look and completely invisible if nobody does.
   *
   * The ceiling is 500 against a fastest-in-catalogue F40 that tops out at 429
   * km/h with everything bolted to it, so there is about 16% of headroom.
   *
   * It went to 550 for one commit, when a McLaren F1 was briefly in the
   * catalogue and reached 511 fully built. The F1 was removed for being off
   * theme rather than for being fast, so the ceiling came back down with it --
   * a sanity rail loosened for a car that no longer exists is a rail that has
   * quietly stopped catching things.
   */
  it("is finite and sane for every car, stock and fully built", () => {
    for (const c of CARS) {
      for (const mods of [NEW(), FULL]) {
        const d = applyMods(derive(c), mods, 0);
        const kph = topSpeed(d, d.kg) * 3.6;
        expect(Number.isFinite(kph), c.id).toBe(true);
        expect(kph, c.id).toBeGreaterThan(80);
        expect(kph, c.id).toBeLessThan(500);
      }
    }
  });
});

describe("the sim stays self-contained", () => {
  it("mods.ts imports nothing at runtime", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, "mods.ts"), "utf8");
    for (const m of src.matchAll(/^\s*import\s+(type\s+)?([\s\S]*?)from\s+"([^"]+)"/gm)) {
      const isTypeOnly = Boolean(m[1]) || /^\s*\{\s*type\s/.test(m[2] ?? "");
      const spec = m[3] ?? "";
      if (spec.startsWith(".")) continue;
      expect(isTypeOnly, `mods.ts imports ${spec} at runtime`).toBe(true);
    }
    // and the file is actually in the directory the graph test sweeps
    expect(readdirSync(here)).toContain("mods.ts");
  });
});
