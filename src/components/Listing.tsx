import { useMemo, useState } from "react";

import type { Mods } from "@contracts/mods";
import type { ClassLetter } from "@sim/rating";
import {
  applyFilters,
  groupBy,
  type Direction,
  type FacetId,
  type Selection,
} from "@catalog/filters";
import { formatCredits } from "@progression/economy";
import type { Offer } from "@progression/market";
import { CarCard } from "./CarCard";
import { CarModal } from "./CarModal";
import { FilterModal } from "./FilterModal";
import { ShopControls } from "./ShopControls";
import { ScreenHead } from "./ScreenHead";
import { classTierClass } from "../lib/tiers";

interface Props {
  /** The forecourt: one dealer's stock, or the used lot. */
  offers: Offer[];
  credits: number;
  owned: string[];
  onBuy: (carId: string, price: number, km: number, color?: string, mods?: Mods) => void;
  /** Filters and sort. Off for a six-car lot, where they are furniture. */
  controls?: boolean;
  /** Whose forecourt this is, for the header it now draws itself. */
  title: string;
  sub?: string | undefined;
  back?: { label: string; onBack: () => void } | undefined;
  empty: string;
}

/**
 * A forecourt: the header, the controls, the grouped grid, and the spec sheet
 * over it.
 *
 * Everything here used to live in Shop, back when there was one place to buy
 * a car. Four dealers and a used lot later it is the same screen five times,
 * so it takes the cars and a price function and stops caring where they came
 * from -- which is the only reason the used lot can be 30% off without a
 * second copy of any of this.
 *
 * It draws its own header rather than being handed one, because the header and
 * the list are two halves of one arrangement: the title and the sort bar stay
 * put and the cars scroll between them. Split across two components that would
 * be a contract about which one owns the scroll box, and it would be wrong the
 * first time anyone touched either half.
 */
export function Listing({
  offers,
  credits,
  owned,
  onBuy,
  controls = true,
  title,
  sub,
  back,
  empty,
}: Props) {
  // Filtering and grouping work on specs; the offer carries the odometer and
  // the price, so the two travel together through a map rather than a second
  // parallel array that could fall out of step.
  const cars = useMemo(() => offers.map((o) => o.spec), [offers]);
  const byId = useMemo(() => new Map(offers.map((o) => [o.spec.id, o])), [offers]);
  const [filter, setFilter] = useState<Selection>({});
  const [order, setOrder] = useState<FacetId>("clase");
  const [dir, setDir] = useState<Direction>("asc");
  const [advanced, setAdvanced] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const listed = useMemo(() => applyFilters(cars, filter), [cars, filter]);
  const groups = useMemo(() => groupBy(listed, order, dir), [listed, order, dir]);
  const open = openId ? byId.get(openId) : undefined;

  /*
   * How many cars the list is showing, said once in the header.
   *
   * It belongs beside the sort bar rather than at the top of every section,
   * because with a filter on, the honest number is "9 of 26" and there is
   * nowhere in a per-section heading to say the second half of that.
   */
  const count =
    listed.length === cars.length
      ? `${cars.length} auto${cars.length === 1 ? "" : "s"}`
      : `${listed.length} de ${cars.length}`;

  return (
    <>
      <ScreenHead title={title} sub={sub} back={back}>
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
            count={count}
          />
        ) : null}
      </ScreenHead>

      <div className="screen-body">
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
                  const o = byId.get(spec.id)!;
                  return (
                    <div key={spec.id} className="shop-item">
                      {/* mods, so a Marketplace car that has had something done
                          to it wears the wrench on its card the same way one in
                          your garage does. A dealer's Offer carries none, so
                          its cards are unchanged. */}
                      <CarCard
                        spec={spec}
                        km={o.km}
                        mods={o.mods}
                        image={o.image}
                        onOpen={setOpenId}
                      />
                      <span className={`shop-tag${credits >= o.price ? " afford" : ""}`}>
                        {o.condition.band === "survivor" || o.condition.band === "cero" ? (
                          <b className="shop-flag">{o.condition.label}</b>
                        ) : null}
                        {formatCredits(o.price)} cr
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>

      {advanced ? (
        <FilterModal
          cars={cars}
          value={filter}
          onChange={setFilter}
          onClose={() => setAdvanced(false)}
        />
      ) : null}

      {open ? (
        <CarModal
          spec={open.spec}
          km={open.km}
          mods={open.mods}
          color={open.color}
          image={open.image}
          sheet={{
            kind: "buy",
            price: open.price,
            credits,
            owned: owned.includes(open.spec.id),
            // The parts travel with the sale, the same way the odometer and
            // the colour already do: what you paid for is what lands in the
            // garage.
            onBuy: (id, price, km) => onBuy(id, price, km, open.color, open.mods),
          }}
          onClose={() => setOpenId(null)}
        />
      ) : null}
    </>
  );
}
