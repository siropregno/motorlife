import { useMemo } from "react";
import type { Save } from "@progression/save";
import { shopSeedFor, RACES_PER_SHOP_ROTATION } from "@progression/save";
import { rollShop, formatCredits } from "@progression/economy";
import { ratingOf } from "@catalog/rating";
import { derive } from "@sim/derive";
import { CarCard } from "../components/CarCard";
import { classToneClass } from "../lib/tiers";

interface Props {
  save: Save;
  onBuy: (carId: string, price: number) => void;
  onBack: () => void;
}

export function Shop({ save, onBuy, onBack }: Props) {
  const listings = useMemo(
    () => rollShop(shopSeedFor(save), save.owned),
    [save],
  );
  const untilRotation =
    RACES_PER_SHOP_ROTATION - (save.racesRun % RACES_PER_SHOP_ROTATION);

  return (
    <>
      <h2 className="screen-title">Dealership</h2>
      <p className="screen-sub">
        Stock rotates in {untilRotation} race{untilRotation === 1 ? "" : "s"}. Rarer cars surface
        less often.
      </p>

      {listings.length === 0 ? (
        <div className="panel">
          <p className="note" style={{ margin: 0 }}>
            Nothing left to sell you. You own the whole catalogue.
          </p>
        </div>
      ) : (
        <div className="card-grid">
          {listings.map(({ spec, price }) => {
            const rating = ratingOf(spec);
            const afford = save.credits >= price;
            return (
              <div key={spec.id} className="shop-item">
                <CarCard spec={spec} derived={derive(spec)} />
                <div className="shop-buy">
                  <span className="shop-rating">
                    <b className={classToneClass(rating.letter)}>{rating.letter}</b>{" "}
                    {rating.index}
                  </span>
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
      )}

      <div className="row" style={{ marginTop: 26 }}>
        <button className="btn" onClick={onBack}>
          ← Garage
        </button>
      </div>
    </>
  );
}
