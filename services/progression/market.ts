import type { CarSpec, Rarity } from "@contracts/car";
import type { Mods, PartId, PartLevel } from "@contracts/mods";
import { PART_IDS } from "@contracts/mods";
import { CARS } from "@catalog/cars";

import { hashSeed, mulberry32 } from "@sim/rng";
import type { Save } from "./save";
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

/**
 * The catalogue cut by how hard a car is to come by. Three bands, and the
 * middle one is a band by being in NEITHER list.
 *
 * ORDINARY is what you find on any street: the stock of a cheap yard, and the
 * filler of a used lot. SCARCE is the other end -- a car that is hard to get
 * hold of, whatever it laps.
 *
 * `rare` is deliberately in neither. It is the band that has no shop of its own
 * at either end, so a rare car is only ever on the forecourt of its own segment
 * -- one place in the game, rather than two.
 */
export const ORDINARY: Rarity[] = ["common", "uncommon"];
export const SCARCE: Rarity[] = ["vrare", "exclusive", "unique"];

/**
 * The tiers a forecourt only SOMETIMES has one of, and how often.
 *
 * Everything not listed here is on the floor every era: a dealer that carries
 * it, has it. These two are not, and that is the whole point -- a house whose
 * pitch is "if you ask the price it is not for you" cannot credibly have an F40
 * in the window every week of the year. A car being permanently in stock is the
 * opposite of the thing its tier claims about it.
 *
 * So scarcity finally does something other than move a price. `unique` at 0.2
 * means the top of the catalogue is on a forecourt one era in five; `exclusive`
 * at 0.4 is a little under half. Neither is a wall: an era is DEALER_PERIOD
 * races, so a car that is in stock stays in stock long enough to go and earn
 * the money for it, and the Marketplace can always turn one up in the meantime.
 *
 * It is a REASON TO WALK IN, which is the thing a rotating floor is for. You
 * cannot plan around it, you can only go and look -- and unlike the lot, when
 * you look you get an answer that holds for the next few races.
 */
export const SHOWPIECE_CHANCE: Partial<Record<Rarity, number>> = {
  exclusive: 0.4,
  unique: 0.2,
};

/** Whether this car's presence on a forecourt is rolled at all. */
export const isShowpiece = (spec: CarSpec): boolean =>
  SHOWPIECE_CHANCE[spec.rarity] !== undefined;

/**
 * Whether anybody has one of these this era.
 *
 * Salted with the CAR and the era, deliberately NOT with the dealer. Two houses
 * can carry the same car -- Recoleta and Panamericana both deal in an M3 E30 --
 * and rolling per dealer would make each one's answer a coin flip of its own:
 * the car would be absent from Recoleta and sitting on Panamericana's floor,
 * which reads as a bug rather than as scarcity, and would halve the effect of
 * the roll into the bargain.
 *
 * "Is there one around this month" is a fact about the CAR. Every forecourt
 * that deals in it agrees, and the player learns one rule instead of four.
 */
export function onFloor(spec: CarSpec, era: number): boolean {
  const chance = SHOWPIECE_CHANCE[spec.rarity];
  if (chance === undefined) return true;
  return mulberry32(hashSeed(`showpiece|${spec.id}|${era}`))() < chance;
}

export const DEALERS: Dealer[] = [
  {
    id: "exclusivos",
    name: "Exclusivos Recoleta",
    tagline: "Importados. Si preguntás el precio, no es para vos.",
    /*
     * By TIER, not by price and not by rating.
     *
     * It was a rating floor once, and that let a Fuego GTA Max share a
     * forecourt with an F40 because a hot Renault is genuinely quick -- and
     * "quick" was never what this dealer sells. So it became a price floor,
     * which was closer but still the wrong question asked sideways: priceOf is
     * mostly rarity with a gentle nudge from the class index, so a slow vrare
     * cotized under the floor and fell off the forecourt for being slow. Same
     * bug as the first one, one layer down and harder to see.
     *
     * A vrare that laps badly is still a hard car to find, and hard to find is
     * the entire product here. Reading the tier directly says that, and it
     * cannot be knocked out by a car being slow or by the price table moving.
     *
     * `supercar` stays alongside it because it is the only segment with no
     * house of its own -- Pacheco takes saloons and muscle, Panamericana takes
     * sports, and nobody else takes a supercar. It is a segment rule sitting in
     * a tier list, which is untidy, and it is the thing that keeps a supercar
     * from depending on its tier to have anywhere to be sold at all.
     */
    carries: (c) => c.cls === "supercar" || SCARCE.includes(c.rarity),
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
    /*
     * The other half of the same correction. On a price ceiling of 35.000 the
     * Fuego GTA Max sat at 34.600 -- one good class index away from falling out
     * of the cheap yard for being quick, which is not what makes a car cheap.
     * An uncommon car belongs in a cheap yard because it is an uncommon car.
     */
    carries: (c) => ORDINARY.includes(c.rarity),
  },
];

