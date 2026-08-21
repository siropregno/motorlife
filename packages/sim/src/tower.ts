import type { Entry, RaceResult, TowerTick, TowerRow, LapRecord } from "@contracts/race";

/**
 * Turn a finished race into the stream the timing tower plays back.
 *
 * Nothing here simulates anything. The race is already over; this is the
 * broadcast feed, and the client is free to run it at 1x, 4x or skip to the
 * flag.
 */
export function buildTower(result: RaceResult, entries: Entry[]): TowerTick[] {
  const label = new Map(entries.map((e) => [e.id, e.label]));

  // running personal bests, so green only fires on the lap it actually happens
  const pbSoFar = new Map<string, boolean[]>();
  for (const r of result.entries) {
    let best = Infinity;
    const flags: boolean[] = [];
    for (const l of r.laps) {
      const isPb = l.timeS < best;
      if (isPb) best = l.timeS;
      flags.push(isPb);
    }
    pbSoFar.set(r.entryId, flags);
  }

  const ticks: TowerTick[] = [];
  for (let lap = 1; lap <= result.laps; lap++) {
    const rows: (TowerRow & { totalS: number })[] = [];
    for (const r of result.entries) {
      const rec = r.laps[lap - 1];
      if (!rec) continue;
      rows.push({
        entryId: r.entryId,
        position: 0,
        gapS: 0,
        lastLapS: rec.timeS,
        compound: rec.compound,
        tyreAge: rec.tyreAge,
        isFastestLap: rec.timeS === result.fastestLapS,
        isPersonalBest: lap > 1 && (pbSoFar.get(r.entryId)?.[lap - 1] ?? false),
        totalS: rec.totalS,
      });
    }
    rows.sort((a, b) => a.totalS - b.totalS);
    const leader = rows[0]?.totalS ?? 0;
    rows.forEach((row, i) => {
      row.position = i + 1;
      row.gapS = row.totalS - leader;
    });

    const events: TowerTick["events"] = [];
    for (const r of result.entries) {
      const rec = r.laps[lap - 1] as LapRecord | undefined;
      if (!rec) continue;
      const name = label.get(r.entryId) ?? r.entryId;
      if (rec.pitted) {
        const prev = lap > 1 ? positionAt(result, r.entryId, lap - 1) : 0;
        events.push({ text: `${name} entra a boxes desde P${prev}`, kind: "" });
      }
      if (rec.timeS === result.fastestLapS) {
        events.push({ text: `${name} vuelta rápida  ${fmt(rec.timeS)}`, kind: "fastest" });
      }
    }
    if (lap === result.laps) {
      const first = rows[0];
      const second = rows[1];
      if (first && second) {
        const name = label.get(first.entryId) ?? first.entryId;
        events.push({
          text: `${name} gana por ${(second.totalS - first.totalS).toFixed(3)}`,
          kind: "good",
        });
      }
    }

    ticks.push({
      lap,
      rows: rows.map(({ totalS: _totalS, ...row }) => row),
      events,
    });
  }
  return ticks;

  function positionAt(res: RaceResult, entryId: string, lap: number): number {
    const totals = res.entries
      .map((r) => ({ id: r.entryId, t: r.laps[lap - 1]?.totalS ?? Infinity }))
      .sort((a, b) => a.t - b.t);
    return totals.findIndex((x) => x.id === entryId) + 1;
  }
}

/** m:ss.mmm */
export function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s < 10 ? "0" : ""}${s.toFixed(3)}`;
}

/** +s.mmm, or LÍDER for the car in front. */
export function fmtGap(gap: number): string {
  return gap === 0 ? "LÍDER" : `+${gap.toFixed(3)}`;
}
