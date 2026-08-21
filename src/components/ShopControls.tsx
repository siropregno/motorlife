import type { CarSpec } from "@contracts/car";
import { activeCount, type Direction, type FacetId, type Selection } from "@catalog/filters";
import { FacetSelect } from "./FacetSelect";

interface Props {
  cars: CarSpec[];
  order: FacetId;
  dir: Direction;
  onOrder: (id: FacetId) => void;
  onDir: (d: Direction) => void;
  filter: Selection;
  onFilter: (next: Selection) => void;
  onOpenAdvanced: () => void;
}

/**
 * The shop bar: how the list is cut up, one filter, and a door to the rest.
 *
 * Sorting and filtering are different questions and the bar says so. "Ordenar
 * por" never removes a car, it only decides which heading it sits under;
 * tracción is here because it is the one filter you reach for constantly. The
 * other three live behind Filtro avanzado.
 */
const ORDERS: { id: FacetId; label: string }[] = [
  { id: "decada", label: "Década" },
  { id: "segmento", label: "Segmento" },
  { id: "clase", label: "Clase" },
];

/**
 * What ascending and descending actually mean, per facet. "Ascendente" tells
 * you nothing about a list of decades; "1970 → 2000" tells you exactly what
 * the button is about to do.
 */
const DIR_HINT: Record<FacetId, [string, string]> = {
  decada: ["1970 → 2000", "2000 → 1970"],
  segmento: ["Sedán → Pickup", "Pickup → Sedán"],
  clase: ["D → A", "A → D"],
  traccion: ["↑", "↓"],
};

export function ShopControls({
  cars,
  order,
  dir,
  onOrder,
  onDir,
  filter,
  onFilter,
  onOpenAdvanced,
}: Props) {
  const lit = activeCount(filter);
  const [asc, desc] = DIR_HINT[order];

  return (
    <section className="shopbar" aria-label="Ordenar y filtrar">
      <label className="control">
        <span className="control-label">Ordenar por</span>
        <select
          className="select"
          value={order}
          aria-label="Ordenar por"
          onChange={(e) => onOrder(e.target.value as FacetId)}
        >
          {ORDERS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <button
        className="dirbtn"
        onClick={() => onDir(dir === "asc" ? "desc" : "asc")}
        title={dir === "asc" ? asc : desc}
        aria-label={`Orden ${dir === "asc" ? "ascendente" : "descendente"}: ${
          dir === "asc" ? asc : desc
        }`}
      >
        <span className="dirbtn-arrow">{dir === "asc" ? "↑" : "↓"}</span>
        <span className="dirbtn-hint">{dir === "asc" ? asc : desc}</span>
      </button>

      <FacetSelect cars={cars} id="traccion" value={filter} onChange={onFilter} />

      <button className="btn ghost advanced" onClick={onOpenAdvanced}>
        Filtro avanzado
        {lit > 0 ? <span className="chip-badge">{lit}</span> : null}
      </button>
    </section>
  );
}
