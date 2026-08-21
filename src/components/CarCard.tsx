import type { MouseEvent } from "react";
import type { CarSpec } from "@contracts/car";
import { ratingOf } from "@catalog/rating";
import { classTierClass } from "../lib/tiers";

interface Props {
  spec: CarSpec;
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
 * Clicking a card opens its spec sheet and nothing else. It used to SWAP the
 * car you were driving, so the same gesture that reads the collection quietly
 * changed what you were about to race. Getting into a car is a deliberate pick
 * from the right-click menu now, and the topbar says which one you are in.
 * Opening a read-only sheet is the one thing a click can safely mean.
 */
export function CarCard({ spec, onOpen, onContextMenu }: Props) {
  const hp = Math.round(spec.kW * 1.35962);
  // cached in the catalogue, so this is a map lookup after the first call
  const rating = ratingOf(spec);
  const tier = classTierClass(rating.letter);

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
      </span>

      <span className="card-car">
        {spec.image ? <img src={spec.image} alt={`${spec.make} ${spec.model}`} /> : null}
      </span>
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
