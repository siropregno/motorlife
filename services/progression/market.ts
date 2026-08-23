import type { CarSpec, Rarity } from "@contracts/car";
import type { Mods, PartId, PartLevel } from "@contracts/mods";
import { PART_IDS } from "@contracts/mods";
import { CARS } from "@catalog/cars";

import { mulberry32 } from "@sim/rng";
import { priceOf } from "./economy";
import { conditionOf, kmFor, priceWithKm, type Condition } from "./mileage";
import { modsValue } from "./mods";
import { colorFor, imageFor } from "./paint";

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
  /** Absent for a car that only comes in one colour. */
  color?: string | undefined;
  /** The photo for THIS car: the colour if it has one, the single image if not. */
  image?: string | undefined;
  /**
   * What the last owner bolted to it. Absent everywhere but the Marketplace --
   * a concesionaria sells the car the factory built, and a car in a dealer's
   * stock has never had an owner to modify it.
   */
  mods?: Mods | undefined;
  price: number;
  condition: Condition;
}

/**
 * How often a Marketplace car has had something done to it.
 *
 * Small on purpose. A private sale is where a modified car turns up -- somebody
 * fitted a turbo, got bored, and listed it -- and that is a thing you should
 * find occasionally rather than expect. At 0.22 roughly one lot in five has a
 * modified car on it, so it is a reason to look rather than a feature of the
 * screen.
 */
export const MODDED_CHANCE = 0.22;

/**
 * How many parts a modified one carries, and how far up the ladder.
 *
 * One or two parts, street or sport, never competición. The reasoning is the
 * same one that keeps the treasure slot rare: a full racing build for 70% of
 * list would be strictly better than building the car yourself, which would
 * make the workshop a screen you visit once to confirm you should have waited.
 * A street turbo on a tired sedan is a curiosity; a racing everything is an
 * exploit.
 */
export const MODDED_MAX_PARTS = 2;
export const MODDED_MAX_LEVEL = 2 as const;

/**
 * The parts on one Marketplace car, or undefined for the ordinary case.
 *
 * Undefined rather than `{}` for the reason save.ts gives: every function
 * downstream already reads `undefined` as "nothing done to it", and an empty
 * object would put a `{}` into the save on the first purchase of a stock car.
 *
 * `wearKm` is deliberately NOT set. Absent means "the engine has done the car's
 * own km", which is the honest reading of a used car nobody has rebuilt -- and
 * writing 0 here would hand every modified listing a free engine rebuild, which
 * is worth more than the parts.
 */
function rollMods(rng: () => number): Mods | undefined {
  if (rng() >= MODDED_CHANCE) return undefined;
  const count = 1 + Math.floor(rng() * MODDED_MAX_PARTS);
  const pool: PartId[] = [...PART_IDS];
  const out: Mods = {};
  for (let i = 0; i < count && pool.length > 0; i++) {
    const part = pool.splice(Math.floor(rng() * pool.length), 1)[0]!;
    out[part] = (1 + Math.floor(rng() * MODDED_MAX_LEVEL)) as PartLevel;
  }
  return out;
}

/**
 * @param mods  what the previous owner left on it, for a private sale
 */
function offer(spec: CarSpec, salt: string, rate = 1, mods?: Mods | undefined): Offer {
  const km = kmFor(spec, salt);
  const color = colorFor(spec, salt);
  /*
   * The parts are priced ON TOP of the discounted car, at what they are worth
   * on resale -- the same modsValue sellValueFor uses.
   *
   * They cannot ride along free. sellValueFor pays modsValue for a build when
   * you sell, so a listing that charged nothing for its parts would be a car
   * you buy at 70% and sell with a build the trade pays for: the exact
   * arbitrage USED_RATE exists to close, smuggled back in through the
   * workshop. Charging exactly what the trade pays keeps the round trip losing
   * the same 30% it loses on a stock car. There is a test.
   */
  const car = Math.round((priceWithKm(priceOf(spec), spec, km) * rate) / 100) * 100;
  const price = car + modsValue(spec, km, mods);
  const base = { spec, km, price, condition: conditionOf(spec, km), image: imageFor(spec, color) };
  const withColor = color === undefined ? base : { ...base, color };
  return mods === undefined ? withColor : { ...withColor, mods };
}

/**
 * Where cars come from.
 *
 * The catalogue used to be one flat list with a price on each row. It is two
 * places now: concesionarios, which are stable and sorted by what kind of car
 * they are, and the Marketplace, which rotates and is cheaper.
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

/**
 * What a dealer has on the floor: everything it carries that you do not own.
 *
 * No mods on any of it, today. A concesionaria sells what the factory built,
 * and that is a fact about these four dealers rather than a rule about
 * forecourts -- `offer` takes mods from any caller, the sheet draws the
 * preparación row off the CAR rather than off which screen you are on, and
 * `buyCar` carries whatever a listing has into the save. So a dealer that
 * stocks a modified car is a change to this function and nothing else.
 */
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

  /*
   * The parts are rolled in a SECOND pass, after every car is picked.
   *
   * Same rng, so the lot is still one deterministic sequence -- but rolling
   * mods inside the draw loop would put a variable number of calls between one
   * car's draw and the next, and every existing rotation would come back a
   * different list of cars. The lot is a thing players learn ("rotation 12 had
   * the NSX"); which cars are on it is not something a new feature gets to
   * change.
   */
  return lot.map((c) => offer(c, `usados-${seed}`, USED_RATE, rollMods(rng)));
}
