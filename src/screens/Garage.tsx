import { useCallback, useMemo, useState } from "react";
import { CARS, carById } from "@catalog/cars";
import { colorOfHeld, type OwnedCar } from "@progression/save";
import { imageFor } from "@progression/paint";

import { formatCredits, sellValueFor } from "@progression/economy";
import { CarCard } from "../components/CarCard";
import { ContextMenu, type MenuItem } from "../components/ContextMenu";

interface Props {
  owned: OwnedCar[];
  /** The car you are currently in. Only "Subirse al auto" changes it. */
  currentId: string;
  onDrive: (id: string) => void;
  onSell: (id: string) => void;
}

interface MenuAt {
  x: number;
  y: number;
  id: string;
}

export function Garage({ owned, currentId, onDrive, onSell }: Props) {
  const cars = useMemo(
    () => owned.flatMap((o) => {
      const spec = CARS.find((c) => c.id === o.id);
      return spec ? [{ spec, km: o.km, image: imageFor(spec, colorOfHeld(o)) }] : [];
    }),
    [owned],
  );
  const [menu, setMenu] = useState<MenuAt | null>(null);

  const close = useCallback(() => setMenu(null), []);

  const items = useMemo<MenuItem[]>(() => {
    const spec = menu ? carById(menu.id) : null;
    const km = menu ? (owned.find((o) => o.id === menu.id)?.km ?? 0) : 0;
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
        hint: last ? "tu único auto" : `${formatCredits(sellValueFor(spec, km))} cr`,
        confirm: `Vender por ${formatCredits(sellValueFor(spec, km))} cr`,
        danger: true,
        disabled: last,
        onPick: () => onSell(spec.id),
      },
    ];
  }, [menu, currentId, owned, onDrive, onSell]);

  return (
    <>
      <h2 className="screen-title">Garaje</h2>
      <p className="screen-sub">
        {cars.length} de {CARS.length} autos. Clic derecho en un auto para sus opciones.
      </p>

      <div className="card-grid">
        {cars.map(({ spec: c, km, image }) => (
          <CarCard
            key={c.id}
            spec={c}
            km={km}
            image={image}
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

    </>
  );
}
