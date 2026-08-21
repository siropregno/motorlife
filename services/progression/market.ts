import type { CarSpec, Rarity } from "@contracts/car";
import { CARS } from "@catalog/cars";

import { mulberry32 } from "@sim/rng";
import { priceOf } from "./economy";
import { conditionOf, kmFor, priceWithKm, type Condition } from "./mileage";

/**
 * A car with a price on it, at one place, on one day.
 *
 * Not a CarSpec: the same F40 is a different offer at two dealers because the
 * odometers differ, and the odometer is most of why one costs more. Every
 * listing in the game is an Offer so the price shown, the price charged and
 * the price it will sell back for are all computed from the same km.
 */
export interface Offer {
  spec: CarSpec;
  km: number;
  price: number;
  condition: Condition;
}

function offer(spec: CarSpec, salt: string, rate = 1): Offer {
  const km = kmFor(spec, salt);
  const price = Math.round((priceWithKm(priceOf(spec), spec, km) * rate) / 100) * 100;
  return { spec, km, price, condition: conditionOf(spec, km) };
}

/**
 * Where cars come from.
 *
 * The catalogue used to be one flat list with a price on each row. It is two
 * places now: concesionarios, which are stable and sorted by what kind of car
 * they are, and the mercado de usados, which rotates and is cheaper.
 *
 * This lives in progression rather than catalog because it is about buying --
 * price, rotation, what you already own. catalog answers "what cars exist" and
 * must not know about a wallet; progression already imports catalog, and the
 * arrow only points one way.
 */

export interface Dealer {
  id: string;
  name: string;
  tagline: string;
  /**
   * What this dealer carries. A predicate over the catalogue rather than a
   * hand-written list of ids, so adding a car puts it on the right forecourt
   * without anyone remembering to. Overlap is fine and deliberate: a 911 is
   * both a sports car and an expensive one.
   */
  carries: (car: CarSpec) => boolean;
}

export const DEALERS: Dealer[] = [
  {
    id: "exclusivos",
    name: "Exclusivos Recoleta",
    tagline: "Importados. Si preguntás el precio, no es para vos.",
    // Priced, not rated. On rating this floor let a Fuego GTA Max share a
    // forecourt with an F40, because a hot Renault is genuinely quick -- and
    // "quick" was never what this dealer is selling.
    carries: (c) => c.cls === "supercar" || priceOf(c) >= 150_000,
  },
  {
    id: "pacheco",
    name: "Concesionaria Pacheco",
    tagline: "El auto de la familia. Y el de la familia del vecino.",
    carries: (c) => c.cls === "saloon" || c.cls === "muscle",
  },
  {
    id: "panamericana",
    name: "Deportivos Panamericana",
    tagline: "Coupés, hot hatches y una nafta cara.",
    carries: (c) => c.cls === "sports",
  },
  {
    id: "donbeto",
    name: "Fierros Don Beto",
    tagline: "Anda todo. Casi todo.",
    carries: (c) => priceOf(c) <= 35_000,
  },
];

export function dealerById(id: string): Dealer | undefined {
  return DEALERS.find((d) => d.id === id);
}

/** What a dealer has on the floor: everything it carries that you do not own. */
export function stockOf(dealer: Dealer, owned: string[] = []): Offer[] {
  return CARS.filter((c) => !owned.includes(c.id) && dealer.carries(c)).map((c) =>
    // salted with the dealer, so its cars keep their odometers between visits
    offer(c, dealer.id),
  );
}

/**
 * The used discount.
 *
 * It MUST stay above SELL_RATE or the game prints money: buy a car used at
 * 0.55, sell it at the catalogue's 0.60, repeat. At 0.70 against a 0.60 sell
 * a round trip loses a tenth of the new price, so the used lot is a saving on
 * a car you want and never a machine. There is a test that pins exactly this.
 */
export const USED_RATE = 0.7;



/** Six on the lot. Enough to browse, few enough that a good one stands out. */
export const LOT_SIZE = 6;

/**
 * How often the last slot is something worth having, rather than another
 * tired sedan. Five slots are always junk and the sixth is the lottery, which
 * is a cleaner promise than rolling every slot: a treasure turns up in about
 * three lots in ten, and you can say that sentence out loud.
 */
export const TREASURE_CHANCE = 0.3;

const JUNK: Rarity[] = ["common", "uncommon"];

/**
 * The lot for one rotation.
 *
 * Seeded, so a given rotation is exactly the same list every time it is
 * rendered -- the screen can re-run this on every keystroke in the filter box
 * without the stock shuffling under the cursor. Feed it save.racesRun and the
 * lot turns over when you race, which is the only clock this game has.
 */
export function usedLot(seed: number, owned: string[] = []): Offer[] {
  const rng = mulberry32(seed);
  const available = CARS.filter((c) => !owned.includes(c.id));
  const junk = available.filter((c) => JUNK.includes(c.rarity));
  const treasure = available.filter((c) => !JUNK.includes(c.rarity));

  const lot: CarSpec[] = [];
  const draw = (from: CarSpec[]) => {
    const left = from.filter((c) => !lot.includes(c));
    if (left.length === 0) return false;
    lot.push(left[Math.floor(rng() * left.length)]!);
    return true;
  };

  for (let i = 0; i < LOT_SIZE - 1; i++) {
    // fall back to the whole pool rather than returning a short lot when the
    // junk runs out, which is what happens late on once you own the cheap half
    if (!draw(junk)) draw(available);
  }
  if (rng() < TREASURE_CHANCE) {
    if (!draw(treasure)) draw(available);
  } else if (!draw(junk)) {
    draw(available);
  }

  return lot.map((c) => offer(c, `usados-${seed}`, USED_RATE));
}
