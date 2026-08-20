import { useCallback, useMemo, useState } from "react";
import { CARS, carById } from "@catalog/cars";
import { formatCredits, sellValueFor } from "@progression/economy";
import { CarCard } from "../components/CarCard";
import { ContextMenu, type MenuItem } from "../components/ContextMenu";

interface Props {
  owned: string[];
  selectedId: string;
  onSelect: (id: string) => void;
  onSell: (id: string) => void;
  onShop: () => void;
  onContinue: () => void;
}

interface MenuAt {
  x: number;
  y: number;
  id: string;
}

export function Garage({ owned, selectedId, onSelect, onSell, onShop, onContinue }: Props) {
  const cars = useMemo(() => CARS.filter((c) => owned.includes(c.id)), [owned]);
  const [menu, setMenu] = useState<MenuAt | null>(null);

  const close = useCallback(() => setMenu(null), []);

  const items = useMemo<MenuItem[]>(() => {
    const spec = menu ? carById(menu.id) : null;
    if (!spec) return [];
    const last = owned.length <= 1;
    return [
      {
        label: "Subirse al auto",
        onPick: () => {
          onSelect(spec.id);
          onContinue();
        },
      },
      {
        label: "Vender",
        // The hint doubles as the reason when the item is dead. A greyed row
        // with no explanation reads as a bug.
        hint: last ? "tu único auto" : `${formatCredits(sellValueFor(spec))} cr`,
        confirm: `Vender por ${formatCredits(sellValueFor(spec))} cr`,
        danger: true,
        disabled: last,
        onPick: () => onSell(spec.id),
      },
    ];
  }, [menu, owned.length, onSelect, onContinue, onSell]);

  return (
    <>
      <h2 className="screen-title">Garage</h2>
      <p className="screen-sub">
        {cars.length} of {CARS.length} cars owned. A collection is a hand of cards, and a circuit
        is the question it answers. Right-click a car for what you can do with it.
      </p>

      <div className="card-grid">
        {cars.map((c) => (
          <CarCard
            key={c.id}
            spec={c}
            selected={c.id === selectedId}
            onSelect={onSelect}
            onContextMenu={(e, id) => {
              e.preventDefault();
              setMenu({ x: e.clientX, y: e.clientY, id });
            }}
          />
        ))}
      </div>

      {menu && items.length > 0 ? (
        <ContextMenu x={menu.x} y={menu.y} items={items} onClose={close} />
      ) : null}

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
