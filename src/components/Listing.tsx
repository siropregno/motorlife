import { useMemo, useState } from "react";
import type { CarSpec } from "@contracts/car";
import type { ClassLetter } from "@sim/rating";
import {
  applyFilters,
  groupBy,
  isActive,
  type Direction,
  type FacetId,
  type Selection,
} from "@catalog/filters";
import { formatCredits } from "@progression/economy";
import { CarCard } from "./CarCard";
import { CarModal } from "./CarModal";
import { FilterModal } from "./FilterModal";
import { ShopControls } from "./ShopControls";
import { classTierClass } from "../lib/tiers";

interface Props {
  /** The forecourt: one dealer's stock, or the used lot. */
  cars: CarSpec[];
  /** Priced by the caller, because a used car is not a catalogue car. */
  priceFor: (car: CarSpec) => number;
  credits: number;
  owned: string[];
  onBuy: (carId: string, price: number) => void;
  /** Filters and sort. Off for a six-car lot, where they are furniture. */
  controls?: boolean;
  empty: string;
}

/**
 * A forecourt: controls, the grouped grid, and the spec sheet over it.
 *
 * Everything here used to live in Shop, back when there was one place to buy
 * a car. Four dealers and a used lot later it is the same screen five times,
 * so it takes the cars and a price function and stops caring where they came
 * from -- which is the only reason the used lot can be 30% off without a
 * second copy of any of this.
 */
export function Listing({
  cars,
  priceFor,
  credits,
  owned,
  onBuy,
  controls = true,
  empty,
}: Props) {
  const [filter, setFilter] = useState<Selection>({});
  const [order, setOrder] = useState<FacetId>("clase");
  const [dir, setDir] = useState<Direction>("asc");
  const [advanced, setAdvanced] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const listed = useMemo(() => applyFilters(cars, filter), [cars, filter]);
  const groups = useMemo(() => groupBy(listed, order, dir), [listed, order, dir]);
  const openSpec = openId ? cars.find((c) => c.id === openId) : undefined;

  const affordable = listed.filter((c) => credits >= priceFor(c)).length;
  const filtered = isActive(filter);

  return (
    <>
      {controls && cars.length > 0 ? (
        <ShopControls
          cars={cars}
          order={order}
          dir={dir}
          onOrder={setOrder}
          onDir={setDir}
          filter={filter}
          onFilter={setFilter}
          onOpenAdvanced={() => setAdvanced(true)}
        />
      ) : null}

      {cars.length > 0 ? (
        <p className="listing-meta">
          {filtered ? `${listed.length} de ${cars.length} autos` : `${listed.length} auto${listed.length === 1 ? "" : "s"}`}
          {", "}
          {affordable} a tu alcance.
        </p>
      ) : null}

      {cars.length === 0 ? (
        <div className="panel">
          <p className="note" style={{ margin: 0 }}>
            {empty}
          </p>
        </div>
      ) : listed.length === 0 ? (
        <div className="panel">
          <p className="note" style={{ margin: 0 }}>
            Ningún auto coincide con el filtro.{" "}
            <button className="linkish" onClick={() => setFilter({})}>
              Limpiar
            </button>{" "}
            para ver los {cars.length}.
          </p>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.value} className="shop-class">
            {/*
              Only the class sections get a pill, and they get the whole label
              inside it. Década, Segmento and Marca are just words: group by
              década and a section holds a D and an A, so there is no honest
              tier colour to paint the pill with.
            */}
            <h3 className="shop-class-head">
              {order === "clase" ? (
                <span className={`klass-badge ${classTierClass(g.value as ClassLetter)}`}>
                  Clase {g.label}
                </span>
              ) : (
                <span className="shop-group-name">{g.label}</span>
              )}
              <span>
                {g.cars.length} auto{g.cars.length === 1 ? "" : "s"}
              </span>
            </h3>
            <div className="card-grid">
              {g.cars.map((spec) => {
                const price = priceFor(spec);
                return (
                  <div key={spec.id} className="shop-item">
                    <CarCard spec={spec} onOpen={setOpenId} />
                    <span className={`shop-tag${credits >= price ? " afford" : ""}`}>
                      {formatCredits(price)} cr
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}

      {advanced ? (
        <FilterModal
          cars={cars}
          value={filter}
          onChange={setFilter}
          onClose={() => setAdvanced(false)}
        />
      ) : null}

      {openSpec ? (
        <CarModal
          spec={openSpec}
          price={priceFor(openSpec)}
          credits={credits}
          owned={owned.includes(openSpec.id)}
          onBuy={onBuy}
          onClose={() => setOpenId(null)}
        />
      ) : null}
    </>
  );
}