export function dealerById(id: string): Dealer | undefined {
  return DEALERS.find((d) => d.id === id);
}

/**
 * How many races a concesionaria's floor stands before the cars on it are
 * replaced with different ones.
 *
 * The Marketplace turns over every race, and a dealer that did the same would
 * be a second Marketplace with worse prices. Five is chosen so the two clocks
 * read as different KINDS of thing rather than as two speeds: the lot is what
 * you check after every race, and the forecourt is what has changed next time
 * you think to look. It is also long enough that you can leave, go and earn the
 * money, and come back to the same car -- which is the promise a concesionaria
 * makes and the lot does not.
 */
export const DEALER_PERIOD = 5;

/**
 * Which floor a dealer is showing, from the game's one clock.
 *
 * Same clock the lot uses -- racesRun + lotNudge -- divided down. That is what
 * keeps the dev refresh honest: it advances both, so five presses move the
 * forecourts exactly as far as five races would, and nothing you can reach
 * with the button is a state the game could not reach on its own.
 */
export const dealerEra = (clock: number): number => Math.floor(clock / DEALER_PERIOD);

/** Races left before the forecourts change hands. Never 0: it counts down to 1. */
export const racesToRotation = (clock: number): number =>
  DEALER_PERIOD - (((clock % DEALER_PERIOD) + DEALER_PERIOD) % DEALER_PERIOD);

/**
 * What a dealer has on the floor this era: every car it carries, as a
 * particular example of that car.
 *
 * Two things changed here at once, and they are the same change seen from two
 * sides. It no longer hides what you own, because a second unit of a car is a
 * real thing to want -- one built for a circuit that rewards it, one left stock
 * -- and a shop that refuses to sell you one was only ever enforcing the old
 * garage's inability to hold it. And the stock ROTATES, because once the model
 * list never shrinks, a forecourt that never changed would be a vending machine
 * you visit once.
 *
 * What rotates is the UNIT, not the roster. The same dealer carries the same
 * cars forever, which is the promise its tagline makes and the reason you can
 * plan for one; what changes every DEALER_PERIOD races is which example of each
 * it has -- this era's Falcon has 210.000 km and is white, next era's has
 * 90.000 and is red, and it costs accordingly. So checking back is worth
 * something (a better example of the car you want) without the car you want
 * ever disappearing on you.
 *
 * With ONE exception, and it is why `carries` and the floor are two different
 * questions. A showpiece -- an `exclusive` or a `unique` -- is on the roster
 * forever and on the FLOOR only some eras. Recoleta deals in F40s; Recoleta
 * does not have an F40 in the window every week, because a car that is
 * permanently in stock is not a unique car. See onFloor.
 *
 * Keeping the two apart is what makes that describable rather than fiddly:
 * `carries` stays a flat fact about the house that never moves, and everything
 * that comes and goes is one roll in one place.
 *
 * No mods on any of it. A concesionaria sells what the factory built, and that
 * is a fact about these four dealers rather than a rule about forecourts --
 * `offer` takes mods from any caller, the sheet draws the preparación row off
 * the CAR rather than off which screen you are on, and `buyCar` carries
 * whatever a listing has into the save. So a dealer that stocks a modified car
 * is a change to this function and nothing else.
 */
