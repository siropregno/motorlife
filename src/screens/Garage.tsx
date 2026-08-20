import { useCallback, useMemo, useState } from "react";
import { CARS, carById } from "@catalog/cars";
import { formatCredits, sellValueFor } from "@progression/economy";
import { CarCard } from "../components/CarCard";
import { ContextMenu, type MenuItem } from "../components/ContextMenu";

interface Props {
  owned: string[];
  /** The car you are currently in. Only "Subirse al auto" changes it. */
  currentId: string;
  onDrive: (id: string) => void;
  onSell: (id: string) => void;
  onShop: () => void;
  onContinue: () => void;
}

interface MenuAt {
  x: number;
  y: number;
  id: string;
}

export function Garage({ owned, currentId, onDrive, onSell, onShop, onContinue }: Props) {
  const cars = useMemo(() => CARS.filter((c) => owned.includes(c.id)), [owned]);
  const [menu, setMenu] = useState<MenuAt | null>(null);

  const close = useCallback(() => setMenu(null), []);

  const items = useMemo<MenuItem[]>(() => {
    const spec = menu ? carById(menu.id) : null;
    if (!spec) return [];
    const current = spec.id === currentId;
    const last = owned.length <= 1;
    return [
      {
        label: current ? "Ya estás en este auto" : "Subirse al auto",
        // With no highlight on the card, this is what tells you which car you
        // are in without looking up at the topbar.
        disabled: current,
        onPick: () => onDrive(spec.id),
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
  }, [menu, currentId, owned.length, onDrive, onSell]);

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
            onContextMenu={(e, id) => {
              e.preventDefault();
              // The Menu key and Shift+F10 fire contextmenu with zeroed
              // coordinates. Fall back to the card itself so the menu opens
              // next to what it belongs to rather than in the top corner.
              const kbd = e.clientX <= 0 && e.clientY <= 0;
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              setMenu({
                x: kbd ? r.left + 24 : e.clientX,
                y: kbd ? r.bottom - 12 : e.clientY,
                id,
              });
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
