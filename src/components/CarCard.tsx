import type { MouseEvent } from "react";
import type { CarSpec } from "@contracts/car";
import { ratingOf } from "@catalog/rating";
import { classTierClass } from "../lib/tiers";

interface Props {
  spec: CarSpec;
  selected?: boolean;
  onSelect?: (id: string) => void;
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
 */
export function CarCard({ spec, selected, onSelect, onContextMenu }: Props) {
  const hp = Math.round(spec.kW * 1.35962);
  const clickable = Boolean(onSelect);
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
          {hp} Hp{spec.nm ? ` / ${spec.nm} Nm` : ""}
        </p>
        <p className="card-text-light">{spec.blurb}</p>
      </span>

      <span className="card-car">
        {spec.image ? <img src={spec.image} alt={`${spec.make} ${spec.model}`} /> : null}
      </span>
    </>
  );

  const menu = onContextMenu ? (e: MouseEvent) => onContextMenu(e, spec.id) : undefined;

  if (!clickable) {
    return (
      <div className="car-card" onContextMenu={menu}>
        {body}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`car-card selectable${selected ? " selected" : ""}`}
      onClick={() => onSelect?.(spec.id)}
      onContextMenu={menu}
      aria-pressed={selected}
    >
      {body}
    </button>
  );
}
