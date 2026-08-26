import { useMemo, useState } from "react";
import type { Mods } from "@contracts/mods";
import { type Save } from "@progression/save";
import { formatCredits } from "@progression/economy";
import { modCount } from "@progression/mods";
import {
  DEALERS,
  dealerById,
  dealerEra,
  isShowpiece,
  LOT_SOURCE,
  racesToRotation,
  stockOf,
  usedLot,
  USED_RATE,
} from "@progression/market";
import { Listing } from "../components/Listing";
import { ScreenHead } from "../components/ScreenHead";

interface Props {
  save: Save;
  onBuy: (
    carId: string,
    price: number,
    km: number,
    color?: string,
    mods?: Mods,
    origin?: { source: string; rotation: number },
  ) => void;
}

type View = { at: "choose" } | { at: "dealers" } | { at: "dealer"; id: string } | { at: "used" };


/**
 * Where you buy a car. Two doors, and the difference between them is the
 * point:
 *
 *   Concesionarios are STABLE, at the level that matters: a dealer carries the
 *   same MODELS forever, at the catalogue price. If you want the F40 you know
 *   exactly where it is, and the only question is money. What changes, every
 *   DEALER_PERIOD races, is which EXAMPLE of each it has on the floor -- a
 *   different odometer, a different colour, a price that moved with them.
 *
 *   The Marketplace ROTATES and is cheaper. It turns over every race,
 *   it is mostly tired sedans, and roughly three lots in ten have something
 *   worth crossing the room for. You cannot plan for it; you can only look.
 *
 * One is a shopping list, the other is a reason to check back. Neither works
 * without the other -- a shop with only the stable half is a menu, and a shop
 * with only the rotating half means the car you want may never turn up.
 *
 * Neither hides what you already own any more. Two of a model are two cars now,
 * so "you have one" stopped being a reason not to sell you another.
 *
 * The view lives here rather than in the app's Screen union so the nav keeps
 * the shop tab lit the whole way down, and so backing out of a dealer is a
 * local move rather than a route.
 */
