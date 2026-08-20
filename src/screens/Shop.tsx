import { useMemo } from "react";
import type { CarSpec } from "@contracts/car";
import type { ClassLetter } from "@sim/rating";
import type { Save } from "@progression/save";
import { CARS } from "@catalog/cars";
import { ratingOf } from "@catalog/rating";
import { priceOf, formatCredits } from "@progression/economy";
import { CarCard } from "../components/CarCard";
import { classTierClass } from "../lib/tiers";

interface Props {
  save: Save;
  onBuy: (carId: string, price: number) => void;
  onBack: () => void;
}

interface Listing {
  spec: CarSpec;
  price: number;
}

const ORDER: ClassLetter[] = ["D", "C", "B", "A", "S", "X"];

export function Shop({ save, onBuy, onBack }: Props) {
  /**
   * The whole catalogue, minus what you already own.
   *
   * This used to be a rotating six drawn by rarity weight, so a rare car
   * surfaced only occasionally and finding one was an event. Siro wants the
   * full list instead. The consequence is worth naming: nothing is a find any
   * more, an F40 is permanently on the menu and the only thing between you and
   * it is the price.
   *
   * Grouped by class and sorted by rating inside each, so a long list reads as
   * a ladder rather than a wall.
   */
  const groups = useMemo(() => {
    const unowned = CARS.filter((c) => !save.owned.includes(c.id));
    return ORDER.map((letter) => ({
      letter,
      cars: unowned
        .filter((c) => ratingOf(c).letter === letter)
        .sort((a, b) => ratingOf(a).index - ratingOf(b).index)
        .map((spec): Listing => ({ spec, price: priceOf(spec) })),
    })).filter((g) => g.cars.length > 0);
  }, [save.owned]);

  const total = groups.reduce((n, g) => n + g.cars.length, 0);
  const affordable = groups.reduce(
    (n, g) => n + g.cars.filter((l) => save.credits >= l.price).length,
    0,
  );

  return (
    <>
      <h2 className="screen-title">Dealership</h2>
      <p className="screen-sub">
        {total} car{total === 1 ? "" : "s"} for sale, {affordable} you can afford. Grouped by
        class, cheapest ladder first.
      </p>

      {total === 0 ? (
        <div className="panel">
          <p className="note" style={{ margin: 0 }}>
            Nothing left to sell you. You own the whole catalogue.
          </p>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.letter} className="shop-class">
            <h3 className="shop-class-head">
              <span className={`klass-badge ${classTierClass(g.letter)}`}>{g.letter}</span>
              <span>
                {g.cars.length} car{g.cars.length === 1 ? "" : "s"}
              </span>
            </h3>
            <div className="card-grid">
              {g.cars.map(({ spec, price }) => {
                const afford = save.credits >= price;
                return (
                  <div key={spec.id} className="shop-item">
                    {/* the card carries the class badge, so this row is price only */}
                    <CarCard spec={spec} />
                    <div className="shop-buy">
                      <span className="shop-price">{formatCredits(price)} cr</span>
                      <button
                        className={`btn${afford ? " primary" : ""}`}
                        disabled={!afford}
                        onClick={() => onBuy(spec.id, price)}
                      >
                        {afford ? "Buy" : "Short"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}

      <div className="row" style={{ marginTop: 26 }}>
        <button className="btn" onClick={onBack}>
          ← Garage
        </button>
      </div>
    </>
  );
}
