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
  /** Leaving the tower. Only reachable once the flag has fallen. */
  onClose: () => void;
}

const REG: Regulation = { laps: 14, pitLossS: 22 };
const GRID_SIZE = 4;
const TICK_MS = 620;
const LINGER_MS = 1500;

/**
 * How far off your pace AT THIS CIRCUIT a car may be and still make the grid,
 * as a fraction of lap time.
 *
 * This used to compare class-index points, and the class index is a MEAN over
 * the reference tracks. A mean cannot see that one car is a Monza car and
 * another is a Galvez car. The Falcon Sprint sits 30 points from the 128 IAVA
 * -- comfortably inside the old band -- and laps Galvez No. 12 eleven percent
 * slower, both of them optimally set up. It finished 195 seconds down. No
 * amount of tuning closes that, because it was never a tuning problem.
 *
 * The split now: the class CAP decides what you may enter, and it stays
 * global because a car's class is a property of the car. This decides who
 * turns up, and it is local because a race happens at one circuit.
 */
const RIVAL_PACE_BAND = 0.04;

/**
 * A roster the event drafts three names from, not a fixed grid.
 *
 * This used to be an array of exactly three, used in order, every race. The
 * cars rotated and the drivers never did, so every event was M. REYES,
 * K. DOYLE and A. PETROV again.
 *
 * Skill belongs to the NAME, not the grid slot. M. REYES is quick every time
 * you meet him. That is the difference between a field and a random number:
 * you learn who to worry about.
 */
const DRIVERS: { name: string; miss: number; consistency: number }[] = [
  { name: "M. REYES", miss: 0.08, consistency: 0.94 },
  { name: "N. BJORK", miss: 0.5, consistency: 0.93 },
  { name: "L. FERRARO", miss: 0.14, consistency: 0.92 },
  { name: "G. ANDRADE", miss: 0.18, consistency: 0.9 },
  { name: "D. OKONKWO", miss: 0.22, consistency: 0.89 },
  { name: "K. DOYLE", miss: 0.27, consistency: 0.87 },
  { name: "R. TANAKA", miss: 0.33, consistency: 0.85 },
  { name: "S. VARGAS", miss: 0.4, consistency: 0.83 },
  { name: "P. MOREAU", miss: 0.5, consistency: 0.81 },
  { name: "A. PETROV", miss: 0.62, consistency: 0.79 },
];

/** Strategy is per grid slot, so a race is never three identical plans. */
const SLOT_PLAN: { compound: Compound; pitCompound: Compound; pitOffset: number }[] = [
  { compound: "soft", pitCompound: "medium", pitOffset: -1 },
  { compound: "medium", pitCompound: "soft", pitOffset: 0 },
  { compound: "soft", pitCompound: "medium", pitOffset: 1 },
];

const FLAT: SetupValues = { aero: 0, gearing: 0, springs: 0, brakeBias: 0 };
const KEYS = ["aero", "gearing", "springs", "brakeBias"] as const;
const STEPS = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1];

/**
 * Tyre ages a rival scores a setup at. Three samples across a stint, not one
 * fresh lap.
 *
 * Optimising the fresh lap was the same mistake the Setup readout used to
 * invite: now that wing and springs cost tyre life, the setup that wins lap
 * one is not the setup that wins the stint. A rival aiming at lap one would
 * over-wing itself exactly the way a player reading only the top number
 * does, and would never punish you for doing it.
 */
const WEAR_SAMPLES = [0, 3, 6];

/**
 * Coordinate descent over the four sliders: two passes, nine steps each,
 * scored across the stint, so 216 lap solves per car. It is the same
 * `lapTime` the Setup screen shows you, so a rival is measured against the
 * identical model you tune against -- no separate difficulty fudge, and
 * nothing for the sim to disagree with.
 */
