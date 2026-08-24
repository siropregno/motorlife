import { useCallback, useMemo, useState } from "react";
import { CARS, carById } from "@catalog/cars";
import { colorOfHeld, type OwnedCar } from "@progression/save";
import { imageFor } from "@progression/paint";

import { formatCredits, sellValueFor } from "@progression/economy";
import { formatKm } from "@progression/mileage";
import { modCount } from "@progression/mods";
import { CarCard } from "../components/CarCard";
import { CarModal } from "../components/CarModal";
import { Confirm } from "../components/Confirm";
import { ContextMenu, type MenuItem } from "../components/ContextMenu";
import { ICON } from "../lib/icons";

/**
 * Everything here names a car by UID, never by model id.
 *
 * The garage is the one screen that can hold two of the same car, so it is the
 * screen where the difference bites: with model ids, right-clicking the second
 * Falcon opened a menu about the first one, "Vender" sold the wrong one, and
 * the sheet showed the wrong odometer. A uid is the only thing on a card that
 * tells two of them apart.
 */
interface Props {
  owned: OwnedCar[];
  /** The car you are currently in, by uid. Only "Subirse al auto" changes it. */
  currentUid: string;
  onDrive: (uid: string) => void;
  onSell: (uid: string) => void;
  /**
   * Take this car to the workshop. The garage does not fit parts itself, and it
   * does not paint them either -- the workshop is a section of its own and owns
   * both -- so this navigates rather than acting, which is why it is the only
   * handler here that does not change the save.
   */
  onTune: (uid: string) => void;
}

interface MenuAt {
  x: number;
  y: number;
  uid: string;
}

