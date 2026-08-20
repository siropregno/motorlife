import { useMemo } from "react";
import { CARS } from "@catalog/cars";
import { derive } from "@sim/derive";
import { CarCard } from "../components/CarCard";

interface Props {
  selectedId: string;
  onSelect: (id: string) => void;
  onContinue: () => void;
}

export function Garage({ selectedId, onSelect, onContinue }: Props) {
  // derive() is memoised inside the sim, so this is cheap; useMemo just keeps
  // the array identity stable across renders
  const derived = useMemo(() => new Map(CARS.map((c) => [c.id, derive(c)])), []);

  return (
    <>
      <h2 className="screen-title">Garage</h2>
      <p className="screen-sub">
        {CARS.length} cars. Pick one and take it to the setup sheet.
      </p>

      <div className="card-grid">
        {CARS.map((c) => (
          <CarCard
            key={c.id}
            spec={c}
            derived={derived.get(c.id)}
            selected={c.id === selectedId}
            onSelect={onSelect}
          />
        ))}
      </div>

      <div className="row" style={{ marginTop: 26, justifyContent: "flex-end" }}>
        <button className="btn primary" onClick={onContinue}>
          Set up →
        </button>
      </div>
    </>
  );
}
