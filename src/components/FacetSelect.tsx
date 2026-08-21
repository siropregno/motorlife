import type { CarSpec } from "@contracts/car";
import {
  FACETS,
  availableOptions,
  optionCounts,
  selectOne,
  selectedOne,
  type FacetId,
  type Selection,
} from "@catalog/filters";

interface Props {
  /** The pool the counts are measured against: the unfiltered listing. */
  cars: CarSpec[];
  id: FacetId;
  value: Selection;
  onChange: (next: Selection) => void;
  /** Off where the surrounding control already names the facet. */
  showLabel?: boolean;
}

/**
 * One facet as a dropdown.
 *
 * The counts ride in the option text -- "Delantera (9)" -- because that is the
 * only place a <select> has room for them, and losing them entirely would
 * throw away the thing that makes a facet worth having. An option no car can
 * satisfy is disabled rather than dropped, so the list never reorders itself
 * between two openings.
 *
 * "Todas" is an <option value=""> rather than a separate clear control: with a
 * single-choice dropdown, choosing nothing has to be one of the choices.
 */
export function FacetSelect({ cars, id, value, onChange, showLabel = true }: Props) {
  const facet = FACETS.find((f) => f.id === id)!;
  const options = availableOptions(cars, id);
  if (options.length < 2) return null; // a facet with one answer filters nothing

  const counts = optionCounts(cars, value, id);
  const current = selectedOne(value, id);

  return (
    <label className="control">
      {showLabel ? <span className="control-label">{facet.label}</span> : null}
      <select
        className="select"
        value={current}
        aria-label={facet.label}
        onChange={(e) => onChange(selectOne(value, id, e.target.value))}
      >
        <option value="">Todas</option>
        {options.map((o) => {
          const n = counts.get(o.value) ?? 0;
          return (
            <option key={o.value} value={o.value} disabled={n === 0 && o.value !== current}>
              {o.label} ({n})
            </option>
          );
        })}
      </select>
    </label>
  );
}
