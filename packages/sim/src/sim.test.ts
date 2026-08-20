import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import type { CarSpec } from "@contracts/car";
import type { Entry, Setup } from "@contracts/race";
import type { TrackSpec, Regulation } from "@contracts/track";

import { derive, cdaFromTopSpeed, CDA_MIN, CDA_MAX, K_MIN, K_MAX, ImportError } from "./derive";
import { applySetup } from "./setup";
import { lapTime } from "./lap";
import { cornerSpeed, zeroToHundred } from "./physics";
import { simulateRace } from "./race";
import { buildTower } from "./tower";
import { LAYOUTS } from "./tables";

import { CARS } from "@catalog/cars";
import { TRACKS, trackById } from "@catalog/tracks";

const FLAT: Setup = { aero: 0, gearing: 0, springs: 0, brakeBias: 0 };
const monza = trackById("monza") as TrackSpec;
const galvez6 = trackById("galvez-6") as TrackSpec;

function entry(car: CarSpec, id: string, opts: Partial<Entry> = {}): Entry {
  return {
    id,
    label: id,
    car,
    build: { carId: car.id, compound: "medium", setup: FLAT },
    consistency: 0.8,
    pitLap: 10,
    pitCompound: "medium",
    you: false,
    ...opts,
  };
}

const REG: Regulation = { laps: 12, pitLossS: 22 };

/**
 * exactOptionalPropertyTypes is on, so `{...spec, zeroTo100: undefined}` sets
 * the key to undefined rather than omitting it. Those are different things and
 * the compiler is right to reject it. Drop the key properly.
 */
function uncalibrated(spec: CarSpec): CarSpec {
  const { zeroTo100: _drop, ...rest } = spec;
  return rest;
}

// ---------------------------------------------------------------------------

