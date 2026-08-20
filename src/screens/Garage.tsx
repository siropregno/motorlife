import { useMemo } from "react";
import { CARS } from "@catalog/cars";
import { ratingOf } from "@catalog/rating";
import { derive } from "@sim/derive";
import { CarCard } from "../components/CarCard";
import { classToneClass } from "../lib/tiers";

interface Props {
  owned: string[];
  selectedId: string;
  onSelect: (id: string) => void;
  onShop: () => void;
  onContinue: () => void;
}

export function Garage({ owned, selectedId, onSelect, onShop, onContinue }: Props) {
  const cars = useMemo(() => CARS.filter((c) => owned.includes(c.id)), [owned]);

  return (
    <>
      <h2 className="screen-title">Garage</h2>
      <p className="screen-sub">
        {cars.length} of {CARS.length} cars owned. A collection is a hand of cards, and a circuit
        is the question it answers.
      </p>

      <div className="card-grid">
        {cars.map((c) => {
          const r = ratingOf(c);
          return (
            <div key={c.id} className="shop-item">
              <CarCard
                spec={c}
                derived={derive(c)}
                selected={c.id === selectedId}
                onSelect={onSelect}
              />
              <div className="shop-buy">
                <span className="shop-rating">
                  <b className={classToneClass(r.letter)}>{r.letter}</b> {r.index}
                </span>
                <span className="shop-price" style={{ fontSize: 12, color: "var(--ink-4)" }}>
                  class index
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="row" style={{ marginTop: 26, justifyContent: "space-between" }}>
        <button className="btn" onClick={onShop}>
          Dealership
        </button>
        <button className="btn primary" onClick={onContinue}>
          Set up →
        </button>
      </div>
    </>
  );
}
