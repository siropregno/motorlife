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
  /** "26 autos", or "9 de 26" with a filter on. */
  count: string;
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
  { id: "marca", label: "Marca" },
];

/**
 * What each direction actually does, per facet. Not shown -- it is the title
 * and the accessible name. A bare arrow is fine to look at and useless to a
 * screen reader, and "ascendente" would tell nobody what happens to a list of
 * decades; "1970 → 2000" says it exactly.
 */
const DIR_HINT: Record<FacetId, [string, string]> = {
  decada: ["1970 → 2000", "2000 → 1970"],
  segmento: ["Sedán → Pickup", "Pickup → Sedán"],
  clase: ["D → A", "A → D"],
  marca: ["A → Z", "Z → A"],
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
  count,
}: Props) {
  const lit = activeCount(filter);
  const [asc, desc] = DIR_HINT[order];

  /*
   * The bar is ONE strip on one line, not a row of stacked label/control
   * pairs.
   *
   * It used to draw a small-caps label above each control -- "ORDENAR POR"
   * over the dropdown, "TRACCIÓN" over the next -- which made the bar two rows
   * tall, gave it a ragged top edge, and said out loud what the dropdowns
   * already say: the sort select reads "Clase", and nobody wonders what a
   * dropdown next to a sort arrow does. The labels survive as aria-label,
   * where they are actually needed.
   *
   * The word "Ordenar" is drawn once, at the head of the strip, because it
   * scopes the two controls after it and turns the row into a sentence:
   * Ordenar [Clase] [↑] · [Todas] · 26 autos.
   */
  return (
    <section className="shopbar" aria-label="Ordenar y filtrar">
      <span className="shopbar-lead">Ordenar</span>

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

      <button
        className="dirbtn"
        onClick={() => onDir(dir === "asc" ? "desc" : "asc")}
        title={dir === "asc" ? asc : desc}
        aria-label={`Orden ${dir === "asc" ? "ascendente" : "descendente"}: ${
          dir === "asc" ? asc : desc
        }`}
      >
        {dir === "asc" ? "↑" : "↓"}
      </button>

      <span className="shopbar-sep" aria-hidden="true" />

      <FacetSelect cars={cars} id="traccion" value={filter} onChange={onFilter} showLabel={false} />

      <button className="btn ghost advanced" onClick={onOpenAdvanced}>
        Filtro
        {lit > 0 ? <span className="chip-badge">{lit}</span> : null}
      </button>

      {/*
        * How many cars are below. It sits at the far right of the bar rather
        * than in a line of its own, which is where the old "Filtro avanzado"
        * button sat marooned across a wide empty gap -- the gap is doing
        * something now.
        */}
      <span className="shopbar-count">{count}</span>
    </section>
  );
}
