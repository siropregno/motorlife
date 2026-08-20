import type { TrackSpec } from "@contracts/track";
import { CARS } from "@catalog/cars";
import { TRACKS } from "@catalog/tracks";
import { derive } from "@sim/derive";
import { applySetup } from "@sim/setup";
import { lapTime } from "@sim/lap";
const FLAT = { aero: 0, gearing: 0, springs: 0, brakeBias: 0 };
const m5 = derive(CARS[0]!);
console.log("M5 E60, lap time vs aero (seconds relative to aero=0)");
console.log("aero      " + TRACKS.map(t => t.id.padEnd(14)).join(""));
for (let a = -1; a <= 1.001; a += 0.25) {
  const row = TRACKS.map(t => {
    const base = lapTime(applySetup(m5, FLAT, {compound:"medium",age:0}, 0), t as TrackSpec);
    const now  = lapTime(applySetup(m5, {...FLAT, aero:a}, {compound:"medium",age:0}, 0), t as TrackSpec);
    const d = now - base;
    return ((d>=0?"+":"") + d.toFixed(3)).padEnd(14);
  }).join("");
  console.log((a>=0?"+":"") + a.toFixed(2) + "     " + row);
}
const eff = applySetup(m5, {...FLAT, aero:1}, {compound:"medium",age:0}, 0);
const eff0 = applySetup(m5, FLAT, {compound:"medium",age:0}, 0);
console.log("\nclA  aero=0", eff0.clA.toFixed(3), " aero=+1", eff.clA.toFixed(3));
console.log("cda  aero=0", eff0.cda.toFixed(3), " aero=+1", eff.cda.toFixed(3));
