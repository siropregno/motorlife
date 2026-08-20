import type { CarSpec, DerivedCar } from "@contracts/car";
import { ratingOf } from "@catalog/rating";
import { classTierClass } from "../lib/tiers";

interface Props {
  spec: CarSpec;
  derived?: DerivedCar | undefined;
  selected?: boolean;
  onSelect?: (id: string) => void;
}

const CONF_LABEL = {
  calibrated: "Calibrated",
  estimated: "Estimated",
  rough: "Rough",
} as const;

/**
 * The card from the mockup, with the data made dynamic and one thing added:
 * how much the sim actually knows about this car. A car imported from six
 * fields is honestly labelled Estimated rather than pretending to precision
 * it does not have.
 */
export function CarCard({ spec, derived, selected, onSelect }: Props) {
  const hp = Math.round(spec.kW * 1.35962);
  const clickable = Boolean(onSelect);
  // cached in the catalogue, so this is a map lookup after the first call
  const rating = ratingOf(spec);

  const body = (
    <>
      <span className={`card-label ${spec.rarity}`} />

      <span className="card-logo">
        {spec.logo ? <img src={spec.logo} alt={spec.make} /> : null}
      </span>

      <span className="card-info">
        <h2 className="card-title-bold">
          {spec.model} <span className="card-title-light">'{String(spec.year).slice(2)}</span>
          <span className={`card-klass ${classTierClass(rating.letter)}`}>
            {rating.letter}
            {rating.index}
          </span>
        </h2>
        <p className="card-text-light">
          {hp} Hp{spec.nm ? ` / ${spec.nm} Nm` : ""}
        </p>
        <p className="card-text-light">{spec.blurb}</p>
        {derived ? (
          <span className={`card-confidence conf-${derived.confidence}`}>
            {CONF_LABEL[derived.confidence]}
          </span>
        ) : null}
      </span>

      <span className="card-car">
        {spec.image ? <img src={spec.image} alt={`${spec.make} ${spec.model}`} /> : null}
      </span>
    </>
  );

  if (!clickable) return <div className="car-card">{body}</div>;

  return (
    <button
      type="button"
      className={`car-card selectable${selected ? " selected" : ""}`}
      onClick={() => onSelect?.(spec.id)}
      aria-pressed={selected}
    >
      {body}
    </button>
  );
}
