import type { Entry } from "@contracts/race";
import type { TrackSpec } from "@contracts/track";
import { CARS } from "@catalog/cars";
import { TRACKS, trackById } from "@catalog/tracks";
import { derive } from "@sim/derive";
import { applySetup } from "@sim/setup";
import { lapTime } from "@sim/lap";
import { simulateRace } from "@sim/race";
import { fmt } from "@sim/tower";

const FLAT = { aero: 0, gearing: 0, springs: 0, brakeBias: 0 };

console.log("=== CATALOGUE ===");
for (const s of CARS) {
  const c = derive(s);
  console.log(
    `  ${(s.make + " " + s.model).padEnd(18)} ${String(Math.round(s.kW * 1.35962)).padStart(4)} hp  ` +
      `CdA ${c.cda.toFixed(3)}  grip ${c.muLateral.toFixed(3)}  k ${c.k.toFixed(3)}  ${c.confidence}`,
  );
}

console.log("\n=== REFERENCE LAPS (flat setup, medium, fresh) ===");
const hdr = TRACKS.map((t) => t.name.replace("Autodromo ", "").slice(0, 22).padEnd(24)).join("");
console.log("  " + "".padEnd(20) + hdr);
for (const s of CARS) {
  const c = derive(s);
  const eff = applySetup(c, FLAT, { compound: "medium", age: 0 }, 0);
  const row = TRACKS.map((t) => fmt(lapTime(eff, t as TrackSpec)).padEnd(24)).join("");
  console.log("  " + (s.make + " " + s.model).padEnd(20) + row);
}

console.log("\n=== AERO TRADE (does the optimum move with the circuit?) ===");
const m5 = derive(CARS[0]!);
for (const t of TRACKS) {
  let best = { aero: 0, time: Infinity };
  for (let a = -1; a <= 1.0001; a += 0.1) {
    const eff = applySetup(m5, { ...FLAT, aero: a }, { compound: "medium", age: 0 }, 0);
    const time = lapTime(eff, t as TrackSpec);
    if (time < best.time) best = { aero: a, time };
  }
  console.log(`  ${t.name.slice(0, 34).padEnd(36)} best aero ${best.aero >= 0 ? "+" : ""}${best.aero.toFixed(1)}  ${fmt(best.time)}`);
}

console.log("\n=== A RACE ===");
const track = trackById("galvez-12") as TrackSpec;
const entries: Entry[] = CARS.map((c, i) => ({
  id: c.id,
  label: `${c.make} ${c.model}`.toUpperCase(),
  car: c,
  build: { carId: c.id, compound: "medium" as const, setup: FLAT },
  consistency: 0.8,
  pitLap: 5 + i,
  pitCompound: "soft" as const,
  you: i === 0,
}));
const res = simulateRace(entries, track, { laps: 14, pitLossS: 22 }, 12345);
console.log(`  ${track.name}, 14 laps`);
for (const e of res.entries) {
  const label = entries.find((x) => x.id === e.entryId)!.label;
  console.log(
    `   P${e.position} ${label.padEnd(22)} ${fmt(e.totalS)}  gap ${e.gapS === 0 ? "LEADER" : "+" + e.gapS.toFixed(3)}  best ${fmt(e.bestLapS)}`,
  );
}
console.log(`  fastest lap: ${fmt(res.fastestLapS)}`);
