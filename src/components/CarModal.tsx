import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { CarSpec } from "@contracts/car";
import { ratingOf } from "@catalog/rating";
import { formatCredits, repaintPriceFor, sellValueFor } from "@progression/economy";
import { conditionOf, formatKm } from "@progression/mileage";
import { colorName, colorSwatch, colorsOf, imageFor } from "@progression/paint";
import { classTierClass } from "../lib/tiers";
import { ICON } from "../lib/icons";
import { Glyph } from "./Glyph";

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
  /** Opens straight into the colour picker, for the menu row that means paint. */
  startPicking?: boolean;
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
export function CarModal({ spec, km, color, image = spec.image, sheet, startPicking = false, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const rating = ratingOf(spec);
  const tier = classTierClass(rating.letter);
  const hp = Math.round(spec.kW * 1.35962);
  const cond = conditionOf(spec, km);

  /*
   * Painting opens a picker rather than firing, because choosing the colour is
   * the feature: a button that resprayed the car whatever colour it felt like
   * would be a slot machine. Selling asks in a dialog of its own, which is the
   * caller's job -- see Confirm for why it is not an arming button.
   */
  const [picking, setPicking] = useState(startPicking);
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
  const driveLabel =
    sheet.kind === "garage" && sheet.isCurrent ? "Ya estás en este auto" : "Subirse al auto";
  /** Something picked, something different, and the money for it. */
  const payable =
    preview !== null &&
    preview !== color &&
    sheet.kind === "garage" &&
    sheet.credits >= repaintPrice;

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
              {/* Dots, not words. The name still reaches a screen reader
                  through the label, and it is spelled out in the spec list on
                  the left the moment a dot is picked -- so nothing is lost by
                  showing the colour as a colour. */}
              <div className="paint-swatches" role="group" aria-label="Colores">
                {palette.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`paint-dot${shown === c ? " on" : ""}${c === color ? " current" : ""}`}
                    style={{ "--dot": colorSwatch(c) } as CSSProperties}
                    // Every dot is live, the colour it already wears included:
                    // clicking that one is how you get back to the car as it
                    // stands after previewing something else. What it does not
                    // do is arm the price -- see `payable`.
                    aria-label={c === color ? `${colorName(c)}, el color actual` : colorName(c)}
                    title={c === color ? `${colorName(c)} · el color actual` : colorName(c)}
                    onClick={() => setPreview(c)}
                  />
                ))}
              </div>
              <div className="modal-acts">
                <button
                  className="btn"
                  aria-label="Volver"
                  title="Volver"
                  onClick={() => {
                    setPicking(false);
                    setPreview(null);
                  }}
                >
                  <Glyph src={ICON.back} />
                </button>
                {/*
                 * The label is the number and nothing else. "Pintar por 5.700
                 * cr" said the verb twice -- the brush got you here and the
                 * dots are the choice; what is left to say is the price.
                 *
                 * It goes dead, not the dot, when the colour picked is the one
                 * the car already wears. You can select it -- backing out of a
                 * preview to see the car as it stands is the obvious thing to
                 * want, and a dot you cannot click cannot do it -- but there is
                 * nothing to buy, and repaintCar refuses the same case anyway.
                 */}
                <button
                  className={`btn${payable ? " primary" : ""}`}
                  disabled={!payable}
                  title={
                    preview === color ? "Ya es de este color" : preview ? undefined : "Elegí un color"
                  }
                  onClick={() => {
                    if (preview) sheet.onRepaint(preview);
                    setPicking(false);
                    setPreview(null);
                  }}
                >
                  {sheet.credits < repaintPrice
                    ? `Faltan ${formatCredits(repaintPrice - sheet.credits)} cr`
                    : `${formatCredits(repaintPrice)} cr`}
                </button>
              </div>
            </footer>
          ) : (
            <footer className="modal-foot">
              <span className="modal-rarity">{RARITY[spec.rarity] ?? spec.rarity}</span>
              {/*
                * Icon-only, so every one of these carries an aria-label and a
                * title: without them the button has no accessible name at all
                * -- the glyph is aria-hidden, which leaves a screen reader
                * announcing "button" three times -- and the title is what tells
                * a mouse user which is which before they commit to a click.
                */}
              <div className="modal-acts">
                <button
                  className="btn"
                  disabled={sheet.isCurrent}
                  aria-label={driveLabel}
                  title={driveLabel}
                  onClick={() => {
                    sheet.onDrive();
                    close();
                  }}
                >
                  <Glyph src={ICON.drive} />
                </button>
                {/* Under two colours there is nothing to change it TO, so the
                    title says why rather than opening an empty picker. */}
                <button
                  className="btn"
                  disabled={palette.length < 2}
                  aria-label="Repintar"
                  title={palette.length < 2 ? "Este auto viene en un solo color" : `Repintar · ${formatCredits(repaintPrice)} cr`}
                  onClick={() => setPicking(true)}
                >
                  <Glyph src={ICON.paint} />
                </button>
                {/* Asks in its own dialog rather than arming in place. The
                    sheet stays open behind the question, so the car you are
                    about to lose is still on the screen while you answer. */}
                <button
                  className="btn danger"
                  disabled={!sheet.canSell}
                  aria-label="Vender"
                  title={sheet.canSell ? `Vender · ${formatCredits(sellValue)} cr` : "Es tu único auto"}
                  onClick={() => sheet.onSell()}
                >
                  <Glyph src={ICON.sell} />
                </button>
              </div>
            </footer>
          )}
        </div>
      </div>
    </dialog>
  );
}
