import { useEffect, useMemo, useRef, useState } from "react";
import type { Build, Compound, Entry } from "@contracts/race";
import type { TrackSpec, Regulation } from "@contracts/track";
import { CARS, carById } from "@catalog/cars";
import { simulateRace } from "@sim/race";
import { buildTower, fmt, fmtGap } from "@sim/tower";
import { hashSeed } from "@sim/rng";

interface Props {
  carId: string;
  build: Build;
  track: TrackSpec;
  onBack: () => void;
}

const REG: Regulation = { laps: 14, pitLossS: 22 };
const TICK_MS = 620;
const LINGER_MS = 1500;

/**
 * Rivals get a driver name and their own strategy, so the pit window is not
 * all on one lap and the tower reads as a grid rather than a car list.
 */
const RIVAL_PLAN: {
  driver: string;
  compound: Compound;
  pitCompound: Compound;
  pitLap: number;
  consistency: number;
}[] = [
  { driver: "M. REYES", compound: "soft", pitCompound: "medium", pitLap: 6, consistency: 0.86 },
  { driver: "K. DOYLE", compound: "medium", pitCompound: "soft", pitLap: 8, consistency: 0.8 },
  { driver: "A. PETROV", compound: "hard", pitCompound: "soft", pitLap: 10, consistency: 0.74 },
  { driver: "J. LANG", compound: "medium", pitCompound: "medium", pitLap: 9, consistency: 0.78 },
];

export function Race({ carId, build, track, onBack }: Props) {
  const you = carById(carId);

  const { ticks, entries } = useMemo(() => {
    const rivals = CARS.filter((c) => c.id !== carId);
    const list: Entry[] = [
      {
        id: "you",
        label: "YOU",
        car: you!,
        build,
        consistency: 0.82,
        pitLap: 7,
        pitCompound: build.compound === "soft" ? "medium" : "soft",
        you: true,
      },
      ...rivals.map((c, i) => {
        const plan = RIVAL_PLAN[i % RIVAL_PLAN.length]!;
        return {
          id: c.id,
          label: plan.driver,
          car: c,
          build: {
            carId: c.id,
            compound: plan.compound,
            setup: { aero: 0.2, gearing: 0, springs: 0.3, brakeBias: 0.2 },
          },
          consistency: plan.consistency,
          pitLap: plan.pitLap,
          pitCompound: plan.pitCompound,
          you: false,
        } satisfies Entry;
      }),
    ];
    const seed = hashSeed(`${carId}|${track.id}|${JSON.stringify(build)}`);
    const result = simulateRace(list, track, REG, seed);
    return { ticks: buildTower(result, list), entries: list };
  }, [carId, build, track, you]);

  const [lap, setLap] = useState(1);
  const [feed, setFeed] = useState<{ text: string; kind: string }[]>([]);
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    setLap(1);
    setFeed(ticks[0]?.events ?? []);
    setDone(false);
    if (reduced) {
      setLap(ticks.length);
      setFeed(ticks[ticks.length - 1]?.events ?? []);
      setDone(true);
      return;
    }
    // one chained timeout: a single handle to cancel, so StrictMode's double
    // mount cannot leave an orphan running the race at double speed
    let current = 1;
    const step = () => {
      current += 1;
      if (current > ticks.length) {
        setDone(true);
        timer.current = null;
        return;
      }
      setLap(current);
      const t = ticks[current - 1];
      if (t && t.events.length) setFeed((f) => [...f, ...t.events].slice(-4));
      const beat = t?.events.length ? LINGER_MS : TICK_MS;
      timer.current = setTimeout(step, beat);
    };
    timer.current = setTimeout(step, 900);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [ticks, reduced]);

  /**
   * Jumping to the end has to stop the timer first. Setting the lap alone
   * leaves the chained timeout running, and its next firing overwrites the
   * jump from its own closure counter -- which is why skipping used to land
   * on whatever lap happened to be next.
   */
  const skipToFlag = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    setLap(ticks.length);
    setFeed(ticks[ticks.length - 1]?.events ?? []);
    setDone(true);
  };

  const tick = ticks[lap - 1];
  const rowOf = new Map((tick?.rows ?? []).map((r) => [r.entryId, r]));

  return (
    <>
      <h2 className="screen-title">Race</h2>
      <p className="screen-sub">
        The race finished computing before the first row moved. This is playback.
      </p>

      <div className="tower">
        <div className="tower-top">
          <span className="tower-track">{track.name}</span>
          <span className="tower-lap">
            LAP <b>{lap}</b> / {REG.laps}
          </span>
        </div>

        <div className="tower-head">
          <span>Pos</span>
          <span>Driver</span>
          <span style={{ textAlign: "right" }}>Gap</span>
          <span className="ty">Tyre</span>
          <span style={{ textAlign: "right" }}>Last</span>
        </div>

        <div
          className="tower-body"
          style={{ ["--rows" as string]: String(entries.length) }}
        >
          {entries.map((e) => {
            const r = rowOf.get(e.id);
            if (!r) return null;
            const lt = r.isFastestLap ? "lt fl" : r.isPersonalBest ? "lt pb" : "lt";
            return (
              <div
                key={e.id}
                className={`tower-row${e.you ? " you" : ""}`}
                style={{ transform: `translateY(${(r.position - 1) * 46}px)` }}
              >
                <span className="pos">{r.position}</span>
                <span className="nm">
                  <b>{e.label}</b>
                  <em>
                    {e.car.make} {e.car.model}
                  </em>
                </span>
                <span className="gp">{fmtGap(r.gapS)}</span>
                <span className="ty">
                  <i className={`ty-${r.compound}`}>{r.compound[0]?.toUpperCase()}</i>
                  {r.tyreAge}
                </span>
                <span className={lt}>{fmt(r.lastLapS)}</span>
              </div>
            );
          })}
        </div>

        <div className="tower-feed">
          {feed.map((f, i) => (
            <div key={`${f.text}-${i}`} className={f.kind}>
              {f.text}
            </div>
          ))}
        </div>
      </div>

      <div className="row" style={{ marginTop: 26, justifyContent: "space-between" }}>
        <button className="btn" onClick={onBack}>
          ← Setup
        </button>
        {done ? (
          <span className="crumb">Race complete</span>
        ) : (
          <button className="btn ghost" onClick={skipToFlag}>
            Skip to flag
          </button>
        )}
      </div>
    </>
  );
}
