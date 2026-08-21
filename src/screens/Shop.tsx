import { useMemo, useState } from "react";
import { ownedIds, type Save } from "@progression/save";
import { formatCredits } from "@progression/economy";
import {
  DEALERS,
  dealerById,
  stockOf,
  usedLot,
  USED_RATE,
} from "@progression/market";
import { Listing } from "../components/Listing";

interface Props {
  save: Save;
  onBuy: (carId: string, price: number, km: number, color?: string) => void;
}

type View = { at: "choose" } | { at: "dealers" } | { at: "dealer"; id: string } | { at: "used" };

/**
 * Where you buy a car. Two doors, and the difference between them is the
 * point:
 *
 *   Concesionarios are STABLE. A dealer carries what it carries, at the
 *   catalogue price, forever. If you want the F40 you know exactly where it
 *   is and exactly what it costs, and the only question is money.
 *
 *   The Marketplace ROTATES and is cheaper. It turns over every race,
 *   it is mostly tired sedans, and roughly three lots in ten have something
 *   worth crossing the room for. You cannot plan for it; you can only look.
 *
 * One is a shopping list, the other is a reason to check back. Neither works
 * without the other -- a shop with only the stable half is a menu, and a shop
 * with only the rotating half means the car you want may never turn up.
 *
 * The view lives here rather than in the app's Screen union so the nav keeps
 * the shop tab lit the whole way down, and so backing out of a dealer is a
 * local move rather than a route.
 */
export function Shop({ save, onBuy }: Props) {
  const [view, setView] = useState<View>({ at: "choose" });

  // Keyed to races run: the lot turns over when you race, which is the only
  // clock this game has. Frozen per rotation, so filtering never reshuffles it.
  const lot = useMemo(() => usedLot(save.racesRun, ownedIds(save)), [save.racesRun, save.owned]);

  if (view.at === "choose") {
    const treasure = lot.some((o) => o.condition.band === "survivor" || !!["rare","epic","legendary","apex"].includes(o.spec.rarity));
    return (
      <>
        <h2 className="screen-title">Comprar</h2>
        <p className="screen-sub">Tenés {formatCredits(save.credits)} cr.</p>

        <div className="pick-grid">
          <button className="pick-card pick-dealers" onClick={() => setView({ at: "dealers" })}>
            <span className="pick-name">Concesionarios</span>
            <span className="pick-note">
              {DEALERS.length} casas · precio de lista · siempre el mismo stock
            </span>
          </button>

          <button className="pick-card pick-used" onClick={() => setView({ at: "used" })}>
            <span className="pick-name">Marketplace</span>
            <span className="pick-note">
              {lot.length} autos · {Math.round((1 - USED_RATE) * 100)}% menos · rota cada carrera
            </span>
            {treasure ? <span className="pick-flag">Hay algo bueno</span> : null}
          </button>
        </div>
      </>
    );
  }

  if (view.at === "dealers") {
    return (
      <>
        <Crumb onBack={() => setView({ at: "choose" })} />
        <h2 className="screen-title">Concesionarios</h2>
        <p className="screen-sub">Precio de lista. Lo que ves hoy es lo que hay siempre.</p>

        <div className="dealer-grid">
          {DEALERS.map((d) => {
            const stock = stockOf(d, ownedIds(save));
            const cheapest = stock.length ? Math.min(...stock.map((o) => o.price)) : 0;
            return (
              <button
                key={d.id}
                className="dealer-card"
                disabled={stock.length === 0}
                onClick={() => setView({ at: "dealer", id: d.id })}
              >
                <span className="dealer-name">{d.name}</span>
                <span className="dealer-tagline">{d.tagline}</span>
                <span className="dealer-meta">
                  {stock.length === 0
                    ? "Sin stock: ya tenés todo lo suyo"
                    : `${stock.length} auto${stock.length === 1 ? "" : "s"} · desde ${formatCredits(cheapest)} cr`}
                </span>
              </button>
            );
          })}
        </div>
      </>
    );
  }

  if (view.at === "dealer") {
    const dealer = dealerById(view.id);
    if (!dealer) return <p>Concesionaria no encontrada.</p>;
    return (
      <>
        <Crumb onBack={() => setView({ at: "dealers" })} label="Concesionarios" />
        <h2 className="screen-title">{dealer.name}</h2>
        <p className="screen-sub">{dealer.tagline}</p>
        <Listing
          offers={stockOf(dealer, ownedIds(save))}
          credits={save.credits}
          owned={ownedIds(save)}
          onBuy={onBuy}
          empty="Ya tenés todo lo que vende esta casa."
        />
      </>
    );
  }

  return (
    <>
      <Crumb onBack={() => setView({ at: "choose" })} />
      <h2 className="screen-title">Marketplace</h2>
      <p className="screen-sub">
        {Math.round((1 - USED_RATE) * 100)}% menos que en la concesionaria. Rota cada carrera.
      </p>
      <Listing
        offers={lot}
        credits={save.credits}
        owned={ownedIds(save)}
        onBuy={onBuy}
        controls={false}
        empty="Hoy no hay nada. Corré una carrera y volvé."
      />
    </>
  );
}

/** The way back up. The topbar nav gets you out of the shop, not around it. */
function Crumb({ onBack, label = "Comprar" }: { onBack: () => void; label?: string }) {
  return (
    <button className="crumb-back" onClick={onBack}>
      ← {label}
    </button>
  );
}
