import type { TrackSpec, Regulation } from "@contracts/track";
import type {
  Entry,
  RaceResult,
  EntryResult,
  LapRecord,
  Compound,
} from "@contracts/race";
import { derive } from "./derive";
import { applyMods } from "./mods";
import { applySetup } from "./setup";
import { lapTime } from "./lap";
import { mulberry32 } from "./rng";

/** Peak size of the seeded per-lap variation, seconds, at zero consistency. */
const JITTER_S = 0.45;

/**
 * The whole race, computed in one go. This is the keystone: sim() is a pure
 * function of (entries, track, regulation, seed), so the same inputs give the
 * same race on any machine, forever.
 *
 * The timing tower is therefore not a live simulation. It replays a result
 * that finished computing before the first row moved, which is why the
 * presentation is cheap and why a duel can be re-run server-side to verify it.
 */
export function simulateRace(
  entries: Entry[],
  track: TrackSpec,
  reg: Regulation,
  seed: number,
): RaceResult {
  const rng = mulberry32(seed);
  /*
   * Mods are applied AFTER derive, once per entry, before the first lap. See
   * mods.ts: derive fits the calibration scalar against the car's published
   * 0-100, so a part that raised power on the way in would be cancelled out by
   * its own fit. Done here rather than inside the lap loop because a part does
   * not change during a race -- the tyres do, and that is what applySetup is
   * for.
   */
  const cars = entries.map((e) => applyMods(derive(e.car), e.build.mods, e.build.km ?? 0));

  const laps: LapRecord[][] = entries.map(() => []);
  const tyreAge = entries.map(() => 0);
  const compound: Compound[] = entries.map((e) => e.build.compound);
  const total = entries.map(() => 0);

  for (let lap = 1; lap <= reg.laps; lap++) {
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i] as Entry;
      const car = cars[i] as (typeof cars)[number];
      tyreAge[i] = (tyreAge[i] as number) + 1;

      const eff = applySetup(
        car,
        entry.build.setup,
        { compound: compound[i] as Compound, age: tyreAge[i] as number },
        lap,
      );
      let t = lapTime(eff, track);

      // draw for every entry on every lap, in a fixed order, so the stream of
      // random numbers does not depend on who happens to be racing
      const jitter = (rng() - 0.5) * 2 * JITTER_S * (1 - entry.consistency);
      t += jitter;

      const pitted = lap === entry.pitLap;
      if (pitted) {
        t += reg.pitLossS;
        tyreAge[i] = 0;
        compound[i] = entry.pitCompound;
      }

      total[i] = (total[i] as number) + t;
      (laps[i] as LapRecord[]).push({
        lap,
        timeS: t,
        totalS: total[i] as number,
        compound: compound[i] as Compound,
        tyreAge: tyreAge[i] as number,
        pitted,
      });
    }
  }

  const order = entries
    .map((e, i) => ({ i, id: e.id, totalS: total[i] as number }))
    .sort((a, b) => a.totalS - b.totalS);
  const winner = order[0] as { totalS: number };

  const results: EntryResult[] = order.map((o, pos) => {
    const myLaps = laps[o.i] as LapRecord[];
    return {
      entryId: o.id,
      laps: myLaps,
      totalS: o.totalS,
      bestLapS: Math.min(...myLaps.map((l) => l.timeS)),
      position: pos + 1,
      gapS: o.totalS - winner.totalS,
    };
  });

  let fastestLapS = Infinity;
  let fastestLapEntryId = "";
  for (const r of results) {
    if (r.bestLapS < fastestLapS) {
      fastestLapS = r.bestLapS;
      fastestLapEntryId = r.entryId;
    }
  }

  return {
    trackId: track.id,
    seed,
    laps: reg.laps,
    entries: results,
    fastestLapS,
    fastestLapEntryId,
  };
}
