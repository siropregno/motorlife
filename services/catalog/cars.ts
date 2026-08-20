import type { CarSpec } from "@contracts/car";

/**
 * The catalogue. Six required fields per car, all of them readable off a
 * Wikipedia infobox: year, power, mass, layout, class, plus a name.
 *
 * topKph is optional and worth adding whenever you have it, because a
 * published top speed is a measurement of drag rather than a guess. Add a
 * published 0-100 and the car calibrates itself exactly.
 *
 * A note on top speeds: use the UNRESTRICTED figure. An electronically
 * limited number makes the car look far draggier than it is, because the
 * derivation assumes the engine has run out of power when in fact the
 * limiter cut in.
 */
export const CARS: CarSpec[] = [
  {
    id: "bmw-m5-e60",
    make: "BMW",
    model: "M5 E60",
    year: 2005,
    kW: 373,
    kg: 1830,
    layout: "FR",
    cls: "sports",
    topKph: 305, // delimited; the car ships restricted to 250
    zeroTo100: 4.7,
    nm: 520,
    rarity: "epic",
    blurb: "Super Sedán",
    image: "/bmw-m5-e60.png",
    logo: "/bmw-logo.png",
  },
  {
    id: "renault-12-tl",
    make: "Renault",
    model: "R12 TL",
    year: 1971,
    kW: 40,
    kg: 920,
    layout: "FWD",
    cls: "saloon",
    topKph: 145,
    // no road test I trust, so this one stays Estimated rather than invented
    nm: 94,
    rarity: "common",
    blurb: "Compacto",
    image: "/renault-12.png",
    logo: "/renault-logo.png",
  },
  {
    id: "peugeot-504-tn",
    make: "Peugeot",
    model: "504 TN",
    year: 1977,
    kW: 81,
    kg: 1180,
    layout: "FR",
    cls: "sports",
    topKph: 170,
    nm: 166,
    rarity: "common",
    blurb: "Sedán deportivo",
    image: "/peugeot-504.png",
    logo: "/peugeot-logo.png",
  },
  {
    id: "ford-f100",
    make: "Ford",
    model: "F-100",
    year: 1979,
    kW: 85,
    kg: 1700,
    layout: "FR",
    cls: "truck",
    topKph: 155,
    nm: 310,
    rarity: "common",
    blurb: "Pickup",
    image: "/ford-f-100.png",
    logo: "/ford-logo.png",
  },

  /*
   * Argentine classics, added to give D through B a real field instead of
   * three copies of the F-100 under different driver names.
   *
   * Figures are the published ones I am confident in; where a source range
   * exists I have said so on the line rather than picking silently. No photos
   * for these yet, and no marque logo for Fiat or Dodge -- the card renders
   * without them.
   */
  {
    id: "renault-torino-zx",
    make: "Renault",
    model: "Torino ZX",
    year: 1978,
    kW: 96, // Tornado 3.0 I6, 130 CV DIN -- the single-carb ZX, not the 176 CV 5V
    kg: 1250,
    layout: "FR",
    cls: "muscle",
    topKph: 180,
    nm: 230,
    rarity: "rare",
    blurb: "Coupé",
    logo: "/renault-logo.png",
  },
  {
    id: "ford-falcon-sprint",
    make: "Ford",
    model: "Falcon Sprint",
    year: 1973,
    kW: 122, // 221 cid (3.6) I6, 166 CV
    kg: 1290,
    layout: "FR",
    cls: "muscle",
    topKph: 185, // sources give 175-190; the middle of that is the honest pick
    nm: 300,
    rarity: "uncommon",
    blurb: "Sedán deportivo",
    logo: "/ford-logo.png",
  },
  {
    id: "fiat-128-iava",
    make: "Fiat",
    model: "128 IAVA",
    year: 1976,
    kW: 55, // 1.3 TV, 75 CV
    kg: 830,
    layout: "FWD",
    cls: "sports",
    topKph: 160,
    nm: 100,
    rarity: "uncommon",
    blurb: "Compacto deportivo",
    logo: "/fiat-a-logo.png",
  },
  {
    id: "dodge-1500-gt90",
    make: "Dodge",
    model: "1500 GT90",
    year: 1975,
    kW: 66, // 1.5 I4, 90 CV -- the car sold here on Fittipaldi's name
    kg: 925,
    layout: "FWD",
    cls: "sports",
    topKph: 160,
    nm: 115,
    rarity: "common",
    blurb: "Compacto",
  },
];

export function carById(id: string): CarSpec | undefined {
  return CARS.find((c) => c.id === id);
}
