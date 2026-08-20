import type { TrackSpec } from "@contracts/track";
import { TURN_IN_S_PER_TONNE, RACING_LINE_GAIN_M, ACCEL_STEP_M } from "./constants";
import { resistance, tractiveForce, brakeDecel, cornerSpeed } from "./physics";
import { gearFactor, type EffectiveCar } from "./setup";

/** Safety net. The longest real straight is ~2 km, so ~4000 steps at 0.5 m. */
const MAX_STEPS_PER_STRAIGHT = 100_000;

/**
 * One lap. A track is an ordered list of segments; walk it carrying a speed
 * and add up the time.
 *
 * Road cars make no meaningful downforce, so corner speed is the closed form
 * sqrt(mu*g*r) with no iteration. Straights integrate a point mass against
 * drag and the traction limit, then brake late enough to make the next
 * corner. No gear ratios, no torque curve, no per-car aero -- and the
 * trade-offs still fall out, because they are consequences of the equations
 * rather than rules written on top of them.
 */
export function lapTime(car: EffectiveCar, track: TrackSpec): number {
  const brake = brakeDecel(car);
  const m = car.massKg;

  // corner speeds first: a straight needs to know what it is braking for
  const cornerV: number[] = [];
  for (const seg of track.segments) {
    if (seg.kind === "corner") {
      cornerV.push(cornerSpeed(car, seg.r + RACING_LINE_GAIN_M) * car.gearTopSpeed);
    }
  }
  if (cornerV.length === 0) return Infinity;

  const turnIn = TURN_IN_S_PER_TONNE * (m / 1000);
  let t = 0;
  let ci = 0;
  // enter the lap at the speed of the corner that precedes the start line
  let v = cornerV[cornerV.length - 1] as number;

  for (const seg of track.segments) {
    if (seg.kind === "corner") {
      const vc = cornerV[ci] as number;
      // a steady-state model never simulates changing direction, which is
      // exactly where a light car beats a heavy one. charge turn-in by mass.
      t += seg.len / vc + turnIn;
      v = vc;
      ci++;
      continue;
    }

    const vNext = cornerV[ci % cornerV.length] as number;
    let s = 0;
    let guard = 0;
    while (s < seg.len) {
      if (guard++ > MAX_STEPS_PER_STRAIGHT) {
        // a wrong lap time that looks reasonable is worse than a crash
        throw new Error(
          `lapTime did not converge on a ${seg.len.toFixed(0)} m straight ` +
            `(v=${v.toFixed(1)} m/s, target=${vNext.toFixed(1)} m/s)`,
        );
      }
      const remaining = seg.len - s;
      const dBrake = v > vNext ? (v * v - vNext * vNext) / (2 * brake) : 0;
      if (dBrake >= remaining) {
        const vEnd = Math.sqrt(Math.max(vNext * vNext, v * v - 2 * brake * remaining));
        t += (v - vEnd) / brake;
        v = vEnd;
        break;
      }
      const drive = tractiveForce(car, v, m) * gearFactor(car, v);
      const a = (drive - resistance(car, v, m)) / m;
      if (a <= 0) {
        // Terminal velocity: the car cannot go any faster on this straight.
        // Coast to the braking point, brake, and leave -- do NOT loop. The
        // coast distance is exactly `remaining - dBrake`, so the next pass
        // would compare dBrake against itself and floating point decides
        // whether that terminates. It is an infinite loop roughly half the
        // time, and only for cars underpowered enough to reach terminal
        // velocity, which is why a fast car never trips it.
        const coast = remaining - dBrake;
        if (coast > 0) t += coast / v;
        if (v > vNext) {
          t += (v - vNext) / brake;
          v = vNext;
        }
        break;
      }
      const step = Math.min(ACCEL_STEP_M, remaining);
      t += step / v;
      v += (a * step) / v;
      s += step;
    }
  }
  return t;
}

/** Fastest theoretical lap on empty tanks and fresh tyres. For the garage. */
export function referenceLap(car: EffectiveCar, track: TrackSpec): number {
  return lapTime({ ...car, massKg: car.kg }, track);
}
