import { useMemo } from "react";
import type { Build, Compound, Setup as SetupValues } from "@contracts/race";
import type { TrackSpec } from "@contracts/track";
import { carById } from "@catalog/cars";
import { TRACKS } from "@catalog/tracks";
import { derive } from "@sim/derive";
import { applySetup } from "@sim/setup";
import { lapTime } from "@sim/lap";
import { fmt } from "@sim/tower";
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
/** Laps into a stint that the second readout reports. */
const STINT = 7;

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

  // The whole point of a pure sim in the browser: this is the real model, not
  // an approximation of it, so the number moves the moment a slider does.
  const { predicted, baseline, worn } = useMemo(() => {
    if (!car) return { predicted: 0, baseline: 0, worn: 0 };
    const fresh = { compound: build.compound, age: 0 };
    const now = applySetup(car, build.setup, fresh, 0);
    const flat = applySetup(car, FLAT, fresh, 0);
    // The same setup at the end of a stint. Downforce and stiff springs buy
    // pace on lap one and hand it back by lap seven, so these two numbers
    // pull in opposite directions and there is no single one to solve for.
    const late = applySetup(car, build.setup, { compound: build.compound, age: STINT }, STINT);
    return {
      predicted: lapTime(now, track),
      baseline: lapTime(flat, track),
      worn: lapTime(late, track),
    };
  }, [car, build, track]);

  if (!spec || !car) return <p>Car not found.</p>;

  const delta = predicted - baseline;
  const deltaClass = Math.abs(delta) < 0.005 ? "" : delta < 0 ? "down" : "up";

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
            <h3>Predicted lap</h3>
            <p className={`laptime ${deltaClass}`}>{fmt(predicted)}</p>
            <p className="laptime-delta">
              {delta === 0
                ? "baseline setup"
                : `${delta > 0 ? "+" : ""}${delta.toFixed(3)} vs baseline`}
            </p>
            <dl className="stats" style={{ marginTop: 14 }}>
              <div>
                <dt>Lap 1, fresh</dt>
                <dd>{fmt(predicted)}</dd>
              </div>
              <div>
                <dt>Lap {STINT}, same set</dt>
                <dd>{fmt(worn)}</dd>
              </div>
            </dl>
            <p className="note">
              Wing and stiff springs buy the first number and spend the second. There is no
              setting that wins both, so how you split them is the decision -- and it depends
              on how long you mean to stay out.
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
