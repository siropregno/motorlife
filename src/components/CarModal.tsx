import { useEffect, useRef } from "react";
import type { CarSpec } from "@contracts/car";
import type { Mods } from "@contracts/mods";
import { levelOf, PART_IDS } from "@contracts/mods";
import { ratingOf } from "@catalog/rating";
import { modEffect } from "@sim/mods";
import { formatCredits, sellValueFor } from "@progression/economy";
import { conditionOf, formatKm } from "@progression/mileage";
import { colorName } from "@progression/paint";
import { LEVEL_NAME, modsSummary, needsRebuild, PART_NAME } from "@progression/mods";
import { classTierClass, PART_TIER } from "../lib/tiers";
import { ENGINE_ICON, ICON, PART_ICON } from "../lib/icons";
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
      /** False for your last car: selling it leaves you nothing to race. */
      canSell: boolean;
      isCurrent: boolean;
      onDrive: () => void;
      /**
       * Both of these only ASK. Selling owns a dialog of its own, raised by the
       * caller over this one, and tuning is a section -- so the sheet does not
       * need to know what a sale pays, it needs to know that a button was
       * pressed.
       *
       * There is no onPaint. Repainting lives in the workshop now, behind the
       * same wrench onTune already opens.
       */
      onSell: () => void;
      onTune: () => void;
    };

interface Props {
  spec: CarSpec;
  km: number;
  /**
   * What is bolted to THIS car. Absent on a forecourt listing, where there is
   * no such thing yet -- the shop sells models, and a car only acquires parts
   * once somebody owns it.
   */
  mods?: Mods | undefined;
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
  rare: "raro",
  vrare: "Muy raro",
  exclusive: "Exclusivo",
  unique: "Unico",
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
export function CarModal({ spec, km, mods, color, image = spec.image, sheet, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  /*
   * The badge rates the car AS IT STANDS. A forecourt listing passes no mods
   * and gets the catalogue rating, which is right -- what is for sale there is
   * the model. A garage car passes its own, because the class it races in is
   * the class of the object, not of the model it happens to be.
   */
  const rating = ratingOf(spec, mods, mods ? km : 0);
  const tier = classTierClass(rating.letter);
  const cond = conditionOf(spec, km);

  /*
   * Power as the car makes it today: the published figure, plus whatever the
   * parts add, minus what the engine has lost. Published stays visible beside
   * it whenever the two differ, so the sheet never quietly disagrees with the
   * number on Wikipedia -- it says "this car makes X, and it left the factory
   * making Y", which is a different and more useful statement.
   */
  const power = spec.kW * modEffect(mods, km).kW;
  const hp = Math.round(power * 1.35962);
  const stockHp = Math.round(spec.kW * 1.35962);
  const tuned = Math.abs(power - spec.kW) > 0.05;
  const fitted = modsSummary(mods);
  /*
   * Does the motor want a rectificada?
   *
   * The same needsRebuild the workshop asks, not arithmetic off `km`. It reads
   * `wearKm` when the engine has been rebuilt and the car's own odometer when it
   * never has, which is the difference between "this car has done 300.000 km"
   * and "this ENGINE has" -- a freshly rectified car with a high odometer is
   * exactly the case a card doing its own sums would call tired.
   */
  const worn = needsRebuild(km, mods);

  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
  }, []);

  // the build goes with the car, so what the sheet quotes has to include it
  const sellValue = sellValueFor(spec, km, mods);
  const driveLabel =
    sheet.kind === "garage" && sheet.isCurrent ? "Ya estás en este auto" : "Subirse al auto";

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
            {/* The alt line carries the published figure whenever the car no
                longer makes it, so a modified car reads as "180 CV, de fábrica
                134" rather than silently contradicting its own spec sheet. */}
            <Row
              k="Potencia"
              v={`${hp} CV`}
              alt={tuned ? `de fábrica ${stockHp}` : `${spec.kW} kW`}
            />
            <Row k="Peso" v={`${spec.kg} kg`} />
            <Row k="Velocidad máx." v={spec.topKph ? `${spec.topKph} km/h` : "—"} />
            <Row k="0–100" v={spec.zeroTo100 ? `${spec.zeroTo100.toFixed(1)} s` : "—"} />
            <Row k="Par motor" v={spec.nm ? `${spec.nm} Nm` : "—"} />
            <Row k="Motor / tracción" v={LAYOUT[spec.layout] ?? spec.layout} />
            <Row k="Año" v={String(spec.year)} />
            <Row k="Kilómetros" v={formatKm(km)} alt={cond.label} />
            {/* No engine-wear row. It said "349.400 km de uso / sin rectificar"
                -- a second odometer directly under the real one, wrapping to two
                lines to tell you something the workshop's engine tile already
                says in colour, on the screen where you can act on it. */}
            {color ? <Row k="Color" v={colorName(color)} /> : null}
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
            {image ? (
              <img src={image} alt={`${spec.make} ${spec.model}`} />
            ) : (
              <span className="modal-nophoto">sin foto</span>
            )}
          </div>

