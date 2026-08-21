import { useMemo, useState } from "react";
import type { ClassLetter } from "@sim/rating";
import type { Save } from "@progression/save";
import { CARS } from "@catalog/cars";

import {
  applyFilters,
  groupBy,
  isActive,
  type Direction,
  type FacetId,
  type Selection,
} from "@catalog/filters";
import { priceOf, formatCredits } from "@progression/economy";
import { CarCard } from "../components/CarCard";
import { CarModal } from "../components/CarModal";
import { FilterModal } from "../components/FilterModal";
import { ShopControls } from "../components/ShopControls";
import { classTierClass } from "../lib/tiers";

interface Props {
  save: Save;
  onBuy: (carId: string, price: number) => void;
}

export function Shop({ save, onBuy }: Props) {
  /**
   * The whole catalogue, minus what you already own.
   *
   * This used to be a rotating six drawn by rarity weight, so a rare car
   * surfaced only occasionally and finding one was an event. Siro wants the
   * full list instead. The consequence is worth naming: nothing is a find any
   * more, an F40 is permanently on the menu and the only thing between you and
   * it is the price.
   *
   * Grouped into sections and sorted by rating inside each, so a long list
   * reads as a ladder rather than a wall. Which facet does the grouping is the
   * "Ordenar por" control; the rating ladder inside a section is not optional.
   */
  const unowned = useMemo(
    () => CARS.filter((c) => !save.owned.includes(c.id)),
    [save.owned],
  );

  const [filter, setFilter] = useState<Selection>({});
  /*
   * The filter narrows the listing, but the CHIP COUNTS are measured against
   * `unowned`, not against what is on screen. Counting the visible list would
   * make every count read either "all of them" or zero, since the visible list
   * is already the answer.
   */
  const listed = useMemo(() => applyFilters(unowned, filter), [unowned, filter]);

  const [order, setOrder] = useState<FacetId>("clase");
  const [dir, setDir] = useState<Direction>("asc");
  const [advanced, setAdvanced] = useState(false);

  /*
   * Sections come from whichever facet you are ordering by, and the direction
   * flips the sections and the ladder inside them together -- see groupBy.
   */
  const groups = useMemo(() => groupBy(listed, order, dir), [listed, order, dir]);

  const [openId, setOpenId] = useState<string | null>(null);
  // resolved from the whole pool rather than the filtered groups, so an open
  // spec sheet does not vanish if the listing behind it changes
  const openSpec = openId ? unowned.find((c) => c.id === openId) : undefined;

  const total = listed.length;
  const affordable = listed.filter((c) => save.credits >= priceOf(c)).length;
  const filtered = isActive(filter);

  return (
    <>
      <h2 className="screen-title">Dealership</h2>
      <p className="screen-sub">
        {filtered ? `${total} of ${unowned.length} cars` : `${total} car${total === 1 ? "" : "s"}`}
        {" for sale, "}
        {affordable} you can afford.{" "}
        {dir === "asc" ? "Cheapest ladder first" : "Fastest first"} inside each group.
      </p>

      {unowned.length > 0 ? (
        <ShopControls
          cars={unowned}
          order={order}
          dir={dir}
          onOrder={setOrder}
          onDir={setDir}
          filter={filter}
          onFilter={setFilter}
          onOpenAdvanced={() => setAdvanced(true)}
        />
      ) : null}

      {unowned.length === 0 ? (
        <div className="panel">
          <p className="note" style={{ margin: 0 }}>
            Nothing left to sell you. You own the whole catalogue.
          </p>
        </div>
      ) : total === 0 ? (
        <div className="panel">
          <p className="note" style={{ margin: 0 }}>
            No car matches that filter. <button className="linkish" onClick={() => setFilter({})}>Limpiar</button> to see all {unowned.length}.
          </p>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.value} className="shop-class">
            {/*
              Only the class sections get a pill, and they get the whole label
              inside it -- "Clase D", not a bare coloured D you have to already
              know how to read. The pill is carrying the tier colour, which is
              the one thing worth a badge.

              Década, Segmento and Marca are just words. There is no colour to
              give them: group by década and a section holds a D and an A, so
              a tier pill would be picking one of them to paint itself, and a
              neutral pill is a badge that badges nothing.
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
                {g.cars.length} car{g.cars.length === 1 ? "" : "s"}
              </span>
            </h3>
            <div className="card-grid">
              {g.cars.map((spec) => {
                const price = priceOf(spec);
                return (
                  <div key={spec.id} className="shop-item">
                    <CarCard spec={spec} onOpen={setOpenId} />
                    <span className={`shop-tag${save.credits >= price ? " afford" : ""}`}>
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
          cars={unowned}
          value={filter}
          onChange={setFilter}
          onClose={() => setAdvanced(false)}
        />
      ) : null}

      {openSpec ? (
        <CarModal
          spec={openSpec}
          price={priceOf(openSpec)}
          credits={save.credits}
          owned={save.owned.includes(openSpec.id)}
          onBuy={onBuy}
          onClose={() => setOpenId(null)}
        />
      ) : null}

    </>
  );
}
