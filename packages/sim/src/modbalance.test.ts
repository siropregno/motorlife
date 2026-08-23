import { describe, it, expect } from "vitest";
import { writeFileSync } from "node:fs";
import type { Mods } from "@contracts/mods";
import type { Setup } from "@contracts/race";
import { CARS } from "@catalog/cars";
import { TRACKS } from "@catalog/tracks";
import { derive } from "./derive";
import { applyMods } from "./mods";
import { applySetup } from "./setup";
import { lapTime } from "./lap";
import { classIndex } from "./rating";

/**
 * The balance harness, for parts.
 *
 * balance.test.ts asks what a SETUP is worth. This asks what a BUILD is worth,
 * and the questions that can only go wrong once parts exist:
 *
 *   1. Does a full build still leave a setup game? If bolting on every part
 *      makes the sliders irrelevant, the workshop has eaten the tuning, and
 *      the tuning is what the whole game is about.
 *   2. Does a part move the class index enough to matter and not so much that
 *      one turbo jumps two classes? A part that cannot move the index makes
 *      the class cap a formality; one that moves it 150 points makes every
 *      modified car unraceable in its own class.
 *   3. Is any single part strictly dominant? If one of the four is worth more
 *      than the other three together at every circuit on every car, there is
 *      one build and the other parts are decoration.
 *
 * Same shape as balance.test.ts: it writes a table you can read, and asserts
 * the properties that would otherwise fail silently.
 */

const KEYS = ["aero", "gearing", "springs", "brakeBias"] as const;
const STEPS = [-1, -0.5, 0, 0.5, 1];
const FLAT: Setup = { aero: 0, gearing: 0, springs: 0, brakeBias: 0 };

const FULL: Mods = { turbo: 3, exhaust: 3, suspension: 3, gearbox: 3, wearKm: 0 };
const STOCK: Mods = { wearKm: 0 };

/**
 * A stint, not a fresh lap -- the same objective the rivals and the setup
 * harness use. Parts that buy grip spend tyre life, and one fresh lap cannot
 * see the second half of that trade.
 */
const AGES = [0, 3, 6];

function stint(carId: string, trackId: string, mods: Mods, s: Setup): number {
  const spec = CARS.find((c) => c.id === carId)!;
  const track = TRACKS.find((t) => t.id === trackId)!;
  const car = applyMods(derive(spec), mods, 0);
  return (
    AGES.reduce(
      (sum, age) =>
        sum + lapTime(applySetup(car, s, { compound: "medium", age }, age + 1), track),
      0,
    ) / AGES.length
  );
}

/** Coarse coordinate descent. Five steps rather than nine: this table is
    24 combinations x 2 builds and the question is the WINDOW, not the exact
    optimum to two decimal places. */
function solve(carId: string, trackId: string, mods: Mods): { flat: number; best: number } {
  let opt = FLAT;
  let best = stint(carId, trackId, mods, FLAT);
  for (let pass = 0; pass < 2; pass++) {
    for (const k of KEYS) {
      for (const v of STEPS) {
        const cand = { ...opt, [k]: v };
        const t = stint(carId, trackId, mods, cand);
        if (t < best) {
          best = t;
          opt = cand;
        }
      }
    }
  }
  return { flat: stint(carId, trackId, mods, FLAT), best };
}

/** A sample rather than the whole catalogue: the solve is 2 x 24 lap sets per
    row and the property is about the model, not about any one car. */
const SAMPLE = [
  "renault-12-tl",
  "ford-falcon-sprint",
  "bmw-m3-e30",
  "bmw-m5-e60",
  "ferrari-f40",
];

interface Row {
  car: string;
  track: string;
  stockBest: number;
  fullBest: number;
  /** What the whole build is worth, as a fraction of lap time. */
  gain: number;
  /** The setup window that remains once every part is on the car. */
  fullWindow: number;
  stockWindow: number;
}