export function stockOf(dealer: Dealer, era = 0, sold: string[] = []): Offer[] {
  return CARS.filter(
    (c) => dealer.carries(c) && onFloor(c, era) && !sold.includes(offerToken(dealer.id, era, c.id)),
  ).map((c) =>
    // salted with the dealer AND the era, so its cars keep their odometers for
    // as long as that floor stands and get new ones when it turns over
    offer(c, `${dealer.id}|${era}`),
  );
}

/**
 * Where the Marketplace's listings come from, for the purposes of naming one.
 *
 * A string rather than a dealer id because the lot is not a dealer -- it has no
 * roster, no tagline and no floor -- but a car on it is exactly as much a
 * particular car as one on a forecourt, and it goes away when you buy it for
 * exactly the same reason.
 */
export const LOT_SOURCE = "usados";

/**
 * The name of one offer: one car, in one window, in one rotation.
 *
 * The rotation is IN the name, and that is what makes the whole thing
 * self-cleaning. A token minted against era 3 can never match an offer on era
 * 4's floor, so a save that never pruned would still be CORRECT -- the stale
 * entries would just pile up. Nothing has to run on a timer, and nothing has to
 * know when a floor turned over in order to forget about it.
 *
 * The two sources count rotations differently and that is fine: a dealer's is
 * dealerEra(clock) and the lot's is the clock itself. They never collide
 * because the source is the first field.
 */
export const offerToken = (source: string, rotation: number, carId: string): string =>
  `${source}|${rotation}|${carId}`;

/**
 * Take one car off the window it was bought from.
 *
 * Lives here rather than in economy.ts for two reasons, one of them dull:
 * market.ts already imports economy.ts for priceOf, so the arrow cannot point
 * back. The other is that this is the module that knows what an offer IS -- how
 * one is named, which window it sat in, and when that window turns over -- and
 * splitting the token format from the thing that writes it is how the two drift.
 *
 * Prunes on the way through. Every surviving token is checked against the
 * rotation its own source is actually showing right now, which is why a dealer
 * token and a lot token can sit in the same list and be judged by different
 * clocks. The list ends up the size of one rotation's shopping rather than the
 * size of a whole save's.
 *
 * Returns the save unchanged when the car was already struck off, the same
 * contract every other move has: this is reachable from a click handler, and a
 * repeated one should do nothing rather than write a duplicate.
 */
