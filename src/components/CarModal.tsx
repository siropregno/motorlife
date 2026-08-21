import { useEffect, useRef } from "react";
import type { CarSpec } from "@contracts/car";
import { ratingOf } from "@catalog/rating";
import { formatCredits } from "@progression/economy";
import { classTierClass } from "../lib/tiers";

interface Props {
  spec: CarSpec;
  price: number;
  credits: number;
  owned: boolean;
  onBuy?: (id: string, price: number) => void;
  onClose: () => void;
}

/** Motor / eje motriz. "Central" for MR is what the Argentine press called it. */
const LAYOUT: Record<string, string> = {
  FWD: "Delantero / delantera",
  FR: "Delantero / trasera",
  MR: "Central / trasera",
  RR: "Trasero / trasera",
  AWD: "Integral",
};

const RARITY: Record<string, string> = {
  common: "común",
  uncommon: "poco común",
  rare: "rara",
  epic: "épica",
  legendary: "legendaria",
  apex: "suprema",
};

function Row({ k, v, alt }: { k: string; v: string; alt?: string }) {
  return (
    <div className="spec-row">
      <span className="spec-k">{k}</span>
      <span className="spec-v">
        {v}
        {alt ? <em>{alt}</em> : null}
      </span>
    </div>
  );
}

/**
 * The full spec sheet for one car.
 *
 * A native <dialog> rather than a hand-rolled overlay: showModal() gives the
 * focus trap, the Escape key, the inert background and ::backdrop for free,
 * and all of those are things a div gets wrong quietly.
 *
 * Published figures only. The derived block that used to sit under these --
 * drag area, grip, calibration k -- was engine-room detail on a screen whose
 * job is "do I want this car", and dropping it lets the photo be a strip
 * rather than a near-square slab.
 */
export function CarModal({ spec, price, credits, owned, onBuy, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const rating = ratingOf(spec);
  const tier = classTierClass(rating.letter);
  const hp = Math.round(spec.kW * 1.35962);
  const afford = credits >= price;

  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className="modal"
      onClose={onClose}
      // a click that lands on the dialog element itself is a click on the
      // backdrop -- anything inside hits a child and never reaches here
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
    >
      <div className="modal-grid">
        <aside className="modal-specs">
          <h3 className="modal-section">Ficha técnica</h3>
          <div className="spec-list">
            <Row k="Potencia" v={`${hp} CV`} alt={`${spec.kW} kW`} />
            <Row k="Peso" v={`${spec.kg} kg`} />
            <Row k="Velocidad máx." v={spec.topKph ? `${spec.topKph} km/h` : "—"} />
            <Row k="0–100" v={spec.zeroTo100 ? `${spec.zeroTo100.toFixed(1)} s` : "—"} />
            <Row k="Par motor" v={spec.nm ? `${spec.nm} Nm` : "—"} />
            <Row k="Motor / tracción" v={LAYOUT[spec.layout] ?? spec.layout} />
            <Row k="Año" v={String(spec.year)} />
          </div>
        </aside>

        <div className="modal-main">
          <header className="modal-head">
            <span className="modal-logo">
              {spec.logo ? <img src={spec.logo} alt={spec.make} /> : null}
            </span>
            <div className="modal-title">
              <h2>
                {spec.make} {spec.model}
              </h2>
              <p>{spec.blurb}</p>
            </div>
            <span className={`klass-badge ${tier}`}>
              {rating.letter}
              {rating.index}
            </span>
            <button className="modal-x" onClick={() => ref.current?.close()} aria-label="Cerrar">
              ×
            </button>
          </header>

          <div className="modal-hero">
            {spec.image ? (
              <img src={spec.image} alt={`${spec.make} ${spec.model}`} />
            ) : (
              <span className="modal-nophoto">sin foto</span>
            )}
          </div>

          <footer className="modal-foot">
            <span className="modal-rarity">{RARITY[spec.rarity] ?? spec.rarity}</span>
            <span className="modal-price">{formatCredits(price)} cr</span>
            {owned ? (
              <button className="btn" disabled>
                En tu garaje
              </button>
            ) : (
              <button
                className={`btn${afford ? " primary" : ""}`}
                disabled={!afford || !onBuy}
                onClick={() => {
                  onBuy?.(spec.id, price);
                  ref.current?.close();
                }}
              >
                {afford ? "Comprar" : `Faltan ${formatCredits(price - credits)} cr`}
              </button>
            )}
          </footer>
        </div>
      </div>
    </dialog>
  );
}