function bestSetup(spec: CarSpec, track: TrackSpec, compound: Compound): SetupValues {
  const car = derive(spec);
  const score = (s: SetupValues) =>
    WEAR_SAMPLES.reduce(
      (sum, age) => sum + lapTime(applySetup(car, s, { compound, age }, age + 1), track),
      0,
    );

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

export function Race({ carId, build, track, racesRun, onFinish, onClose }: Props) {
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
    // One flat-setup lap per candidate at THIS circuit. Flat rather than
    // optimum because it is a fair common baseline and costs one lap solve
    // instead of 216 -- it understates a car that gains a lot from setup, but
    // by a couple of percent rather than the eleven the global index missed.
    const flat = { aero: 0, gearing: 0, springs: 0, brakeBias: 0 };
    const paceOf = (c: typeof you) =>
      lapTime(applySetup(derive(c), flat, { compound: "medium", age: 0 }, 0), track);
    const myPace = paceOf(you);
    const scored = pool
      .map((c) => ({ c, d: Math.abs(paceOf(c) / myPace - 1) }))
      .sort((a, b) => a.d - b.d);
    const near = scored.filter((x) => x.d <= RIVAL_PACE_BAND).map((x) => x.c);
    // if nothing at this circuit is close, take the closest anyway -- a thin
    // grid beats an empty one, and the catalogue is the real fix
    const others =
      near.length > 0 ? near : scored.slice(0, GRID_SIZE - 1).map((x) => x.c);

    const seed = hashSeed(`${eventSeed}|${JSON.stringify(build)}`);
    const rng = mulberry32(seed);

    /*
     * Shuffle the band. This used to take a consecutive WINDOW from it, and
     * `others` is sorted by closeness to your rating, so a window of three
     * over class C's four eligible cars always served adjacent entries -- the
     * grid looked identical every event even though the start index moved.
     */
    const field = [...others];
    for (let i = 0; i < Math.min(GRID_SIZE - 1, field.length); i++) {
      const j = i + Math.floor(rng() * (field.length - i));
      const a = field[i]!;
      field[i] = field[j]!;
      field[j] = a;
    }

    const list: Entry[] = [
      {
        id: "you",
        label: "VOS",
        car: you,
        build,
        consistency: 0.82,
        pitLap: 7,
        pitCompound: build.compound === "soft" ? "medium" : "soft",
        you: true,
      },
    ];
    /*
     * Draft the field: a seeded partial Fisher-Yates over the roster, so the
     * three names differ event to event and nobody turns up twice.
     *
     * The first pick is drawn from the sharp end only. A uniform draw means
     * some events hand you the three slowest drivers on the list and the race
     * is over at the lights -- the first field this produced was MOREAU,
     * TANAKA and VARGAS, and it was won by 38 seconds. There is always someone
     * worth beating; who fills the other two seats is open.
     */
    const roster = [...DRIVERS];
    const CONTENDERS = 3; // DRIVERS is ordered by miss, so these are the quick ones
    const swap = (i: number, j: number) => {
      const a = roster[i]!;
      roster[i] = roster[j]!;
      roster[j] = a;
    };
    swap(0, Math.floor(rng() * CONTENDERS));
    for (let i = 1; i < GRID_SIZE - 1; i++) {
      swap(i, i + Math.floor(rng() * (roster.length - i)));
    }

    for (let i = 0; i < GRID_SIZE - 1; i++) {
      const who = roster[i]!;
      const plan = SLOT_PLAN[i % SLOT_PLAN.length]!;
      // if the class is thin, the same car appears again under another driver.
      // a spec field is a fair race, and it puts the result on setup and
      // strategy rather than on who brought the bigger engine.
      const c = field.length > 0 ? field[i % field.length]! : you;
      list.push({
        id: `rival-${i}`,
        label: who.name,
        car: c,
        build: {
          carId: c.id,
          compound: plan.compound,
          setup: detune(bestSetup(c, track, plan.compound), who.miss, rng),
        },
        consistency: who.consistency,
        // mid-race, give or take a lap. The old plan put a driver on hards
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
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
  }, []);

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
    <dialog
      ref={dialog}
      className="modal race-modal"
      onClose={onClose}
      /*
       * Escape is refused until the flag falls.
       *
       * <dialog> fires `cancel` before it closes, and preventDefault on that
       * is the only way to keep showModal()'s Escape from taking the tower off
       * the screen mid-race. It has to be refused rather than allowed-and-
       * handled: the payout lands when the race reaches the flag, so a race
       * dismissed on lap 9 would be a race you entered, watched, and got
       * nothing for, with no way back to it.
       *
       * There is no backdrop-click handler for the same reason -- and once
       * `done` is true the arrow in the corner is the way out, so Escape being
       * live after that is a convenience rather than a trapdoor.
       */
      onCancel={(e) => {
        if (!done) e.preventDefault();
      }}
    >
      <div className="race-body">
      <h2 className="screen-title">Carrera</h2>
      <p className="screen-sub">
        Clase {rating?.letter} · premio {formatCredits(purse)} cr.
      </p>

      <div className="tower">
        <div className="tower-top">
          <span className="tower-track">{track.name}</span>
          <span className="tower-lap">
            VUELTA <b>{lap}</b> / {REG.laps}
          </span>
        </div>

        <div className="tower-head">
          <span>Pos</span>
          <span>Piloto</span>
          <span style={{ textAlign: "right" }}>Dif</span>
          <span className="ty">Goma</span>
          <span style={{ textAlign: "right" }}>Última</span>
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

      {/*
        * While the race runs: the way to the end of it. Once it is over: what
        * you won, and the arrow out. The arrow only exists after the flag,
        * which is the same rule Escape follows -- there is one way to leave a
        * race and it is to finish it.
        */}
      <div className="row race-foot">
        {done ? (
          <>
            <span className="payout">
              P{myFinish} · +{formatCredits(won)} cr
            </span>
            <button
              className="btn primary race-out"
              autoFocus
              onClick={() => dialog.current?.close()}
            >
              Al garaje
            </button>
          </>
        ) : (
          <button className="btn ghost" onClick={skipToFlag}>
            Ir a la bandera
          </button>
        )}
      </div>
      </div>
    </dialog>
  );
}
