import { useCallback, useMemo, useState } from "react";
import { CARS, carById } from "@catalog/cars";
import { colorOfHeld, type OwnedCar } from "@progression/save";
import { imageFor } from "@progression/paint";

import { formatCredits, sellValueFor } from "@progression/economy";
import { CarCard } from "../components/CarCard";
import { CarModal } from "../components/CarModal";
import { ContextMenu, type MenuItem } from "../components/ContextMenu";

interface Props {
  owned: OwnedCar[];
  credits: number;
  /** The car you are currently in. Only "Subirse al auto" changes it. */
  currentId: string;
  onDrive: (id: string) => void;
  onSell: (id: string) => void;
  onRepaint: (id: string, color: string) => void;
}

interface MenuAt {
  x: number;
  y: number;
  id: string;
}

export function Garage({ owned, credits, currentId, onDrive, onSell, onRepaint }: Props) {
  const cars = useMemo(
    () => owned.flatMap((o) => {
      const spec = CARS.find((c) => c.id === o.id);
      const color = colorOfHeld(o);
      return spec ? [{ spec, km: o.km, color, image: imageFor(spec, color) }] : [];
    }),
    [owned],
  );
  const [menu, setMenu] = useState<MenuAt | null>(null);
  /*
   * The OPEN CAR IS AN ID, not the car object. Repainting changes the car
   * under the sheet while the sheet is open, and holding the object would
   * paint the garage behind a modal still showing the old colour. An id is
   * re-resolved against `cars` on every render, so the sheet sees the change
   * it just made -- which is the point of paying to look at it.
   */
  const [openId, setOpenId] = useState<string | null>(null);
  const open = openId ? cars.find((c) => c.spec.id === openId) : undefined;

  const close = useCallback(() => setMenu(null), []);

  const items = useMemo<MenuItem[]>(() => {
    const spec = menu ? carById(menu.id) : null;
    const km = menu ? (owned.find((o) => o.id === menu.id)?.km ?? 0) : 0;
    if (!spec) return [];
    const current = spec.id === currentId;
    const last = owned.length <= 1;
    return [
      {
        label: "Ver ficha",
        onPick: () => setOpenId(spec.id),
      },
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
        {cars.length} de {CARS.length} autos. Clic en un auto para su ficha, clic derecho para sus
        opciones.
      </p>

      <div className="card-grid">
        {cars.map(({ spec: c, km, image }) => (
          <CarCard
            key={c.id}
            spec={c}
            km={km}
            image={image}
            onOpen={setOpenId}
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

      {open ? (
        <CarModal
          spec={open.spec}
          km={open.km}
          color={open.color}
          image={open.image}
          sheet={{
            kind: "garage",
            credits,
            canSell: owned.length > 1,
            isCurrent: open.spec.id === currentId,
            onDrive: () => onDrive(open.spec.id),
            onSell: () => onSell(open.spec.id),
            onRepaint: (color) => onRepaint(open.spec.id, color),
          }}
          onClose={() => setOpenId(null)}
        />
      ) : null}
    </>
  );
}
