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
   * for these yet, and no marque logo for Dodge -- the card renders without
   * them.
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
  /*
   * The catalogue proper. Argentine production cars through the 70s and 80s,
   * then the imports that fill B upward -- the classes above C had one car in
   * them and a class with one car is not a class.
   *
   * Every line is the published figure. Where a car is famous enough to have a
   * road-tested 0-100 I have given it, because that is the field that
   * calibrates the model exactly; where it is not, it stays out rather than
   * being invented.
   */
  /*
   * The GT was never the 2.0 -- that was the L. Ford Pacheco built the Taunus
   * from June 1974 to November 1984 and the Coupé GT had the 2.3 I4 at 122 CV
   * for the whole run, so the old 68 kW / 92 CV line here was the base sedan's
   * engine under the GT's name.
   *
   * Both performance figures are measured rather than claimed: Parabrisas
   * Corsa timed 173.73 km/h as the average of two runs in opposite directions
   * and 12.0 s to 100 (May 1975). That pair calibrates the car exactly, which
   * is why swapping 92 CV for 122 CV barely moves its rating -- the published
   * power went up 32% and the stopwatch says it is still a 12-second car. The
   * fitted scalar lands at 0.75, the low end of believable, because 122 CV is
   * an SAE gross figure and the crankshaft never saw all of it.
   */
  {
    id: "ford-taunus-gt",
    make: "Ford",
    model: "Taunus GT",
    year: 1974,
    kW: 90, // 2.3 I4 OHC, 122 CV SAE at 5.000 rpm
    kg: 1100, // 1.103 kg with a full tank, per the factory sheet
    layout: "FR",
    cls: "saloon",
    topKph: 174, // 173,73 measured
    zeroTo100: 12.0,
    nm: 192, // 19,6 kgm at 3.500 rpm
    rarity: "common",
    blurb: "Coupé",
    logo: "/ford-logo.png",
  },
  {
    id: "chevrolet-chevy-250",
    make: "Chevrolet",
    model: "Chevy 250",
    year: 1975,
    kW: 81, // 3.8 I6, 110 CV
    kg: 1200,
    layout: "FR",
    cls: "saloon",
    topKph: 165,
    nm: 265,
    rarity: "common",
    blurb: "Sedán",
  },
  {
    id: "renault-18-gtx",
    make: "Renault",
    model: "18 GTX",
    year: 1985,
    kW: 76, // 2.0 I4, 104 CV
    kg: 1050,
    layout: "FWD",
    cls: "saloon",
    topKph: 175,
    nm: 160,
    rarity: "common",
    blurb: "Sedán",
    logo: "/renault-logo.png",
  },
  {
    id: "chevrolet-chevy-ss",
    make: "Chevrolet",
    model: "Chevy Super Sport",
    year: 1972,
    kW: 114, // 3.8 I6, 155 CV
    kg: 1230,
    layout: "FR",
    cls: "muscle",
    topKph: 185,
    nm: 300,
    rarity: "uncommon",
    blurb: "Coupé",
  },
  {
    id: "renault-fuego-gta",
    make: "Renault",
    model: "Fuego GTA Max",
    year: 1990,
    kW: 88, // 2.2 I4, 120 CV
    kg: 1130,
    layout: "FWD",
    cls: "sports",
    topKph: 190,
    nm: 180,
    rarity: "uncommon",
    blurb: "Coupé",
    logo: "/renault-logo.png",
    image: "/renault-fuego-gta-max.png",
  },
  {
    id: "ford-sierra-xr4",
    make: "Ford",
    model: "Sierra XR4",
    year: 1990,
    kW: 92, // 2.3 I4, 125 CV
    kg: 1180,
    layout: "FR",
    cls: "sports",
    topKph: 195,
    nm: 190,
    rarity: "uncommon",
    blurb: "Coupé",
    logo: "/ford-logo.png",
  },
  {
    id: "volkswagen-gol-gti",
    make: "Volkswagen",
    model: "Gol GTI",
    year: 1994,
    kW: 107, // 2.0 16v, 145 CV
    kg: 1010,
    layout: "FWD",
    cls: "sports",
    topKph: 200,
    nm: 180,
    rarity: "uncommon",
    blurb: "Compacto deportivo",
  },
  {
    id: "renault-torino-380w",
    make: "Renault",
    model: "Torino 380W",
    year: 1970,
    kW: 129, // Tornado 3.0 I6, 176 CV -- the triple-Weber 380W, not the ZX
    kg: 1290,
    layout: "FR",
    cls: "muscle",
    topKph: 190,
    nm: 285,
    rarity: "rare",
    blurb: "Coupé",
    logo: "/renault-logo.png",
  },
  {
    id: "peugeot-205-gti",
    make: "Peugeot",
    model: "205 GTI 1.9",
    year: 1987,
    kW: 96, // 130 CV
    kg: 880,
    layout: "FWD",
    cls: "sports",
    topKph: 206,
    zeroTo100: 7.8,
    nm: 165,
    rarity: "rare",
    blurb: "Hot hatch",
    logo: "/peugeot-logo.png",
  },
  {
    id: "volkswagen-golf-gti-16v",
    make: "Volkswagen",
    model: "Golf GTI 16v",
    year: 1987,
    kW: 102, // 139 CV
    kg: 960,
    layout: "FWD",
    cls: "sports",
    topKph: 208,
    zeroTo100: 8.1,
    nm: 168,
    rarity: "rare",
    blurb: "Hot hatch",
  },
  {
    id: "bmw-m3-e30",
    make: "BMW",
    model: "M3 E30",
    year: 1987,
    kW: 143, // S14 2.3, 195 CV
    kg: 1200,
    layout: "FR",
    cls: "sports",
    topKph: 235,
    zeroTo100: 6.7,
    nm: 230,
    rarity: "epic",
    blurb: "Coupé de carrera",
    logo: "/bmw-logo.png",
  },
  {
    id: "lancia-delta-integrale",
    make: "Lancia",
    model: "Delta HF Integrale",
    year: 1990,
    kW: 147, // 16v, 200 CV
    kg: 1300,
    layout: "AWD",
    cls: "sports",
    topKph: 220,
    zeroTo100: 5.7,
    nm: 298,
    rarity: "epic",
    blurb: "Rally homologado",
  },
  {
    id: "porsche-911-carrera-32",
    make: "Porsche",
    model: "911 Carrera 3.2",
    year: 1987,
    kW: 170, // 231 CV
    kg: 1210,
    layout: "RR",
    cls: "sports",
    topKph: 245,
    zeroTo100: 6.1,
    nm: 284,
    rarity: "epic",
    blurb: "Deportivo",
  },
  {
    id: "honda-nsx",
    make: "Honda",
    model: "NSX",
    year: 1991,
    kW: 201, // 274 CV
    kg: 1370,
    layout: "MR",
    cls: "supercar",
    topKph: 270,
    zeroTo100: 5.7,
    nm: 285,
    rarity: "legendary",
    blurb: "Superdeportivo",
    logo: "/honda-logo.png",
  },
  {
    id: "subaru-impreza-22b",
    make: "Subaru",
    model: "Impreza 22B STi",
    year: 1998,
    kW: 206, // 280 CV
    kg: 1270,
    layout: "AWD",
    cls: "sports",
    topKph: 250,
    zeroTo100: 5.0,
    nm: 363,
    rarity: "legendary",
    blurb: "Rally homologado",
  },
  {
    id: "ferrari-f40",
    make: "Ferrari",
    model: "F40",
    year: 1988,
    kW: 352, // 478 CV
    kg: 1100,
    layout: "MR",
    cls: "supercar",
    topKph: 324,
    zeroTo100: 4.1,
    nm: 577,
    rarity: "apex",
    blurb: "Superdeportivo",
    logo: "/ferrari-logo.png",
  },
  /*
   * Both phases of the 607 V6, at Siro's call: he wants the variety even
   * where the change is small. They are 4 hp and 20 kg apart, so expect them
   * to rate within a point or two and to share a grid happily -- that is the
   * cost of the pair, and it is a deliberate one.
   *
   * Names kept to "607 V6" and "607 V6 FII" because the card title is a flex
   * row and "607 V6 ES9 Fase I" wraps and shoves the class badge to a second
   * line. The years on the card do most of the telling apart anyway.
   */
  {
    id: "peugeot-607-v6-f1",
    make: "Peugeot",
    model: "607 V6 Fase 1",
    year: 2000,
    kW: 154, // ES9J4S 3.0 V6, 207 hp
    kg: 1580,
    layout: "FWD",
    cls: "saloon",
    topKph: 235,
    zeroTo100: 8.5,
    nm: 285,
    rarity: "uncommon",
    blurb: "Sedán ejecutivo",
    logo: "/peugeot-logo.png",
  },
  {
    id: "peugeot-607-v6-f2",
    make: "Peugeot",
    model: "607 V6 Fase 2",
    year: 2005,
    kW: 157, // ES9A 3.0 V6, 211 hp -- the facelift
    kg: 1600,
    layout: "FWD",
    cls: "saloon",
    topKph: 237,
    zeroTo100: 8.3,
    nm: 285,
    rarity: "uncommon",
    blurb: "Sedán ejecutivo",
    logo: "/peugeot-logo.png",
  },
];
export function carById(id: string): CarSpec | undefined {
  return CARS.find((c) => c.id === id);
}