describe("import graph", () => {
  it("packages/sim has no runtime imports outside itself", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const files = readdirSync(here).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
    expect(files.length).toBeGreaterThan(5);

    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(join(here, f), "utf8");
      // every `import ... from "x"` statement, with its leading keyword
      for (const m of src.matchAll(/^\s*import\s+(type\s+)?([\s\S]*?)from\s+"([^"]+)"/gm)) {
        const isTypeOnly = Boolean(m[1]) || /^\s*\{\s*type\s/.test(m[2] ?? "");
        const spec = m[3] ?? "";
        if (spec.startsWith(".")) continue; // inside the package
        if (isTypeOnly) continue; // erased at compile time
        offenders.push(`${f}: ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("never calls Math.random", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const files = readdirSync(here).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
    // strip comments first: several files say in prose that the sim must
    // never call it, and a grep for the bare string flags those too
    const stripComments = (s: string) =>
      s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const offenders = files.filter((f) =>
      /Math\s*\.\s*random\s*\(/.test(stripComments(readFileSync(join(here, f), "utf8"))),
    );
    expect(offenders).toEqual([]);
  });
});

describe("determinism", () => {
  it("the same seed gives a byte-identical race, every time", () => {
    const entries = CARS.map((c, i) => entry(c, `e${i}`, { pitLap: 6 + i }));
    const first = JSON.stringify(simulateRace(entries, monza, REG, 0x4d4f544f));
    for (let i = 0; i < 30; i++) {
      expect(JSON.stringify(simulateRace(entries, monza, REG, 0x4d4f544f))).toBe(first);
    }
  });

  it("a different seed gives a different race", () => {
    const entries = CARS.map((c, i) => entry(c, `e${i}`));
    const a = JSON.stringify(simulateRace(entries, monza, REG, 1));
    const b = JSON.stringify(simulateRace(entries, monza, REG, 2));
    expect(a).not.toBe(b);
  });

  it("the random stream does not depend on who is racing", () => {
    // entry 0's laps must be identical whether or not entry 3 is on the grid,
    // because the jitter is drawn in a fixed order for every entry every lap
    const all = CARS.map((c, i) => entry(c, `e${i}`));
    const full = simulateRace(all, monza, REG, 99);
    const fewer = simulateRace(all.slice(0, 2), monza, REG, 99);
    const a = full.entries.find((e) => e.entryId === "e0");
    const b = fewer.entries.find((e) => e.entryId === "e0");
    expect(a?.laps[0]?.timeS).toBeCloseTo(b?.laps[0]?.timeS ?? -1, 9);
  });
});

describe("derive", () => {
  it("top speed is a measurement of drag, not a lookup", () => {
    // a 996 GT3: 265 kW, 1350 kg, 302 km/h
    const cda = cdaFromTopSpeed(265, 1350, 302, 1999, LAYOUTS.RR.eta);
    expect(cda).not.toBeNull();
    expect(cda as number).toBeGreaterThan(0.5);
    expect(cda as number).toBeLessThan(0.7);
  });

  it("every catalogue car imports and lands inside the bands", () => {
    for (const spec of CARS) {
      const car = derive(spec);
      expect(car.cda, `${spec.id} CdA`).toBeGreaterThanOrEqual(CDA_MIN);
      expect(car.cda, `${spec.id} CdA`).toBeLessThanOrEqual(CDA_MAX);
      expect(car.k, `${spec.id} k`).toBeGreaterThanOrEqual(K_MIN);
      expect(car.k, `${spec.id} k`).toBeLessThanOrEqual(K_MAX);
      expect(Number.isFinite(car.muLateral)).toBe(true);
    }
  });

  it("a calibrated car reproduces its published 0-100 to within 0.01 s", () => {
    for (const spec of CARS) {
      if (spec.zeroTo100 === undefined) continue;
      const car = derive(spec);
      const t = zeroToHundred({ ...car }, spec.kg);
      expect(Math.abs(t - spec.zeroTo100), `${spec.id}`).toBeLessThan(0.01);
    }
  });

  it("refuses a car whose published figures contradict each other", () => {
    const absurd: CarSpec = {
      id: "absurd",
      make: "X",
      model: "Y",
      year: 2000,
      kW: 20,
      kg: 1500,
      layout: "FR",
      cls: "saloon",
      topKph: 400, // 20 kW will not push 1500 kg to 400 km/h
      rarity: "common",
      blurb: "",
    };
    expect(() => derive(absurd)).toThrow(ImportError);
  });

  it("adding power never lowers power-to-weight", () => {
    const base = CARS[0] as CarSpec;
    const a = derive(base);
    const b = derive(uncalibrated({ ...base, kW: base.kW + 50 }));
    expect(b.kWPerTonne).toBeGreaterThan(a.kWPerTonne);
  });
});

describe("the calibration scalar stays longitudinal", () => {
  it("a car with a better launch does not corner faster", () => {
    const spec = CARS[0] as CarSpec;
    const slow = derive({ ...spec, zeroTo100: 6.5 });
    const fast = derive({ ...spec, zeroTo100: 4.0 });
    // the fit must have moved
    expect(fast.k).not.toBeCloseTo(slow.k, 3);
    // ...and lateral grip must not have
    expect(fast.muLateral).toBeCloseTo(slow.muLateral, 12);
    expect(cornerSpeed(fast, 100)).toBeCloseTo(cornerSpeed(slow, 100), 12);
  });
});

describe("physics falls out of the equations", () => {
  const spec = CARS[0] as CarSpec;

  it("the lighter of two otherwise equal cars corners faster", () => {
    const heavy = derive(uncalibrated({ ...spec, kg: 1600 }));
    const light = derive(uncalibrated({ ...spec, kg: 1100 }));
    expect(cornerSpeed(light, 80)).toBeGreaterThan(cornerSpeed(heavy, 80));
  });

  it("more wing is faster in a corner and slower on a straight", () => {
    const car = derive(spec);
    const low = applySetup(car, { ...FLAT, aero: -1 }, { compound: "medium", age: 0 }, 0);
    const high = applySetup(car, { ...FLAT, aero: 1 }, { compound: "medium", age: 0 }, 0);
    expect(cornerSpeed(high, 80)).toBeGreaterThan(cornerSpeed(low, 80));
    expect(high.cda).toBeGreaterThan(low.cda);
    // and the trade has to actually flip between a power track and a twisty one
    const monzaLow = lapTime(low, monza);
    const monzaHigh = lapTime(high, monza);
    const galvLow = lapTime(low, galvez6);
    const galvHigh = lapTime(high, galvez6);
    expect(monzaHigh - monzaLow).toBeGreaterThan(galvHigh - galvLow);
  });

  it("the best aero setting is not the same on a power circuit and a twisty one", () => {
    // The design rests on this. A wing is real downforce, so it pays with the
    // square of speed in a fast corner and does nothing in a hairpin, while
    // its drag is charged on every straight. If the optimum were the same
    // everywhere the slider would be a strictly-better button, not a choice.
    const car = derive(spec);
    const bestAero = (track: TrackSpec) => {
      let best = { aero: -2, t: Infinity };
      for (let a = -1; a <= 1.0001; a += 0.05) {
        const t = lapTime(
          applySetup(car, { ...FLAT, aero: a }, { compound: "medium", age: 0 }, 0),
          track,
        );
        if (t < best.t) best = { aero: a, t };
      }
      return best.aero;
    };
    const power = bestAero(monza); // three straights over 900 m
    const twisty = bestAero(galvez6); // 15 corners, longest straight 645 m
    expect(twisty).toBeGreaterThan(power + 0.3);
  });

  it("softer tyres are quicker when fresh and worse when worn", () => {
    const car = derive(spec);
    const freshSoft = applySetup(car, FLAT, { compound: "soft", age: 0 }, 0);
    const freshHard = applySetup(car, FLAT, { compound: "hard", age: 0 }, 0);
    expect(lapTime(freshSoft, monza)).toBeLessThan(lapTime(freshHard, monza));

    const wornSoft = applySetup(car, FLAT, { compound: "soft", age: 25 }, 0);
    const wornHard = applySetup(car, FLAT, { compound: "hard", age: 25 }, 0);
    expect(lapTime(wornSoft, monza)).toBeGreaterThan(lapTime(wornHard, monza));
  });

  it("an underpowered car on a long straight terminates", () => {
    // Regression. A 40 kW R12 reaches terminal velocity on Monza's 995 m
    // straight, and the terminal-velocity branch used to coast by exactly
    // `remaining - dBrake`, leaving the next pass comparing dBrake against
    // itself. Floating point then decided whether the loop ended. A fast car
    // never reaches terminal velocity, so this only ever bit the slow ones.
    const r12 = derive(CARS.find((c) => c.id === "renault-12-tl") as CarSpec);
    const eff = applySetup(r12, FLAT, { compound: "medium", age: 0 }, 0);
    const t = lapTime(eff, monza);
    expect(Number.isFinite(t)).toBe(true);
    // ~5.8 km at an R12's pace: minutes, not seconds, and not forever
    expect(t).toBeGreaterThan(150);
    expect(t).toBeLessThan(400);
  });

  it("no lap time is ever NaN or infinite on any catalogue pairing", () => {
    for (const spec2 of CARS) {
      const car = derive(spec2);
      for (const track of TRACKS) {
        for (const aero of [-1, 0, 1]) {
          for (const gearing of [-1, 0, 1]) {
            const eff = applySetup(
              car,
              { ...FLAT, aero, gearing },
              { compound: "medium", age: 0 },
              0,
            );
            const t = lapTime(eff, track);
            expect(Number.isFinite(t), `${spec2.id} @ ${track.id}`).toBe(true);
            expect(t).toBeGreaterThan(20);
            expect(t).toBeLessThan(1200);
          }
        }
      }
    }
  });
});

describe("tracks", () => {
  it("every track is closed, sane and matches its published length", () => {
    for (const t of TRACKS) {
      expect(t.segments.length, t.id).toBeGreaterThan(4);
      const sum = t.segments.reduce((a, s) => a + s.len, 0);
      expect(Math.abs(sum - t.publishedM) / t.publishedM, `${t.id} length`).toBeLessThan(0.01);
      for (const s of t.segments) {
        expect(s.len).toBeGreaterThan(0);
        if (s.kind === "corner") {
          expect(s.r, `${t.id} radius`).toBeGreaterThan(10);
          expect(s.r, `${t.id} radius`).toBeLessThan(2000);
        }
      }
    }
  });

  it("a twisty circuit and a power circuit rank cars differently", () => {
    // the whole reason a collection is worth having
    const m5 = derive(CARS.find((c) => c.id === "bmw-m5-e60") as CarSpec);
    const r12 = derive(CARS.find((c) => c.id === "renault-12-tl") as CarSpec);
    const eff = (c: typeof m5) => applySetup(c, FLAT, { compound: "medium", age: 0 }, 0);
    // the M5 should win everywhere against an R12, but by far less on the
    // twisty one -- that margin ratio is the thing the design rests on
    const monzaGap = lapTime(eff(r12), monza) - lapTime(eff(m5), monza);
    const galvGap = lapTime(eff(r12), galvez6) - lapTime(eff(m5), galvez6);
    expect(monzaGap).toBeGreaterThan(0);
    expect(galvGap).toBeGreaterThan(0);
    expect(monzaGap / monza.publishedM).toBeGreaterThan(galvGap / galvez6.publishedM);
  });
});

describe("race and tower", () => {
  it("produces a full classification with sane gaps", () => {
    const entries = CARS.map((c, i) => entry(c, `e${i}`, { pitLap: 5 + i }));
    const res = simulateRace(entries, galvez6, REG, 7);
    expect(res.entries).toHaveLength(CARS.length);
    expect(res.entries[0]?.position).toBe(1);
    expect(res.entries[0]?.gapS).toBe(0);
    for (const e of res.entries) {
      expect(e.laps).toHaveLength(REG.laps);
      expect(Number.isFinite(e.totalS)).toBe(true);
      expect(e.gapS).toBeGreaterThanOrEqual(0);
    }
    // gaps must be monotonic down the order
    for (let i = 1; i < res.entries.length; i++) {
      expect(res.entries[i]?.gapS).toBeGreaterThanOrEqual(res.entries[i - 1]?.gapS ?? 0);
    }
  });

  it("the tower has one tick per lap and the fastest lap fires exactly once", () => {
    const entries = CARS.map((c, i) => entry(c, `e${i}`, { pitLap: 5 + i }));
    const res = simulateRace(entries, galvez6, REG, 7);
    const ticks = buildTower(res, entries);
    expect(ticks).toHaveLength(REG.laps);
    const flags = ticks.flatMap((t) => t.rows.filter((r) => r.isFastestLap));
    expect(flags).toHaveLength(1);
    for (const t of ticks) {
      expect(t.rows).toHaveLength(CARS.length);
      expect(t.rows[0]?.position).toBe(1);
      expect(t.rows[0]?.gapS).toBe(0);
    }
  });

  it("pitting costs roughly the pit loss", () => {
    const e = entry(CARS[0] as CarSpec, "solo", { pitLap: 5, consistency: 1 });
    const res = simulateRace([e], galvez6, REG, 3);
    const laps = res.entries[0]?.laps ?? [];
    const pit = laps[4]?.timeS ?? 0;
    const before = laps[3]?.timeS ?? 0;
    expect(pit - before).toBeGreaterThan(REG.pitLossS - 3);
    expect(pit - before).toBeLessThan(REG.pitLossS + 3);
  });
});
