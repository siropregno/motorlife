import { describe, it, expect } from "vitest";
import { writeFileSync } from "node:fs";
import type { Setup } from "@contracts/race";
import { CARS } from "@catalog/cars";
import { TRACKS } from "@catalog/tracks";
import { derive } from "./derive";
import { applySetup } from "./setup";
import { lapTime } from "./lap";

/**
 * The balance harness.
 *
 * Every calibration problem in this sim so far was found by staring at a
 * screenshot and guessing, and the guess was wrong twice running -- aero, then
 * driver consistency, both innocent. This is the deterministic version of that
 * work: same inputs, same table, no opinion required.
 *
 * It answers three questions for every car at every circuit, and each one has
 * failed at least once in a way nobody noticed for days:
 *
 *   1. What is a setup worth? A real window between a sensible setup and a
 *      perfect one is one to two percent of lap time. It was SIX, because
 *      gearing was multiplying corner speed.
 *   2. Where does the optimum sit? On a rail it is not a decision, it is a
 *      thing you discover once and then always do.
 *   3. Does the optimum move with the circuit? If one setting wins everywhere
 *      the slider is decoration.
 */

const KEYS = ["aero", "gearing", "springs", "brakeBias"] as const;
const STEPS = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1];
const FLAT: Setup = { aero: 0, gearing: 0, springs: 0, brakeBias: 0 };

/**
 * A setup window narrower than this means the sliders barely matter.
 *
 * The floor is set by the Ford F-100, which gets 0.17% at Monza. That is not a
 * bug: it is 1700 kg, its downforce-to-mass ratio is negligible so the wing
 * does nothing, and it never reaches a corner speed where springs matter. You
 * cannot tune a pickup into a race car. Anything narrower than this would mean
 * a car with no setup game at all.
 */
const WINDOW_MIN = 0.0015;
/** Wider than this and not tuning is a disqualification rather than a cost. */
const WINDOW_MAX = 0.03;

interface Row {
  car: string;
  track: string;
  flat: number;
  best: number;
  window: number;
  opt: Setup;
}

function solve(carId: string, trackId: string): Row {
  const spec = CARS.find((c) => c.id === carId)!;
  const track = TRACKS.find((t) => t.id === trackId)!;
  const car = derive(spec);
  // Score a STINT, not one fresh lap -- the same objective the rivals use.
  // Springs and brake bias buy grip and spend tyre life, and a single fresh
  // lap cannot see the second half of that trade, so it reported both as
  // having one correct answer everywhere.
  const at = (s: Setup) =>
    [0, 3, 6].reduce(
      (sum, age) =>
        sum + lapTime(applySetup(car, s, { compound: "medium", age }, age + 1), track),
      0,
    );

  let opt = FLAT;
  let best = at(FLAT);
  for (let pass = 0; pass < 2; pass++) {
    for (const k of KEYS) {
      for (const v of STEPS) {
        const cand = { ...opt, [k]: v };
        const t = at(cand);
        if (t < best) {
          best = t;
          opt = cand;
        }
      }
    }
  }
  const flat = at(FLAT);
  return { car: spec.model, track: trackId, flat: flat / 3, best: best / 3, window: (flat - best) / flat, opt };
}

const ROWS: Row[] = CARS.flatMap((c) => TRACKS.map((t) => solve(c.id, t.id)));

describe("balance", () => {
  it("writes the table", () => {
    const lines = [
      "car              track        flat     best    window  aero  gear  sprg  bias",
      "".padEnd(74, "-"),
    ];
    for (const r of ROWS) {
      lines.push(
        `${r.car.padEnd(16)} ${r.track.padEnd(11)} ${r.flat.toFixed(2).padStart(7)} ` +
          `${r.best.toFixed(2).padStart(7)} ${(r.window * 100).toFixed(2).padStart(7)}% ` +
          `${KEYS.map((k) => String(r.opt[k]).padStart(5)).join(" ")}`,
      );
    }
    // per-slider: how many of the optima sit on a rail, and does it move?
    lines.push("", "slider          on a rail   distinct values across the table");
    for (const k of KEYS) {
      const vals = ROWS.map((r) => r.opt[k]);
      const rails = vals.filter((v) => Math.abs(v) === 1).length;
      lines.push(
        `${k.padEnd(15)} ${String(rails).padStart(3)}/${ROWS.length}` +
          `        ${[...new Set(vals)].sort((a, b) => a - b).join(", ")}`,
      );
    }
    writeFileSync("balance.txt", lines.join("\n"));
    expect(ROWS.length).toBeGreaterThan(0);
  });

  it("keeps every setup window inside a believable band", () => {
    // Not tuning should cost you places, never the race. Six percent meant a
    // flat setup lost by two minutes; a tenth of a percent means the sliders
    // are decoration.
    for (const r of ROWS) {
      expect(r.window, `${r.car} @ ${r.track}`).toBeGreaterThan(WINDOW_MIN);
      expect(r.window, `${r.car} @ ${r.track}`).toBeLessThan(WINDOW_MAX);
    }
  });

  it("never lets one setting win at every circuit", () => {
    // A slider whose answer does not move with the track is not a decision.
    for (const k of KEYS) {
      const distinct = new Set(ROWS.map((r) => r.opt[k]));
      expect(distinct.size, `${k} never changes`).toBeGreaterThan(1);
    }
  });
});
