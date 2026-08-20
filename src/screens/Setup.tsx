import { useMemo } from "react";
import type { Build, Compound, Setup as SetupValues } from "@contracts/race";
import type { TrackSpec } from "@contracts/track";
import { carById } from "@catalog/cars";
import { TRACKS } from "@catalog/tracks";
import { derive } from "@sim/derive";
import { applySetup, wearMultiplier } from "@sim/setup";
import { CarCard } from "../components/CarCard";

interface Props {
  carId: string;
  build: Build;
  onBuild: (b: Build) => void;
  track: TrackSpec;
  onTrack: (id: string) => void;
  onRace: () => void;
  onBack: () => void;
}

const FLAT: SetupValues = { aero: 0, gearing: 0, springs: 0, brakeBias: 0 };

const SLIDERS: {
  key: keyof SetupValues;
  name: string;
  low: string;
  high: string;
}[] = [
  { key: "aero", name: "Aero", low: "Low drag", high: "More wing" },
  { key: "gearing", name: "Gearing", low: "Short", high: "Long" },
  { key: "springs", name: "Springs", low: "Soft", high: "Stiff" },
  { key: "brakeBias", name: "Brake bias", low: "Forward", high: "Rearward" },
];

const COMPOUNDS: Compound[] = ["soft", "medium", "hard"];

export function SetupScreen({ carId, build, onBuild, track, onTrack, onRace, onBack }: Props) {
  const spec = carById(carId);
  const car = useMemo(() => (spec ? derive(spec) : null), [spec]);

  /**
   * No lap time. There used to be one, and it decided the game: move a
   * slider, read the number, keep what is quicker, and the car is perfectly
   * tuned in four sweeps by someone who understands none of it. A single
   * scalar objective is a solver prompt, not a decision.
   *
   * These three are the real model -- same `applySetup` the race runs -- read
   * as ratios against the stock setup and rounded onto five steps. They pull
   * against each other on purpose: wing buys corners and spends straights and
   * tyres. Which of the three matters is a property of the circuit, and that
   * judgement is the part the number was doing for you.
   */
  const feel = useMemo(() => {
    if (!car) return [];
    const fresh = { compound: build.compound, age: 0 };
    const now = applySetup(car, build.setup, fresh, 0);
    const flat = applySetup(car, FLAT, fresh, 0);
    const step = (ratio: number, span: number) =>
      Math.max(1, Math.min(5, Math.round(3 + ((ratio - 1) / span) * 2)));
    const grip = (c: typeof now) => c.muLateral * (1 + c.clA);
    return [
      {
        name: "Straights",
        level: step(flat.cda / now.cda, 0.3),
        words: ["Very draggy", "Draggy", "Stock", "Slippery", "Very slippery"],
      },
      {
        name: "Corners",
        level: step(grip(now) / grip(flat), 0.35),
        words: ["Very loose", "Loose", "Stock", "Planted", "Very planted"],
      },
      {
        name: "Tyre life",
        level: step(1 / wearMultiplier(build.setup), 0.18),
        words: ["Burns them", "Short", "Stock", "Long", "Very long"],
      },
    ];
  }, [car, build]);

  if (!spec || !car) return <p>Car not found.</p>;

  const set = (key: keyof SetupValues, v: number) =>
    onBuild({ ...build, setup: { ...build.setup, [key]: v } });

  return (
    <>
      <h2 className="screen-title">Setup</h2>
      <p className="screen-sub">
        Every slider has an optimum, and on most of them it moves with the circuit.
      </p>

      <div className="setup-grid">
        <div style={{ display: "grid", gap: 20 }}>
          <CarCard spec={spec} />

          <div className="panel">
            <h3>Car feel</h3>
            <div className="feel">
              {feel.map((f) => (
                <div className="feel-row" key={f.name}>
                  <span className="feel-name">{f.name}</span>
                  <span className="feel-bar" aria-hidden="true">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <i key={i} className={i <= f.level ? "on" : ""} />
                    ))}
                  </span>
                  <span className="feel-word">{f.words[f.level - 1]}</span>
                </div>
              ))}
            </div>
            <p className="note">
              No lap time on purpose. These three fight each other -- wing buys corners and
              spends straights and tyres -- and which one is worth having is a property of the
              circuit, not of the car. Read the track, then decide.
            </p>
          </div>

          <div className="panel">
            <h3>What the sim worked out</h3>
            <dl className="stats">
              <div>
                <dt>Derived CdA</dt>
                <dd>{car.cda.toFixed(3)} m²</dd>
              </div>
              <div>
                <dt>Lateral grip</dt>
                <dd>{car.muLateral.toFixed(3)} g</dd>
              </div>
              <div>
                <dt>Power / tonne</dt>
                <dd>{car.kWPerTonne.toFixed(0)} kW</dd>
              </div>
              <div>
                <dt>Calibration k</dt>
                <dd>{car.k.toFixed(3)}</dd>
              </div>
            </dl>
            <p className="note">
              Only the six typed fields are real input. CdA came out of the published top speed,
              grip out of era and class, and k was fitted to the published 0&ndash;100
              {spec.zeroTo100 ? "" : " (not published for this car, so k stays 1)"}.
            </p>
          </div>
        </div>

        <div style={{ display: "grid", gap: 20 }}>
          <div className="panel">
            <h3>Circuit</h3>
            <div className="track-pick">
              {TRACKS.map((t) => (
                <button
                  key={t.id}
                  className={`track-opt${t.id === track.id ? " on" : ""}`}
                  onClick={() => onTrack(t.id)}
                >
                  <span>{t.name}</span>
                  <span className="meta">
                    {(t.publishedM / 1000).toFixed(3)} km · {t.corners} corners
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="panel">
            <h3>Tyres</h3>
            <div className="chips">
              {COMPOUNDS.map((c) => (
                <button
                  key={c}
                  className={`chip${build.compound === c ? " on" : ""}`}
                  onClick={() => onBuild({ ...build, compound: c })}
                >
                  {c}
                </button>
              ))}
            </div>
            <p className="note">
              Softer is quicker while it lasts. Over a stint that stops being true.
            </p>
          </div>

          <div className="panel">
            <h3>Setup</h3>
            {SLIDERS.map((s) => (
              <div className="slider" key={s.key}>
                <div className="slider-head">
                  <span className="slider-name">{s.name}</span>
                  <span className="slider-val">
                    {build.setup[s.key] > 0 ? "+" : ""}
                    {build.setup[s.key].toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min={-1}
                  max={1}
                  step={0.05}
                  value={build.setup[s.key]}
                  onChange={(e) => set(s.key, Number(e.target.value))}
                  aria-label={s.name}
                />
                <div className="slider-hint">
                  <span>{s.low}</span>
                  <span>{s.high}</span>
                </div>
              </div>
            ))}
            <button className="btn ghost" onClick={() => onBuild({ ...build, setup: FLAT })}>
              Reset
            </button>
          </div>
        </div>
      </div>

      <div className="row" style={{ marginTop: 26, justifyContent: "space-between" }}>
        <button className="btn" onClick={onBack}>
          ← Garage
        </button>
        <button className="btn primary" onClick={onRace}>
          Race →
        </button>
      </div>
    </>
  );
}
