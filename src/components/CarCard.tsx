import type { MouseEvent } from "react";
import type { CarSpec } from "@contracts/car";
import { ratingOf } from "@catalog/rating";
import { conditionOf, formatKm } from "@progression/mileage";
import { classTierClass } from "../lib/tiers";
import { ICON } from "../lib/icons";

interface Props {
  spec: CarSpec;
  /**
   * The odometer, when this card is a particular car rather than a model.
   * Absent on the Setup screen, where the card is just "the car you drive".
   */
  km?: number;
  /** Overrides spec.image: the photo of THIS car, in its colour. */
  image?: string | undefined;
  /** Opens the spec sheet. A card does nothing else on click. */
  onOpen?: (id: string) => void;
  onContextMenu?: (e: MouseEvent, id: string) => void;
}

/**
 * The card from the mockup, with the data made dynamic.
 *
 * The edge bar and the class badge are both painted by CLASS, not rarity. They
 * sit two centimetres apart, so having one mean "how rare" and the other mean
 * "how fast" just read as a colour bug. Rarity still drives price and how
 * often a car surfaces in the dealership; it no longer competes for the same
 * strip of colour.
 *
 * The one purple thing on the card is the collector's mark, bottom right. It
 * is a fact about THIS car and not about the model -- the same Fuego is a
 * collector's car at 1.600 km and an ordinary one at 400.000 -- so it hangs off
 * the odometer, and a card with no odometer (the Setup screen) never wears it.
 *
 * Clicking a card opens its spec sheet and nothing else. It used to SWAP the
 * car you were driving, so the same gesture that reads the collection quietly
 * changed what you were about to race. Getting into a car is a deliberate pick
 * from the right-click menu now, and the topbar says which one you are in.
 * Opening a read-only sheet is the one thing a click can safely mean.
 */
export function CarCard({ spec, km, image = spec.image, onOpen, onContextMenu }: Props) {
  const hp = Math.round(spec.kW * 1.35962);
  // cached in the catalogue, so this is a map lookup after the first call
  const rating = ratingOf(spec);
  const tier = classTierClass(rating.letter);
  // "De colección": low kilometres for its age. The shop already prints that
  // label in purple next to the price, so this is the same claim as a mark you
  // can see from across the grid -- and the only way to see it in the garage,
  // where there is no price line to hang a word on.
  const collectible = km !== undefined && conditionOf(spec, km).band === "survivor";

  const body = (
    <>
      <span className={`card-label ${tier}`} />

      <span className="card-logo">
        {spec.logo ? <img src={spec.logo} alt={spec.make} /> : null}
      </span>

      <span className="card-info">
        <h2 className="card-title-bold">
          <span>{spec.model}</span>
          <span className="card-title-light">'{String(spec.year).slice(2)}</span>
          <span className={`klass-badge ${tier}`}>
            {rating.letter}
            {rating.index}
          </span>
        </h2>
        <p className="card-text-light">
          {hp} CV{spec.nm ? ` / ${spec.nm} Nm` : ""}
        </p>
        {/* Its own line under the power, not tacked onto it: the odometer is
            a fact about THIS car, where the power is a fact about the model. */}
        {km === undefined ? null : <p className="card-km">{formatKm(km)}</p>}
      </span>

      <span className="card-car">
        {image ? <img src={image} alt={`${spec.make} ${spec.model}`} /> : null}
      </span>

      {/*
        The glyph is aria-hidden and the words live in a .sr-only span beside
        it. `title` alone is a mouse affordance -- it is not reliably announced
        on a span -- and in the garage there is no price line printing "De
        colección", so without the span the mark is a purple square that means
        nothing to a screen reader. The image stays nameless for the same reason
        every other Glyph does: the card is one control with one name.
      */}
      {collectible ? (
        <span className="card-shiny" title="De colección">
          <img src={ICON.shiny} alt="" aria-hidden="true" />
          <span className="sr-only">De colección</span>
        </span>
      ) : null}
    </>
  );

  if (onOpen) {
    return (
      <button
        type="button"
        className="car-card menuable"
        onClick={() => onOpen(spec.id)}
        onContextMenu={onContextMenu ? (e) => onContextMenu(e, spec.id) : undefined}
      >
        {body}
      </button>
    );
  }

  if (!onContextMenu) return <div className="car-card">{body}</div>;

  /*
   * tabIndex + aria-haspopup rather than a <button>: the card has no click
   * action to advertise, but the menu still has to be reachable without a
   * mouse. Browsers fire `contextmenu` for the Menu key and Shift+F10 on the
   * focused element, so keeping the card focusable is the whole fix -- the
   * handler just has to cope with the zeroed coordinates those send.
   */
  return (
    <div
      className="car-card menuable"
      tabIndex={0}
      aria-haspopup="menu"
      aria-label={`${spec.make} ${spec.model} ${spec.year}`}
      onContextMenu={(e) => onContextMenu(e, spec.id)}
    >
      {body}
    </div>
  );
}