const ROWS: Row[] = SAMPLE.flatMap((id) =>
  TRACKS.map((t) => {
    const stock = solve(id, t.id, STOCK);
    const full = solve(id, t.id, FULL);
    return {
      car: CARS.find((c) => c.id === id)!.model,
      track: t.id,
      stockBest: stock.best,
      fullBest: full.best,
      gain: (stock.best - full.best) / stock.best,
      fullWindow: (full.flat - full.best) / full.flat,
      stockWindow: (stock.flat - stock.best) / stock.flat,
    };
  }),
);

/** Per-part index movement, on the frozen reference set. */
const refs = TRACKS.filter((t) => ["monza", "galvez-6", "galvez-12"].includes(t.id));
const indexOf = (id: string, mods: Mods) =>
  classIndex(applyMods(derive(CARS.find((c) => c.id === id)!), mods, 0), refs);

describe("mod balance", () => {
  it("writes the table", () => {
    const lines = [
      "car              track        stock     full     gain   window stock   window full",
      "".padEnd(78, "-"),
    ];
    for (const r of ROWS) {
      lines.push(
        `${r.car.padEnd(16)} ${r.track.padEnd(11)} ${r.stockBest.toFixed(2).padStart(7)} ` +
          `${r.fullBest.toFixed(2).padStart(8)} ${(r.gain * 100).toFixed(2).padStart(7)}% ` +
          `${(r.stockWindow * 100).toFixed(2).padStart(12)}% ${(r.fullWindow * 100).toFixed(2).padStart(12)}%`,
      );
    }

    lines.push("", "index movement per part, on the reference set");
    lines.push("car              stock   turbo3  exh3  susp3  gbox3   full   full-stock");
    for (const id of SAMPLE) {
      const base = indexOf(id, STOCK);
      const one = (m: Mods) => indexOf(id, { ...STOCK, ...m });
      lines.push(
        `${CARS.find((c) => c.id === id)!.model.padEnd(16)} ${String(base).padStart(5)} ` +
          `${String(one({ turbo: 3 })).padStart(7)} ${String(one({ exhaust: 3 })).padStart(5)} ` +
          `${String(one({ suspension: 3 })).padStart(6)} ${String(one({ gearbox: 3 })).padStart(6)} ` +
          `${String(indexOf(id, FULL)).padStart(6)} ${String(indexOf(id, FULL) - base).padStart(12)}`,
      );
    }
    writeFileSync("balance-mods.txt", lines.join("\n"));
    expect(ROWS.length).toBeGreaterThan(0);
  });

  it("a full build still leaves a setup game", () => {
    /*
     * The failure this exists to catch: parts so strong that the sliders stop
     * mattering. If a fully built car has no setup window, the workshop has
     * eaten the tuning -- and the tuning is the question the whole game was
     * built to ask.
     */
    for (const r of ROWS) {
      expect(r.fullWindow, `${r.car} @ ${r.track}`).toBeGreaterThan(0.0015);
      expect(r.fullWindow, `${r.car} @ ${r.track}`).toBeLessThan(0.03);
    }
  });

  it("a build is worth having, and is not the whole race", () => {
    for (const r of ROWS) {
      // worth real time, or nobody would buy it
      expect(r.gain, `${r.car} @ ${r.track}`).toBeGreaterThan(0.02);
      // but not so much that a stock car in the same class is not racing
      expect(r.gain, `${r.car} @ ${r.track}`).toBeLessThan(0.25);
    }
  });

  it("moves the class index enough to matter, and not by a whole ladder", () => {
    /*
     * A class band is 60 points. A full build has to move the index enough
     * that the cap notices -- otherwise "buy the cheapest car in the class and
     * fit everything" is unanswerable -- and not so far that one build jumps
     * three classes and there is nothing left to race.
     */
    for (const id of SAMPLE) {
      const moved = indexOf(id, FULL) - indexOf(id, STOCK);
      expect(moved, id).toBeGreaterThan(20);
      expect(moved, id).toBeLessThan(180);
    }
  });

  it("every part is worth fitting, and none of them is the whole build", () => {
    /*
     * Two failures, opposite ends.
     *
     * A part worth nothing is decoration -- you would never fit it and could
     * not feel it if you did. The gearbox was exactly that in the first cut of
     * the table: one index point on every car in the sample, because shift
     * time alone is fourteen tenths a race against a lap measured in minutes.
     * It moves driveline efficiency now, which is felt on the whole lap.
     *
     * The bound is on the part's SHARE ACROSS THE WHOLE SAMPLE, not on its
     * share at one car and one circuit, and that distinction is the third
     * attempt at this test -- the first two kept flagging physics.
     *
     * A grip part legitimately owns two thirds of the build for a 1830 kg
     * saloon at Gálvez No. 6, the twistiest circuit in the game: that car is
     * heavy, that corner is slow, and there is nothing a turbo can do about
     * either. Asserting otherwise was asserting that no car anywhere may have
     * a part that suits it, which is the opposite of what a build should be.
     *
     * What is actually a defect is a part that dominates EVERYWHERE. So the
     * share is summed over every car at every circuit before it is judged.
     */
    const perPart: Record<string, number> = {
      turbo: 0,
      exhaust: 0,
      suspension: 0,
      gearbox: 0,
    };
    let grand = 0;
    for (const id of SAMPLE) {
      for (const t of TRACKS) {
        const ref = stint(id, t.id, STOCK, FLAT);
        const solo = {
          turbo: ref - stint(id, t.id, { ...STOCK, turbo: 3 }, FLAT),
          exhaust: ref - stint(id, t.id, { ...STOCK, exhaust: 3 }, FLAT),
          suspension: ref - stint(id, t.id, { ...STOCK, suspension: 3 }, FLAT),
          gearbox: ref - stint(id, t.id, { ...STOCK, gearbox: 3 }, FLAT),
        };
        for (const [part, gain] of Object.entries(solo)) {
          // worth nothing anywhere is the other failure, and it is per-case:
          // a part that does nothing on one car at one circuit is a part you
          // were sold for no reason.
          expect(gain, `${id}/${part} @ ${t.id} is worth nothing`).toBeGreaterThan(0);
          perPart[part] = (perPart[part] ?? 0) + gain;
          grand += gain;
        }
      }
    }
    for (const [part, total] of Object.entries(perPart)) {
      expect(total / grand, `${part} dominates every car at every circuit`).toBeLessThan(0.5);
    }
  });

  it("which part matters most depends on the car", () => {
    /*
     * The property that makes a build a decision rather than a shopping list.
     *
     * Power leads on a slow car and grip leads on a fast one, and neither is
     * written anywhere -- it falls out of the traction limit. An F40 already
     * makes more power than its tyres can put down out of a corner, so the
     * next kilowatt is worth less to it than the next unit of grip; the R12
     * has 43 kW per tonne and is the opposite case. Measured at Monza, the
     * circuit where power should be at its most valuable, so the F40 wanting
     * grip even there is the strong version of the claim.
     *
     * If this fails, one part has become correct everywhere and the workshop
     * is a ladder everybody climbs in the same order.
     */
    const monza = TRACKS.find((t) => t.id === "monza")!;
    const leads = (id: string) => {
      const ref = stint(id, monza.id, STOCK, FLAT);
      const turbo = ref - stint(id, monza.id, { ...STOCK, turbo: 3 }, FLAT);
      const susp = ref - stint(id, monza.id, { ...STOCK, suspension: 3 }, FLAT);
      return turbo > susp ? "turbo" : "suspension";
    };
    expect(leads("renault-12-tl"), "43 kW/tonne should want power").toBe("turbo");
    expect(leads("ferrari-f40"), "320 kW/tonne should want grip").toBe("suspension");
  });
});
