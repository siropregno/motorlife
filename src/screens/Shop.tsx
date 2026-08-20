import { useMemo } from "react";
import type { Save } from "@progression/save";
import { shopSeedFor, RACES_PER_SHOP_ROTATION } from "@progression/save";
import { rollShop, formatCredits } from "@progression/economy";
import { derive } from "@sim/derive";
import { CarCard } from "../components/CarCard";

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
            const afford = save.credits >= price;
            return (
              <div key={spec.id} className="shop-item">
                {/* the card carries the class badge, so this row is price only */}
                <CarCard spec={spec} derived={derive(spec)} />
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
      )}

      <div className="row" style={{ marginTop: 26 }}>
        <button className="btn" onClick={onBack}>
          ← Garage
        </button>
      </div>
    </>
  );
}