export function takeOffFloor(save: Save, source: string, rotation: number, carId: string): Save {
  const token = offerToken(source, rotation, carId);
  if (save.sold.includes(token)) return save;
  const clock = save.racesRun + save.lotNudge;
  const live = (t: string) => {
    const parts = t.split("|");
    const showing = parts[0] === LOT_SOURCE ? clock : dealerEra(clock);
    return Number(parts[1]) === showing;
  };
  return { ...save, sold: [...save.sold.filter(live), token] };
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

/**
 * WHICH treasure, once the slot has decided to be one.
 *
 * The draw was flat, and flat made the tier ladder decorative in the one place
 * a collection game most wants it to bite: a `rare` Torino and a `unique` F40
 * came out of the same hat with the same odds, so the rarest car in the
 * catalogue was as easy to stumble into as the fifth-rarest. Rarity moved the
 * price and nothing else about finding the car.
 *
 * Halving at each step up the ladder. Read against the pool as it stands -- 5
 * rare, 3 vrare, 3 exclusive, 1 unique -- it comes out as: about one lot in
 * five has a rare on it, one in sixteen a vrare, one in thirty a exclusive, and
 * an F40 turns up about once every two hundred races.
 *
 * That last number only reads as harsh if the lot is the way you get one, and
 * it is not: an F40 is on Recoleta's floor one rotation in five, which is about
 * once every twenty-four races. The forecourt is the route and the lot is the
 * lucky break. Weighting them the same way would have made the lucky break the
 * route, which is what "flat" quietly was.
 *
 * The ordinary tiers sit here at 0 rather than being left out. This is a
 * `Record<Rarity, number>`, so a seventh tier added to the contract is a
 * compile error here -- someone has to decide what it is worth finding, instead
 * of it defaulting to "never" and nobody noticing for a year.
 */
export const TREASURE_WEIGHT: Record<Rarity, number> = {
  // the other five slots are made of these; the treasure slot never is
  common: 0,
  uncommon: 0,
  rare: 8,
  vrare: 4,
  exclusive: 2,
  unique: 1,
};

/*
 * The lot's filler is the same two tiers Don Beto's yard is, and it is the same
 * constant rather than a second copy of the list. They are one claim about the
 * catalogue -- "the ordinary half" -- and two copies would drift the day a
 * seventh tier is added, leaving a car that is junk to one and treasure to the
 * other.
 */

/**
 * The lot for one rotation.
 *
 * Seeded, so a given rotation is exactly the same list every time it is
 * rendered -- the screen can re-run this on every keystroke in the filter box
 * without the stock shuffling under the cursor. Feed it save.racesRun and the
 * lot turns over when you race, which is the only clock this game has.
 *
 * It used to take your garage and skip anything in it. It does not any more,
 * for the reason stockOf does not: two of a model are two cars now, and a
 * private sale is the most natural place in the game to find the second one --
 * somebody else's, with its own kilometres and somebody else's turbo on it. The
 * side effect is that the lot stays six deep late in the game instead of
 * thinning out as you buy the catalogue.
 *
 * `sold` is a different question and it does shorten the lot: a used car you
 * have already bought is in your garage, so it is not still for sale. That is
 * the one case where a six-slot lot comes back with five.
 */
export function usedLot(seed: number, sold: string[] = []): Offer[] {
  const rng = mulberry32(seed);
  const available = CARS;
  const junk = available.filter((c) => ORDINARY.includes(c.rarity));
  const treasure = available.filter((c) => !ORDINARY.includes(c.rarity));

  const lot: CarSpec[] = [];

  /**
   * One car out of a pool, in EXACTLY one roll of the rng.
   *
   * The single roll is the whole constraint, not a tidiness preference. The lot
   * is one long deterministic sequence, so a draw that spent two rolls where it
   * used to spend one would shift every roll after it and hand every player a
   * different Marketplace on every rotation they had already learned. Both
   * branches below take one value from `rng` and neither takes a second.
   *
   * `weighted` is what the treasure slot uses: same pool, but a car's chance is
   * TREASURE_WEIGHT for its tier rather than one share each. The walk down the
   * cumulative weights is the standard trick for spending one number on a
   * non-uniform pick.
   */
  const draw = (from: CarSpec[], weighted = false) => {
    const left = from.filter((c) => !lot.includes(c));
    if (left.length === 0) return false;
    if (!weighted) {
      lot.push(left[Math.floor(rng() * left.length)]!);
      return true;
    }
    const total = left.reduce((n, c) => n + TREASURE_WEIGHT[c.rarity], 0);
    // A pool whose every member is worth 0 to find is not a reason to return a
    // short lot: fall back to an even chance, still on one roll.
    if (total <= 0) {
      lot.push(left[Math.floor(rng() * left.length)]!);
      return true;
    }
    let r = rng() * total;
    // `at(-1)` is the floating-point backstop, not the normal exit: the
    // subtractions can leave r a hair above 0 on the last member.
    let pick = left.at(-1)!;
    for (const c of left) {
      r -= TREASURE_WEIGHT[c.rarity];
      if (r < 0) {
        pick = c;
        break;
      }
    }
    lot.push(pick);
    return true;
  };

  for (let i = 0; i < LOT_SIZE - 1; i++) {
    // fall back to the whole pool rather than returning a short lot when the
    // junk runs out, which is what happens late on once you own the cheap half
    if (!draw(junk)) draw(available);
  }
  if (rng() < TREASURE_CHANCE) {
    // the one weighted draw in the game: scarcer tiers come out of the hat less
    if (!draw(treasure, true)) draw(available, true);
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
  /*
   * The sold ones are filtered AFTER every car has been built, never before the
   * draw. Filtering the pool would change which cars get drawn, so buying one
   * car off the lot would reshuffle the other five -- and the whole rotation
   * would be a different rotation because you went shopping. Build the six the
   * seed says, then remove the ones that are no longer for sale.
   *
   * The map has to run over all six for the same reason: rollMods spends rng
   * per car, so skipping one would shift the parts on every car after it.
   */
  return lot
    .map((c) => offer(c, `usados-${seed}`, USED_RATE, rollMods(rng)))
    .filter((o) => !sold.includes(offerToken(LOT_SOURCE, seed, o.spec.id)));
}
