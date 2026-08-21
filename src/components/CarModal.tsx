import { useEffect, useRef, useState } from "react";
import type { CarSpec } from "@contracts/car";
import { ratingOf } from "@catalog/rating";
import { formatCredits, repaintPriceFor, sellValueFor } from "@progression/economy";
import { conditionOf, formatKm } from "@progression/mileage";
import { colorName, colorsOf, imageFor } from "@progression/paint";
import { classTierClass } from "../lib/tiers";

/**
 * What the sheet can DO, which is the only thing that differs between the two
 * places it opens. Everything above the footer -- the figures, the photo, the
 * class badge -- is the same car either way, so it is written once.
 *
 * A discriminated union rather than a pile of optional props: "price but no
 * onSell" and "onSell but no price" are the only two shapes that exist, and
 * six optional fields would let a caller invent a third that renders wrong.
 */
export type CarSheet =
  | {
      kind: "buy";
      price: number;
      credits: number;
      owned: boolean;
      /** km travels with the sale: the odometer you bought is the one you own. */
      onBuy?: (id: string, price: number, km: number) => void;
    }
  | {
      kind: "garage";
      credits: number;
      /** False for your last car: selling it leaves you nothing to race. */
      canSell: boolean;
      isCurrent: boolean;
      onDrive: () => void;
      onSell: () => void;
      onRepaint: (color: string) => void;
    };

interface Props {
  spec: CarSpec;
  km: number;
  color?: string | undefined;
  image?: string | undefined;
  sheet: CarSheet;
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

function Row({ k, v, alt }: { k: string; v: string; alt?: string | undefined }) {
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
export function CarModal({ spec, km, color, image = spec.image, sheet, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const rating = ratingOf(spec);
  const tier = classTierClass(rating.letter);
  const hp = Math.round(spec.kW * 1.35962);
  const cond = conditionOf(spec, km);

  /*
   * Two footer states that are not the normal one. Selling arms before it
   * fires, the way the right-click menu does -- a sale cannot be undone and
   * one stray click is a cheap way to lose a car. Painting opens a picker,
   * because choosing a colour is the feature; a button that resprayed the car
   * whatever colour it felt like would be a slot machine.
   */
  const [armed, setArmed] = useState(false);
  const [picking, setPicking] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
  }, []);

  const palette = colorsOf(spec);
  const shown = preview ?? color;
  // The preview is the whole reason the picker is worth having: you see the
  // car in the colour before you pay for it, in the same frame the card uses.
  const hero = (preview ? imageFor(spec, preview) : undefined) ?? image;

  const repaintPrice = repaintPriceFor(spec, km);
  const sellValue = sellValueFor(spec, km);

  const close = () => ref.current?.close();

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
            <Row k="Kilómetros" v={formatKm(km)} alt={cond.label} />
            {shown ? (
              <Row k="Color" v={colorName(shown)} alt={preview ? "vista previa" : undefined} />
            ) : null}
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
            <button className="modal-x" onClick={close} aria-label="Cerrar">
              ×
            </button>
          </header>

          <div className="modal-hero">
            {hero ? (
              <img src={hero} alt={`${spec.make} ${spec.model}`} />
            ) : (
              <span className="modal-nophoto">sin foto</span>
            )}
          </div>

          {sheet.kind === "buy" ? (
            <footer className="modal-foot">
              <span className="modal-rarity">{RARITY[spec.rarity] ?? spec.rarity}</span>
              <span className="modal-price">{formatCredits(sheet.price)} cr</span>
              {sheet.owned ? (
                <button className="btn" disabled>
                  En tu garaje
                </button>
              ) : (
                <button
                  className={`btn${sheet.credits >= sheet.price ? " primary" : ""}`}
                  disabled={sheet.credits < sheet.price || !sheet.onBuy}
                  onClick={() => {
                    sheet.onBuy?.(spec.id, sheet.price, km);
                    close();
                  }}
                >
                  {sheet.credits >= sheet.price
                    ? "Comprar"
                    : `Faltan ${formatCredits(sheet.price - sheet.credits)} cr`}
                </button>
              )}
            </footer>
          ) : picking ? (
            <footer className="modal-foot paint">
              <div className="paint-swatches" role="group" aria-label="Colores">
                {palette.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`paint-chip${shown === c ? " on" : ""}`}
                    // The colour it already wears is not a purchase, so it is
                    // not offered as one. repaintCar refuses it too.
                    disabled={c === color}
                    onClick={() => setPreview(c)}
                  >
                    {colorName(c)}
                  </button>
                ))}
              </div>
              <div className="modal-acts">
                <button
                  className="btn ghost"
                  onClick={() => {
                    setPicking(false);
                    setPreview(null);
                  }}
                >
                  Cancelar
                </button>
                <button
                  className={`btn${preview && sheet.credits >= repaintPrice ? " primary" : ""}`}
                  disabled={!preview || sheet.credits < repaintPrice}
                  onClick={() => {
                    if (preview) sheet.onRepaint(preview);
                    setPicking(false);
                    setPreview(null);
                  }}
                >
                  {sheet.credits < repaintPrice
                    ? `Faltan ${formatCredits(repaintPrice - sheet.credits)} cr`
                    : `Pintar por ${formatCredits(repaintPrice)} cr`}
                </button>
              </div>
            </footer>
          ) : (
            <footer className="modal-foot">
              <span className="modal-rarity">{RARITY[spec.rarity] ?? spec.rarity}</span>
              <div className="modal-acts">
                <button
                  className="btn"
                  disabled={sheet.isCurrent}
                  onClick={() => {
                    sheet.onDrive();
                    close();
                  }}
                >
                  {sheet.isCurrent ? "Ya estás en este auto" : "Subirse al auto"}
                </button>
                {/* Under two colours there is nothing to change it TO, so the
                    button says why instead of opening an empty picker. */}
                {/* The price lands on the confirm button in the picker rather
                    than here: three labelled actions plus a figure do not fit
                    the 448px column, and the cost has to be unmissable at the
                    moment you pay it, not one click earlier. */}
                <button
                  className="btn"
                  disabled={palette.length < 2}
                  title={palette.length < 2 ? "Este auto viene en un solo color" : undefined}
                  onClick={() => setPicking(true)}
                >
                  Repintar
                </button>
                <button
                  className={`btn danger${armed ? " armed" : ""}`}
                  disabled={!sheet.canSell}
                  title={sheet.canSell ? undefined : "Es tu único auto"}
                  onClick={() => {
                    if (!armed) {
                      setArmed(true);
                      return;
                    }
                    sheet.onSell();
                    close();
                  }}
                  onMouseLeave={() => setArmed(false)}
                >
                  {armed ? `Vender por ${formatCredits(sellValue)} cr` : "Vender"}
                </button>
              </div>
            </footer>
          )}
        </div>
      </div>
    </dialog>
  );
}
