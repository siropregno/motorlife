import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Build, Compound, Entry, Setup as SetupValues } from "@contracts/race";
import type { TrackSpec, Regulation } from "@contracts/track";
import type { CarSpec } from "@contracts/car";
import { carById } from "@catalog/cars";
import { ratingOf } from "@catalog/rating";
import { eligibleFor, purseFor, payoutFor, formatCredits } from "@progression/economy";
import { derive } from "@sim/derive";
import { applySetup } from "@sim/setup";
import { lapTime } from "@sim/lap";
import { simulateRace } from "@sim/race";
import { buildTower, fmt, fmtGap } from "@sim/tower";
import { hashSeed, mulberry32 } from "@sim/rng";

interface Props {
  carId: string;
  build: Build;
  track: TrackSpec;
  /** Which event this is. Seeds the race, so each one is a fresh draw. */
  racesRun: number;
  onFinish: (position: number, gridSize: number) => void;
  onBack: () => void;
}

const REG: Regulation = { laps: 14, pitLossS: 22 };
const GRID_SIZE = 4;
const TICK_MS = 620;
const LINGER_MS = 1500;

/**
 * How far from the player's rating a car may be and still make the grid.
 *
 * The class cap alone is not a field. Class C admits anything up to 600, so a
 * C587 raced a D512 and won by a minute -- correct physics, pointless race.
 * The cap decides what you may ENTER; this decides who turns up.
 */
const RIVAL_BAND = 25;

/**
 * Rivals no longer carry a hardcoded aero number. They carry a `miss`: how far
 * off the optimum setup this driver ends up.
 *
 * That was the real reason you won every race. You sat on the sliders until
 * the predicted lap bottomed out; they ran aero 0.3 / -0.2 / 0.6 on every
 * circuit whatever the circuit wanted. Three IDENTICAL F-100s finished 43
 * seconds apart on setup alone. Skill is now "how close to the right setup",
 * which is the same axis you are playing on.
 */
const RIVAL_PLAN: {
  driver: string;
  compound: Compound;
  pitCompound: Compound;
  pitOffset: number;
  consistency: number;
  miss: number;
}[] = [
  { driver: "M. REYES", compound: "soft", pitCompound: "medium", pitOffset: -1, consistency: 0.88, miss: 0.08 },
  { driver: "K. DOYLE", compound: "medium", pitCompound: "soft", pitOffset: 0, consistency: 0.84, miss: 0.22 },
  { driver: "A. PETROV", compound: "soft", pitCompound: "medium", pitOffset: 1, consistency: 0.8, miss: 0.4 },
];

const FLAT: SetupValues = { aero: 0, gearing: 0, springs: 0, brakeBias: 0 };
const KEYS = ["aero", "gearing", "springs", "brakeBias"] as const;
const STEPS = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1];

/**
 * Coordinate descent over the four sliders: two passes, nine steps each, so
 * 72 lap solves per car. It is the same `lapTime` the Setup screen shows you,
 * so a rival is measured against the identical model you tune against -- no
 * separate difficulty fudge, and nothing for the sim to disagree with.
 */
function bestSetup(spec: CarSpec, track: TrackSpec, compound: Compound): SetupValues {
  const car = derive(spec);
  const fresh = { compound, age: 0 };
  const score = (s: SetupValues) => lapTime(applySetup(car, s, fresh, 0), track);

  let best = FLAT;
  let bestT = score(best);
  for (let pass = 0; pass < 2; pass++) {
    for (const key of KEYS) {
      for (const v of STEPS) {
        if (v === best[key]) continue;
        const cand = { ...best, [key]: v };
        const t = score(cand);
        if (t < bestT) {
          bestT = t;
          best = cand;
        }
      }
    }
  }
  return best;
}