          {/*
            * What is bolted to this car, as four glyphs in the workshop's
            * colours: grey is the factory part, then green, blue and pink up
            * the ladder. It replaces the "Preparación" row, which spelled the
            * same four facts out as "Turbo Competición · Escape Competición ·
            * Suspensión Competición · Caja Competición" -- four lines of text
            * to say what four coloured tiles say at a glance, and the only row
            * in the ficha that could wrap to four lines and shove the photo
            * down the column.
            *
            * ALWAYS four, never a filtered list. The row answers "how far has
            * this car been taken", and a stock part is an answer to that --
            * dropping the grey ones would leave a tuned car showing one tile
            * and a stock car showing nothing, with no way to tell "nothing
            * fitted" from "no row here".
            *
            * UNCONDITIONAL. Every sheet gets the row -- your garage, the
            * Marketplace, and a concesionaria too.
            *
            * The row was garage-only at first, on the reasoning that a forecourt
            * sells a MODEL and a model has no parts on it. That reasoning was
            * about where you were standing rather than about the car, and it is
            * the kind of rule that is wrong the day a dealer carries a car with
            * a turbo already on it. Every listing in the game is an Offer with
            * its own odometer, so every listing is already an object; whether a
            * given forecourt happens to sell modified ones today is a fact about
            * that forecourt's stock, not about what the sheet can describe.
            *
            * So the row reads the CAR. A dealer listing with nothing fitted
            * shows four grey tiles and a healthy engine, which is true and is
            * the same answer the garage gives for a stock car -- and the day a
            * dealer lists something with parts on it, the sheet already says so
            * without anyone remembering to come back here.
            */}
          <div className="modal-parts" role="list" aria-label="Preparación">
              {PART_IDS.map((part) => {
                const level = levelOf(mods, part);
                const label = level === 0 ? "de fábrica" : LEVEL_NAME[level as 1 | 2 | 3];
                return (
                  <span
                    key={part}
                    role="listitem"
                    className={`modal-part ${PART_TIER[level]}`}
                    // Not a button: the sheet's workshop button is how you get
                    // to the taller. A tile that looks clickable and is not is
                    // worse than one that never invited the click.
                    title={`${PART_NAME[part]} · ${label}`}
                    aria-label={`${PART_NAME[part]}, ${label}`}
                  >
                    <Glyph src={PART_ICON[part]} />
                  </span>
                );
              })}

              {/*
                * The motor, on the same row and deliberately last, past a
                * hairline -- the same arrangement and the same reasoning as the
                * workshop's strip. It is not a fifth part: every tile to its
                * left is something bolted ON to make the car better than the
                * factory built it, and this one only says whether the car still
                * makes what the factory gave it.
                *
                * So it does not take a PART_TIER colour. It is amber when the
                * engine wants a rectificada and the same grey as a stock part
                * when it does not, which is the same two states the workshop's
                * engine tile has -- a player who has seen one recognises the
                * other, and the sheet and the taller never disagree about the
                * car because both ask needsRebuild.
                *
                * This is where the engine wear went when the second odometer
                * came out of the ficha. That row said "349.400 km de uso / sin
                * rectificar" directly under the real odometer, wrapping to two
                * lines to say in text what one coloured tile says here.
                */}
              <span className="modal-part-sep" aria-hidden="true" />
              <span
                role="listitem"
                className={`modal-part engine${worn ? " worn" : ""}`}
                title={
                  worn
                    ? `Motor · ${formatKm(mods?.wearKm ?? km)} sin rectificar`
                    : "Motor · al día"
                }
                aria-label={worn ? "Motor, pide rectificada" : "Motor, al día"}
              >
                <Glyph src={ENGINE_ICON} />
              </span>
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
                  Comprar
                </button>
              )}
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
                {/* Always live: every car can be modified, and the one with
                    nothing fitted is exactly the one the workshop is for. */}
                <button
                  className="btn"
                  aria-label="Taller"
                  title={fitted ? `Taller · ${fitted}` : "Taller"}
                  onClick={() => sheet.onTune()}
                >
                  <Glyph src={ICON.wrench} />
                </button>
                {/* No Repintar button. Paint moved to the workshop, which is
                    where everything else you pay to change about a car already
                    happens -- and where the photo is big and live, which is what
                    choosing a colour actually needs. The wrench above is the way
                    there. */}
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