export function Garage({ owned, currentUid, onDrive, onSell, onTune }: Props) {
  const cars = useMemo(
    () => owned.flatMap((o) => {
      const spec = CARS.find((c) => c.id === o.id);
      const color = colorOfHeld(o);
      return spec
        ? [{ uid: o.uid, spec, km: o.km, mods: o.mods, color, image: imageFor(spec, color) }]
        : [];
    }),
    [owned],
  );
  /**
   * How many distinct models are in there, for the header.
   *
   * "7 de 26 autos" stopped being true the day the garage could hold two of
   * one: seven cards can be five models. So the line says both -- the cars you
   * have, and how much of the catalogue that covers -- rather than quietly
   * printing a collection figure that counts the same Falcon twice.
   */
  const models = useMemo(() => new Set(cars.map((c) => c.spec.id)).size, [cars]);
  const [menu, setMenu] = useState<MenuAt | null>(null);
  /*
   * The OPEN CAR IS AN ID, not the car object. Repainting changes the car
   * under the sheet while the sheet is open, and holding the object would
   * paint the garage behind a modal still showing the old colour. An id is
   * re-resolved against `cars` on every render, so the sheet sees the change
   * it just made -- which is the point of paying to look at it.
   */
  const [openUid, setOpenUid] = useState<string | null>(null);
  /**
   * The car being sold, while its dialog is up. Held HERE rather than inside
   * either surface that can raise it, because both can: the sheet's button and
   * the menu's row open the same dialog and get the same answer, instead of
   * each growing its own.
   *
   * Painting used to sit beside this for the same reason. It is in the workshop
   * now, so the garage no longer owns a paint dialog at all.
   */
  const [selling, setSelling] = useState<string | null>(null);
  const sellingCar = selling ? cars.find((c) => c.uid === selling) : undefined;
  const open = openUid ? cars.find((c) => c.uid === openUid) : undefined;

  const close = useCallback(() => setMenu(null), []);

  const items = useMemo<MenuItem[]>(() => {
    const held = menu ? owned.find((o) => o.uid === menu.uid) : undefined;
    const spec = held ? carById(held.id) : null;
    const km = held?.km ?? 0;
    if (!spec || !held) return [];
    const current = held.uid === currentUid;
    const last = owned.length <= 1;
    const fitted = modCount(held.mods);
    return [
      /*
       * No "Ver ficha" row. It was here for one commit, and once every action
       * carries a glyph an iconless row sits with its label out of line with
       * the rest -- and the thing it did is what a left click already does,
       * which the line under the title now says out loud.
       */
      {
        label: current ? "Ya estás en este auto" : "Subirse al auto",
        icon: ICON.drive,
        // With no highlight on the card, this is what tells you which car you
        // are in without looking up at the topbar.
        disabled: current,
        onPick: () => onDrive(held.uid),
      },
      {
        /*
         * Above Repintar because it is the row that changes the car rather
         * than what it looks like, and the menu reads top to bottom in order
         * of consequence: get in it, change it, paint it, lose it.
         *
         * The hint says what is fitted rather than a price, because there is
         * no single price -- twelve parts at twelve prices is a screen, not a
         * hint, and the count is the thing you actually want to know from
         * outside: whether this car has been touched.
         */
        label: "Llevar al taller",
        icon: ICON.wrench,
        hint: fitted === 0 ? "de fábrica" : `${fitted} de 4`,
        onPick: () => onTune(held.uid),
      },
      /*
       * No Repintar row. Paint is in the workshop now, behind "Llevar al
       * taller" above -- the same door as everything else you pay to change
       * about a car. A second way in from here would be a row that opens the
       * screen the row above it already opens.
       */
      {
        label: "Vender",
        icon: ICON.sell,
        // The hint doubles as the reason when the item is dead. A greyed row
        // with no explanation reads as a bug.
        // the parts go with the car, so the quote has to count them
        hint: last ? "tu único auto" : `${formatCredits(sellValueFor(spec, km, held.mods))} cr`,
        danger: true,
        disabled: last,
        onPick: () => setSelling(held.uid),
      },
    ];
  }, [menu, currentUid, owned, onDrive, onTune]);

  return (
    <>
      <div className="screen-head">
        <h2 className="screen-title">Garaje</h2>
        <p className="screen-sub">
          {cars.length} auto{cars.length === 1 ? "" : "s"} · {models} de {CARS.length} modelos. Clic
          en un auto para su ficha, clic derecho para sus opciones.
        </p>
      </div>

      {/*
        * The cars SETTLE, they do not arrive from anywhere.
        *
        * This is where the taller's character had to be translated rather than
        * copied. In the workshop a row comes in from the left because the tiles
        * are being brought out to you -- a new set of options, fetched. These
        * cars were already yours before the screen drew, so there is nowhere
        * for them to have come from, and sliding them in from the side would be
        * borrowing the workshop's word for navigation to say something that is
        * not navigation. Rule 2: a surface with no direction to express does
        * not borrow one.
        *
        * So they rise the 8px of --rise and settle, in order, which is rule 1
        * applied to a list -- one at a time rather than one event with six
        * participants. The order is the reading order of the grid, so the
        * garage reads as being dealt out to you.
        *
        * `--i` is the position, capped in motion.css so a full garage does not
        * take a second and a half to finish appearing.
        */}
      <div className="screen-body">
        <div className="card-grid run">
          {/*
            * Keyed on the UID, and the handlers close over it rather than
            * taking the id CarCard reports.
            *
            * The card knows what MODEL it is drawing and nothing more, which is
            * right -- it is the same component the shop uses, where a listing
            * really is a model. Two cards for the same model would share a
            * React key and open the same sheet; the uid is the garage's own
            * answer to which card was clicked, so it is the garage that
            * supplies it.
            */}
          {cars.map(({ uid, spec: c, km, mods, image }) => (
            <CarCard
              key={uid}
              spec={c}
              km={km}
              mods={mods}
              image={image}
              onOpen={() => setOpenUid(uid)}
              onContextMenu={(e) => {
                e.preventDefault();
                // The Menu key and Shift+F10 fire contextmenu with zeroed
                // coordinates. Fall back to the card itself so the menu opens
                // next to what it belongs to rather than in the top corner.
                const kbd = e.clientX <= 0 && e.clientY <= 0;
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                setMenu({
                  x: kbd ? r.left + 24 : e.clientX,
                  y: kbd ? r.bottom - 12 : e.clientY,
                  uid,
                });
              }}
            />
          ))}
        </div>
      </div>

      {menu && items.length > 0 ? (
        <ContextMenu x={menu.x} y={menu.y} items={items} onClose={close} />
      ) : null}

      {open ? (
        <CarModal
          spec={open.spec}
          km={open.km}
          mods={open.mods}
          color={open.color}
          image={open.image}
          sheet={{
            kind: "garage",
            canSell: owned.length > 1,
            isCurrent: open.uid === currentUid,
            onDrive: () => onDrive(open.uid),
            onSell: () => setSelling(open.uid),
            onTune: () => onTune(open.uid),
          }}
          onClose={() => setOpenUid(null)}
        />
      ) : null}

      {sellingCar ? (
        <Confirm
          question={`¿Vender tu ${sellingCar.spec.make} ${sellingCar.spec.model}?`}
          /*
           * The odometer is in the question, not decoration: with two of a
           * model in the garage the name alone does not say which one is about
           * to go, and the km is the one figure that always differs between
           * two units and is already on both their cards.
           */
          detail={`El de ${formatKm(sellingCar.km)}. Te pagan ${formatCredits(
            sellValueFor(sellingCar.spec, sellingCar.km, sellingCar.mods),
          )} cr${
            modCount(sellingCar.mods) > 0 ? ", con las piezas puestas" : ""
          }. No se puede deshacer.`}
          yes="Vender"
          danger
          onYes={() => {
            onSell(sellingCar.uid);
            // The sheet is showing a car that is about to leave the garage.
            setOpenUid(null);
          }}
          onClose={() => setSelling(null)}
        />
      ) : null}
    </>
  );
}
