import type { CarSpec } from "@contracts/car";
import { activeCount, type FacetId, type Selection } from "@catalog/filters";
import { FacetRow } from "./FacetRow";

interface Props {
  cars: CarSpec[];
  order: FacetId;
  onOrder: (id: FacetId) => void;
  filter: Selection;
  onFilter: (next: Selection) => void;
  onOpenAdvanced: () => void;
}

/**
 * The shop bar: how the list is cut up, one filter, and a door to the rest.
 *
 * Sorting and filtering are different questions and the bar says so. "Ordenar
 * por" never removes a car, it only decides which heading it sits under;
 * tracción is here because it is the one filter you use constantly and it is
 * three chips wide. The other three live behind Filtro avanzado, because four
 * facet rows pinned above the list is more furniture than the list itself.
 */
const ORDERS: { id: FacetId; label: string }[] = [
  { id: "decada", label: "Década" },
  { id: "segmento", label: "Segmento" },
  { id: "clase", label: "Clase" },
];

export function ShopControls({
  cars,
  order,
  onOrder,
  filter,
  onFilter,
  onOpenAdvanced,
}: Props) {
  const lit = activeCount(filter);

  return (
    <section className="shopbar" aria-label="Ordenar y filtrar">
      <div className="filter-row">
        <span className="filter-label">Ordenar por</span>
        <div className="filter-chips" role="group" aria-label="Ordenar por">
          {ORDERS.map((o) => (
            <button
              key={o.id}
              type="button"
              className={`chip${order === o.id ? " on" : ""}`}
              aria-pressed={order === o.id}
              onClick={() => onOrder(o.id)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <FacetRow cars={cars} id="traccion" value={filter} onChange={onFilter} />

      <div className="shopbar-foot">
        <button className="chip advanced" onClick={onOpenAdvanced}>
          Filtro avanzado
          {lit > 0 ? <span className="chip-badge">{lit}</span> : null}
        </button>
      </div>
    </section>
  );
}
