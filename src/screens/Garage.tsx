import { useMemo } from "react";
import { CARS } from "@catalog/cars";
import { derive } from "@sim/derive";
import { CarCard } from "../components/CarCard";

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
        {cars.map((c) => (
          <CarCard
            key={c.id}
            spec={c}
            derived={derive(c)}
            selected={c.id === selectedId}
            onSelect={onSelect}
          />
        ))}
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
