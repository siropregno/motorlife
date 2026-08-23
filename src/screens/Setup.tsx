import { useMemo } from "react";
import type { Mods } from "@contracts/mods";
import type { Build, Compound, Setup as SetupValues } from "@contracts/race";
import type { TrackSpec } from "@contracts/track";
import { carById } from "@catalog/cars";
import { TRACKS } from "@catalog/tracks";
import { derive } from "@sim/derive";
import { applyMods } from "@sim/mods";
import { applySetup, wearMultiplier } from "@sim/setup";
import { CarCard } from "../components/CarCard";
import { TrackMap } from "../components/TrackMap";

interface Props {
  carId: string;
  /** The odometer of the car you are in, straight off the save. */
  km: number;
  /** What is bolted to it. The readout below is the modified car, not the model. */
  mods?: Mods | undefined;
  /** Its photo, in the colour you own it in. */
  image?: string | undefined;
  build: Build;
  onBuild: (b: Build) => void;
  track: TrackSpec;
  onTrack: (id: string) => void;
  onRace: () => void;
}

const FLAT: SetupValues = { aero: 0, gearing: 0, springs: 0, brakeBias: 0 };

const SLIDERS: {
  key: keyof SetupValues;
  name: string;
  low: string;
  high: string;
}[] = [
  { key: "aero", name: "Aero", low: "Poca carga", high: "Más ala" },
  { key: "gearing", name: "Relación", low: "Corta", high: "Larga" },
  { key: "springs", name: "Suspensión", low: "Blanda", high: "Dura" },
  { key: "brakeBias", name: "Reparto de freno", low: "Adelante", high: "Atrás" },
];

const COMPOUNDS: Compound[] = ["soft", "medium", "hard"];

/** The compound stays "soft" everywhere the sim can see it; only the chip reads Spanish. */
const COMPOUND_LABEL: Record<Compound, string> = {
  soft: "Blando",
  medium: "Medio",
  hard: "Duro",
};

export function SetupScreen({ carId, km, mods, image, build, onBuild, track, onTrack, onRace }: Props) {
  const spec = carById(carId);
  /*
   * The car the sliders are being set on is the car with its parts on it. A
   * readout computed from the catalogue model would tell you how a stock car
   * behaves while you tune a modified one -- and Gomas in particular would be
   * a lie, because a racing suspension is most of what decides how long a set
   * lasts.
   */
  const car = useMemo(
    () => (spec ? applyMods(derive(spec), mods, km) : null),
    [spec, mods, km],
  );

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
        name: "Rectas",
        level: step(flat.cda / now.cda, 0.3),
        words: ["Muy pesado", "Pesado", "De fábrica", "Ligero", "Muy ligero"],
      },
      {
        name: "Curvas",
        level: step(grip(now) / grip(flat), 0.35),
        words: ["Muy suelto", "Suelto", "De fábrica", "Pegado", "Muy pegado"],
      },
      {
        name: "Gomas",
        level: step(1 / wearMultiplier(build.setup), 0.18),
        words: ["Las quema", "Corta", "De fábrica", "Larga", "Muy larga"],
      },
    ];
  }, [car, build]);

  if (!spec || !car) return <p>Auto no encontrado.</p>;

  const set = (key: keyof SetupValues, v: number) =>
    onBuild({ ...build, setup: { ...build.setup, [key]: v } });

  return (
    <>
      <div className="screen-head">
        <h2 className="screen-title">Puesta a punto</h2>
        <p className="screen-sub">
          Cada regulación tiene un óptimo, y en casi todas se mueve con el circuito.
        </p>
      </div>

      <div className="screen-body">
        <div className="setup-grid">
        {/*
          * Left: the car and where it is going. Right: how it behaves, and the
          * two things you turn to change that.
          *
          * The split used to be car+feel on the left against circuit+tyres+
          * sliders on the right, which came out 281px tall beside 770 -- a
          * third of a metre of empty black next to a column that overflowed
          * and scrolled.
          *
          * Comportamiento moved right because of what it IS rather than to
          * even the columns up: it is the readout the sliders move, so it
          * belongs at the top of the column that holds them, where you can see
          * it change as you drag. On the left it was a caption under the car,
          * as far from the controls that drive it as the layout allowed.
          */}
        <div className="setup-col">
          <CarCard spec={spec} km={km} mods={mods} image={image} />

          <div className="panel">
            <h3>Circuito</h3>
            <div className="track-pick">
              {TRACKS.map((t) => (
                <button
                  key={t.id}
                  className={`track-opt${t.id === track.id ? " on" : ""}`}
                  onClick={() => onTrack(t.id)}
                >
                  <span>{t.name}</span>
                  <span className="meta">
                    {(t.publishedM / 1000).toFixed(3)} km · {t.corners} curvas
                  </span>
                </button>
              ))}
            </div>

            {/*
              * The trazado, drawn from the circuit's own segment list -- the
              * same geometry the race laps, so the picture cannot disagree
              * with the track. It answers the question the three names above
              * cannot: Monza is straights and chicanes, Galvez No. 6 wraps an
              * infield inside an oval, and which one you are about to drive
              * decides whether the wing is worth its drag.
              */}
            <div className="track-figure">
              <TrackMap track={track} />
              <dl className="track-facts">
                <div>
                  <dt>Largo</dt>
                  <dd>{(track.publishedM / 1000).toFixed(3)} km</dd>
                </div>
                <div>
                  <dt>Curvas</dt>
                  <dd>{track.corners}</dd>
                </div>
                <div>
                  <dt>Recta más larga</dt>
                  <dd>{track.longestStraightM} m</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>

        <div className="setup-col">
          <div className="panel">
            <h3>Comportamiento</h3>
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
          </div>

          <div className="panel">
            <h3>Gomas</h3>
            <div className="chips">
              {COMPOUNDS.map((c) => (
                <button
                  key={c}
                  className={`chip${build.compound === c ? " on" : ""}`}
                  onClick={() => onBuild({ ...build, compound: c })}
                >
                  {COMPOUND_LABEL[c]}
                </button>
              ))}
            </div>
          </div>

          <div className="panel">
            <h3>Regulaciones</h3>
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
              Reiniciar
            </button>
          </div>
        </div>
        </div>
      </div>

      {/*
        * Correr is a FOOT, outside the scroll box, so it is on screen whatever
        * you are doing with the sliders. It used to sit at the end of the page
        * under the last panel, which meant the button that starts the race was
        * the one thing you had to go looking for.
        */}
      <div className="screen-foot">
        <button className="btn primary" onClick={onRace}>
          Correr →
        </button>
      </div>
    </>
  );
}
