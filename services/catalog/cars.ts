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
];

export function carById(id: string): CarSpec | undefined {
  return CARS.find((c) => c.id === id);
}
