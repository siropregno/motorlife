import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Build, Compound, Entry } from "@contracts/race";
import type { TrackSpec, Regulation } from "@contracts/track";
import { carById } from "@catalog/cars";
import { ratingOf } from "@catalog/rating";
import { eligibleFor, purseFor, payoutFor, formatCredits } from "@progression/economy";
import { simulateRace } from "@sim/race";
import { buildTower, fmt, fmtGap } from "@sim/tower";
import { hashSeed } from "@sim/rng";

interface Props {
  carId: string;
  build: Build;
  track: TrackSpec;
  onFinish: (position: number, gridSize: number) => void;
  onBack: () => void;
}

const REG: Regulation = { laps: 14, pitLossS: 22 };
const GRID_SIZE = 4;
const TICK_MS = 620;
const LINGER_MS = 1500;

const RIVAL_PLAN: {
  driver: string;
  compound: Compound;
  pitCompound: Compound;
  pitLap: number;
  consistency: number;
  aero: number;
}[] = [
  { driver: "M. REYES", compound: "soft", pitCompound: "medium", pitLap: 6, consistency: 0.88, aero: 0.3 },
  { driver: "K. DOYLE", compound: "medium", pitCompound: "soft", pitLap: 8, consistency: 0.81, aero: -0.2 },
  { driver: "A. PETROV", compound: "hard", pitCompound: "soft", pitLap: 10, consistency: 0.75, aero: 0.6 },
];

export function Race({ carId, build, track, onFinish, onBack }: Props) {
  const you = carById(carId);
  const rating = you ? ratingOf(you) : null;

  const { ticks, entries, purse } = useMemo(() => {
    if (!you || !rating) return { ticks: [], entries: [] as Entry[], purse: 0 };

    /**
     * The field is drawn from cars eligible for YOUR class. That is the whole
     * job of the class cap: without it a 507 hp M5 shares a grid with a 54 hp
     * R12 and wins by nearly seven minutes, which is physically correct and
     * completely pointless as a race.
     */
    const pool = eligibleFor(rating.letter);
    const others = pool.filter((c) => c.id !== carId);

    const list: Entry[] = [
      {
        id: "you",
        label: "YOU",
        car: you,
        build,
        consistency: 0.82,
        pitLap: 7,
        pitCompound: build.compound === "soft" ? "medium" : "soft",
        you: true,
      },
    ];
    for (let i = 0; i < GRID_SIZE - 1; i++) {
      const plan = RIVAL_PLAN[i % RIVAL_PLAN.length]!;
      // if the class is thin, the same car appears again under another driver.
      // a spec field is a fair race, and it puts the result on setup and
      // strategy rather than on who brought the bigger engine.
      const c = others.length > 0 ? others[i % others.length]! : you;
      list.push({
        id: `rival-${i}`,
        label: plan.driver,
        car: c,
        build: {
          carId: c.id,
          compound: plan.compound,
          setup: { aero: plan.aero, gearing: 0, springs: 0.3, brakeBias: 0.2 },
        },
        consistency: plan.consistency,
        pitLap: plan.pitLap,
        pitCompound: plan.pitCompound,
        you: false,
      });
    }

    const seed = hashSeed(`${carId}|${track.id}|${JSON.stringify(build)}`);
    const result = simulateRace(list, track, REG, seed);
    return {
      ticks: buildTower(result, list),
      entries: list,
      purse: purseFor(rating.letter),
    };
  }, [carId, build, track, you, rating]);

  const [lap, setLap] = useState(1);
  const [feed, setFeed] = useState<{ text: string; kind: string }[]>([]);
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const paid = useRef(false);

  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    paid.current = false;
    setLap(1);
    setFeed(ticks[0]?.events ?? []);
    setDone(false);
    if (reduced || ticks.length === 0) {
      setLap(Math.max(1, ticks.length));
      setDone(true);
      return;
    }
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
      timer.current = setTimeout(step, t?.events.length ? LINGER_MS : TICK_MS);
    };
    timer.current = setTimeout(step, 900);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [ticks, reduced]);

  const finalRows = ticks[ticks.length - 1]?.rows ?? [];
  const myFinish = finalRows.find((r) => r.entryId === "you")?.position ?? entries.length;
  const won = rating ? payoutFor(rating.letter, myFinish, entries.length) : 0;

  // pay once, when the flag actually falls
  useEffect(() => {
    if (done && !paid.current && entries.length > 0) {
      paid.current = true;
      onFinish(myFinish, entries.length);
    }
  }, [done, myFinish, entries.length, onFinish]);

  const skipToFlag = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    setLap(ticks.length);
    setFeed(ticks[ticks.length - 1]?.events ?? []);
    setDone(true);
  }, [ticks]);

  const rowOf = new Map((ticks[lap - 1]?.rows ?? []).map((r) => [r.entryId, r]));

  return (
    <>
      <h2 className="screen-title">Race</h2>
      <p className="screen-sub">
        Class {rating?.letter} · purse {formatCredits(purse)} cr. The race finished computing
        before the first row moved; this is playback.
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

        <div className="tower-body" style={{ ["--rows" as string]: String(entries.length) }}>
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
          <span className="payout">
            P{myFinish} · +{formatCredits(won)} cr
          </span>
        ) : (
          <button className="btn ghost" onClick={skipToFlag}>
            Skip to flag
          </button>
        )}
      </div>
    </>
  );
}