export function Shop({ save, onBuy }: Props) {
  const [view, setView] = useState<View>({ at: "choose" });

  /*
   * The one clock the game has: races run, plus the dev nudge in Ajustes.
   *
   * The nudge is ADDED rather than replacing it so both move the shop by
   * exactly one rotation each -- a refreshed shop is a shop you could have
   * raced your way to, and racing after a refresh still advances rather than
   * jumping back.
   *
   * Two things read it at two rates: the lot takes it whole and turns over
   * every race; the forecourts take it divided by DEALER_PERIOD.
   */
  const clock = save.racesRun + save.lotNudge;
  const era = dealerEra(clock);
  const untilRotation = racesToRotation(clock);

  /*
   * Frozen per rotation, so filtering never reshuffles it -- and shortened by
   * whatever has already been bought off it, which is why `sold` is in here
   * too. A used car you drove home is not still on the lot.
   */
  const lot = useMemo(() => usedLot(clock, save.sold), [clock, save.sold]);

  if (view.at === "choose") {
    /*
     * What makes a lot worth crossing the room for: a shed-find, something
     * above uncommon, or a car somebody already put parts on. The third is new
     * and belongs with the other two -- a private sale with a turbo on it is
     * the same kind of "look at this one" the other two are, and without it a
     * lot whose only interesting car is a modified sedan says nothing.
     */
    const treasure = lot.some(
      (o) =>
        o.condition.band === "survivor" ||
        ["rare", "vrare", "exclusive", "unique"].includes(o.spec.rarity) ||
        modCount(o.mods) > 0,
    );
    return (
      <>
        <ScreenHead title="Comprar" sub={`Tenés ${formatCredits(save.credits)} cr.`} />

        {/* Two cards and nothing below them: no scroll box, or the shop's front
            door draws a scrollbar track down a page with nothing under it. */}
        {/*
          * The two doors settle in, left then right.
          *
          * Two members is the smallest run there is, and it is still worth
          * ordering: these are a CHOICE between two things, and showing them
          * one after the other is the difference between offering two options
          * and revealing a row. The gap is the same --step everything else
          * uses, so the pair reads as the front of the same list the dealer
          * grid continues.
          */}
        <div className="screen-body still">
          <div className="pick-grid run">
            <button className="pick-card pick-dealers" onClick={() => setView({ at: "dealers" })}>
              <span className="pick-name">Concesionarios</span>
              {/* "siempre el mismo stock" stopped being true when the floors
                  started turning over. What is still true, and is the thing
                  that makes a concesionaria a concesionaria, is that the model
                  list never moves: the units do. */}
              <span className="pick-note">
                {DEALERS.length} casas · precio de lista · renuevan cada {untilRotation} carrera
                {untilRotation === 1 ? "" : "s"}
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
        </div>
      </>
    );
  }

  if (view.at === "dealers") {
    return (
      <>
        <ScreenHead
          title="Concesionarios"
          sub={`Precio de lista. Los mismos autos siempre; otras unidades en ${untilRotation} carrera${
            untilRotation === 1 ? "" : "s"
          }.`}
          back={{ label: "Comprar", onBack: () => setView({ at: "choose" }) }}
        />

        {/* The four houses arrive in order, the same way the two doors that
            led here did -- one list continuing into another. */}
        <div className="screen-body">
          <div className="dealer-grid run">
            {DEALERS.map((d) => {
              /*
               * The floor can genuinely run out now, so the card has to cope.
               *
               * Not the old "ya tenés todo lo suyo" -- that hid cars you owned,
               * and owning one has stopped being a reason not to sell you
               * another. This is the other thing: the house had ONE of each and
               * you bought them. It fills back up when the floor turns over.
               */
              const stock = stockOf(d, era, save.sold);
              const cheapest = stock.length ? Math.min(...stock.map((o) => o.price)) : 0;
              /*
               * A showpiece on the floor this era, flagged the same way the
               * Marketplace flags a good lot -- and for the same reason. An
               * `exclusive` or a `unique` is only here some of the time, and a
               * feature you have to walk into four houses to discover is a
               * feature most players never find out exists. The flag is what
               * turns "the floor rotates" from a fact about the code into a
               * reason to press this card.
               */
              const showpiece = stock.some((o) => isShowpiece(o.spec));
              return (
                <button
                  key={d.id}
                  className="dealer-card"
                  onClick={() => setView({ at: "dealer", id: d.id })}
                >
                  <span className="dealer-name">{d.name}</span>
                  <span className="dealer-tagline">{d.tagline}</span>
                  <span className="dealer-meta">
                    {/* A house with an empty floor cannot happen with today's
                        catalogue -- Recoleta always has its vrare -- but "0
                        autos · desde 0 cr" is a bad sentence to leave one
                        keystroke away, so it says the true thing instead. */}
                    {stock.length === 0
                      ? "Nada en el piso esta rotación"
                      : `${stock.length} auto${stock.length === 1 ? "" : "s"} · desde ${formatCredits(cheapest)} cr`}
                  </span>
                  {showpiece ? <span className="dealer-flag">Hay algo bueno</span> : null}
                </button>
              );
            })}
          </div>
        </div>
      </>
    );
  }

  if (view.at === "dealer") {
    const dealer = dealerById(view.id);
    if (!dealer) return <p>Concesionaria no encontrada.</p>;
    return (
      <Listing
        offers={stockOf(dealer, era, save.sold)}
        credits={save.credits}
        // the era, not the clock: a forecourt's window is one rotation of ITS
        // floor, and that is what a car bought here has to disappear from
        origin={{ source: dealer.id, rotation: era }}
        onBuy={onBuy}
        title={dealer.name}
        sub={dealer.tagline}
        back={{ label: "Concesionarios", onBack: () => setView({ at: "dealers" }) }}
        empty={`Se llevaron todo. Vuelve a haber en ${untilRotation} carrera${
          untilRotation === 1 ? "" : "s"
        }.`}
      />
    );
  }

  return (
    <Listing
      offers={lot}
      credits={save.credits}
      // the whole clock, not the era: the lot is a new lot every race
      origin={{ source: LOT_SOURCE, rotation: clock }}
      onBuy={onBuy}
      controls={false}
      title="Marketplace"
      sub={`${Math.round((1 - USED_RATE) * 100)}% menos que en la concesionaria. Rota cada carrera.`}
      back={{ label: "Comprar", onBack: () => setView({ at: "choose" }) }}
      empty="Hoy no hay nada. Corré una carrera y volvé."
    />
  );
}
