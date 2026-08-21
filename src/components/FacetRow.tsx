import type { CarSpec } from "@contracts/car";
import {
  FACETS,
  availableOptions,
  optionCounts,
  toggle,
  type FacetId,
  type Selection,
} from "@catalog/filters";

interface Props {
  /** The pool the counts are measured against: the unfiltered listing. */
  cars: CarSpec[];
  id: FacetId;
  value: Selection;
  onChange: (next: Selection) => void;
  /** Off in the compact bar, where the control's own label already says it. */
  showLabel?: boolean;
}

/**
 * One facet as a row of toggle chips. Used inline in the shop bar for
 * tracción, and four times over inside the advanced-filter dialog.
 *
 * Chips rather than a dropdown. Every option and its count is on screen at
 * once, which is the argument: a <select> hides the fact that there are no
 * front-wheel-drive supercars until you have opened it and read the list.
 *
 * A chip emptied BY YOUR CHOICES dims and stays put -- options that move as
 * you click are what makes faceted search feel broken. A bucket no car is in
 * at all is dropped instead, because a chip that can never do anything is
 * furniture; that list only changes when you buy a car.
 */
export function FacetRow({ cars, id, value, onChange, showLabel = true }: Props) {
  const facet = FACETS.find((f) => f.id === id)!;
  const options = availableOptions(cars, id);
  if (options.length < 2) return null; // a facet with one answer filters nothing

  const counts = optionCounts(cars, value, id);
  const picked = value[id] ?? [];

  return (
    <div className="filter-row">
      {showLabel ? <span className="filter-label">{facet.label}</span> : null}
      <div className="filter-chips" role="group" aria-label={facet.label}>
        {options.map((o) => {
          const n = counts.get(o.value) ?? 0;
          const on = picked.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              className={`chip${on ? " on" : ""}`}
              aria-pressed={on}
              // a picked chip never disables, or you could not undo it
              disabled={n === 0 && !on}
              onClick={() => onChange(toggle(value, id, o.value))}
            >
              {o.label}
              <span className="chip-n">{n}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
