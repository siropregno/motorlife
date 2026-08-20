import { useEffect, useRef } from "react";
import type { CarSpec } from "@contracts/car";
import { derive } from "@sim/derive";
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

const LAYOUT: Record<string, string> = {
  FWD: "Front / front",
  FR: "Front / rear",
  MR: "Mid / rear",
  RR: "Rear / rear",
  AWD: "All-wheel",
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
 * Both halves of the data are here on purpose. The TYPED block is what someone
 * read off an infobox and entered; the DERIVED block is everything the model
 * worked out from it. Keeping them visibly separate is what stops a derived
 * number from being mistaken for a published one.
 */
export function CarModal({ spec, price, credits, owned, onBuy, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const car = derive(spec);
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
          <h3 className="modal-section">As published</h3>
          <div className="spec-list">
            <Row k="Power" v={`${hp} hp`} alt={`${spec.kW} kW`} />
            <Row k="Mass" v={`${spec.kg} kg`} />
            <Row k="Top speed" v={spec.topKph ? `${spec.topKph} km/h` : "—"} />
            <Row k="0–100" v={spec.zeroTo100 ? `${spec.zeroTo100.toFixed(1)} s` : "—"} />
            <Row k="Torque" v={spec.nm ? `${spec.nm} Nm` : "—"} />
            <Row k="Layout" v={LAYOUT[spec.layout] ?? spec.layout} />
            <Row k="Year" v={String(spec.year)} />
          </div>

          <h3 className="modal-section">Worked out</h3>
          <div className="spec-list">
            <Row k="Drag area" v={`${car.cda.toFixed(3)} m²`} />
            <Row k="Lateral grip" v={`${car.muLateral.toFixed(3)} g`} />
            <Row k="Power / tonne" v={`${car.kWPerTonne.toFixed(0)} kW`} />
            <Row k="Calibration k" v={car.k.toFixed(3)} />
            <Row k="Class index" v={`${rating.letter}${rating.index}`} />
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
            <button className="modal-x" onClick={() => ref.current?.close()} aria-label="Close">
              ×
            </button>
          </header>

          <div className="modal-hero">
            {spec.image ? (
              <img src={spec.image} alt={`${spec.make} ${spec.model}`} />
            ) : (
              <span className="modal-nophoto">no photo</span>
            )}
          </div>

          <p className="note">
            Drag area came out of the published top speed, grip out of era and class, and k was
            fitted to the published 0&ndash;100
            {spec.zeroTo100 ? "" : " (not published for this car, so k stays 1)"}. The class
            index is a mean lap over the reference circuits, not a formula.
          </p>

          <footer className="modal-foot">
            <span className="modal-rarity">{spec.rarity}</span>
            <span className="modal-price">{formatCredits(price)} cr</span>
            {owned ? (
              <button className="btn" disabled>
                Owned
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
                {afford ? "Buy" : `Short ${formatCredits(price - credits)} cr`}
              </button>
            )}
          </footer>
        </div>
      </div>
    </dialog>
  );
}
