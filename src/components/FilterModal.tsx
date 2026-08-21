import { useEffect, useRef } from "react";
import type { CarSpec } from "@contracts/car";
import { FACETS, activeCount, applyFilters, type Selection } from "@catalog/filters";
import { FacetSelect } from "./FacetSelect";

interface Props {
  cars: CarSpec[];
  value: Selection;
  onChange: (next: Selection) => void;
  onClose: () => void;
}

/**
 * Every facet at once, behind a button.
 *
 * A native <dialog> for the same reasons the spec sheet is one: showModal()
 * gives the focus trap, Escape, the inert background and ::backdrop, and a
 * div gets all four of those wrong quietly.
 *
 * The filter applies live rather than on a "Apply" button. There is no draft
 * state to reconcile, the running total at the bottom updates as you click,
 * and closing is just closing -- so there is no way to lose a selection by
 * dismissing the dialog, which is the failure mode of the apply-button
 * version.
 */
export function FilterModal({ cars, value, onChange, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const n = applyFilters(cars, value).length;
  const lit = activeCount(value);

  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className="modal filter-modal"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
    >
      <div className="filter-modal-body">
        <header className="filters-head">
          <h3 className="filters-title">Filtro avanzado</h3>
          {lit > 0 ? (
            <button className="filters-clear" onClick={() => onChange({})}>
              Limpiar
            </button>
          ) : null}
          <button className="modal-x" onClick={() => ref.current?.close()} aria-label="Cerrar">
            ×
          </button>
        </header>

        <div className="filter-grid">
          {FACETS.map((f) => (
            <FacetSelect key={f.id} cars={cars} id={f.id} value={value} onChange={onChange} />
          ))}
        </div>

        <footer className="filter-modal-foot">
          <span className="filter-total">
            {n} of {cars.length} cars
          </span>
          <button className="btn primary" onClick={() => ref.current?.close()}>
            Ver
          </button>
        </footer>
      </div>
    </dialog>
  );
}