/**
 * Push a setup off the optimum by EXACTLY `miss` on every slider. Only the
 * direction is random.
 *
 * The first version randomised the magnitude too, and it made skill
 * non-monotonic: K. DOYLE on miss 0.3 beat M. REYES on miss 0.15 because the
 * dice put him closer to the optimum. A driver rated worse has to finish
 * worse, or the rating means nothing.
 *
 * Direction is forced inward at the rails. Without that, an optimum sitting
 * at +1 clamps the error away half the time and hands the rival a perfect
 * setup by accident.
 */
function detune(opt: SetupValues, miss: number, rng: () => number): SetupValues {
  const off = (v: number) => {
    const dir = v + miss > 1 ? -1 : v - miss < -1 ? 1 : rng() < 0.5 ? -1 : 1;
    return v + dir * miss;
  };
  return { aero: off(opt.aero), gearing: off(opt.gearing), springs: off(opt.springs), brakeBias: off(opt.brakeBias) };
}

export function Race({ carId, build, track, racesRun, onFinish, onBack }: Props) {
  const you = carById(carId);
  const rating = you ? ratingOf(you) : null;

  /*
   * The event, frozen on mount.
   *
   * The seed used to be hash(car | track | build), which made "the same setup"
   * and "the same race" the same statement -- re-racing was byte-identical
   * forever, so tuning was a puzzle you solved once. Keying it to the event
   * instead keeps every property that mattered (a finished race is still
   * exactly reproducible, and the tower is still playback) while making the
   * next race a new draw.
   *
   * Frozen because racesRun increments when the payout lands. As a live
   * dependency it would re-simulate the race you are watching and change the
   * result halfway through the playback.
   */
  const [eventSeed] = useState(() => hashSeed(`${racesRun}|${carId}|${track.id}`));

  const { ticks, entries, purse } = useMemo(() => {
    if (!you || !rating) return { ticks: [], entries: [] as Entry[], purse: 0 };

    /**
     * The field is drawn from cars eligible for YOUR class. That is the whole
     * job of the class cap: without it a 507 hp M5 shares a grid with a 54 hp
     * R12 and wins by nearly seven minutes, which is physically correct and
     * completely pointless as a race.
     */
    // Your own car is IN the pool. A rival in the identical car is the fairest
    // race on the grid and the cleanest test of setup, so there was never a
    // reason to exclude it -- it just sorts to the front, being zero away from
    // your own rating.
    const pool = eligibleFor(rating.letter);
    // closest on rating first, and only cars inside the band -- unless the
    // class is too thin to fill a grid, in which case anything under the cap
    // is better than an empty field.
    const near = pool
      .map((c) => ({ c, d: Math.abs(ratingOf(c).index - rating.index) }))
      .filter((x) => x.d <= RIVAL_BAND)
      .sort((a, b) => a.d - b.d)
      .map((x) => x.c);
    const others = near.length > 0 ? near : pool;

    const seed = hashSeed(`${eventSeed}|${JSON.stringify(build)}`);
    const rng = mulberry32(seed);
    // Rotate where in that list the grid starts, so a thin class does not
    // serve the same three cars every event. Seeded, so the event still
    // reproduces exactly.
    const start = others.length > 0 ? Math.floor(rng() * others.length) : 0;

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
      const c = others.length > 0 ? others[(start + i) % others.length]! : you;
      list.push({
        id: `rival-${i}`,
        label: plan.driver,
        car: c,
        build: {
          carId: c.id,
          compound: plan.compound,
          setup: detune(bestSetup(c, track, plan.compound), plan.miss, rng),
        },
        consistency: plan.consistency,
        // mid-race, give or take a lap. The old plan put A. PETROV on hards
        // until lap 10 of 14, which is most of where his 52 seconds went.
        pitLap: Math.round(REG.laps / 2) + plan.pitOffset,
        pitCompound: plan.pitCompound,
        you: false,
      });
    }

    const result = simulateRace(list, track, REG, seed);
    return {
      ticks: buildTower(result, list),
      entries: list,
      purse: purseFor(rating.letter),
    };
  }, [carId, build, track, you, rating, eventSeed]);

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
