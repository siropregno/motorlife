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
    rarity: "vrare",
    blurb: "Super Sedán",
    colors: ["black", "gray", "white"],
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
    colors: ["light-blue", "silver"],
    logo: "/renault-logo.png",
  },
  {
    id: "peugeot-504-tn",
    make: "Peugeot",
    model: "504 TN",
    year: 1977,
    kW: 81, // XN1-S 1971 cm³, 110 CV DIN at 5500
    kg: 1180,
    layout: "FR",
    cls: "sports",
    topKph: 175, // 175,183 measured at the SAFRAR launch. Was 170.
    zeroTo100: 11.3,
    nm: 166,
    rarity: "common",
    blurb: "Sedán deportivo",
    colors: ["blue", "orange"],
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
    colors: ["light-blue", "red"],
    photo: "ford-f-100",
    logo: "/ford-logo.png",
  },

  /*
   * Argentine classics, added to give D through B a real field instead of
   * three copies of the F-100 under different driver names.
   *
   * Figures are the published ones I am confident in; where a source range
   * exists I have said so on the line rather than picking silently. The Torino
   * is still waiting on photos and Dodge on a marque logo -- the card renders
   * without either.
   */
  {
    id: "renault-torino-zx",
    make: "Renault",
    model: "Torino ZX",
    year: 1978,
    // OHC 233, 3770 cm³, 200 hp at 4500 rpm and 33 mKg at 3000, per
    // es.wikipedia Torino ZX. This said "130 CV DIN, the single-carb ZX" and
    // that car is not what the ZX was: it is the last and most powerful
    // Torino, not a detuned one.
    kW: 147,
    kg: 1250,
    layout: "FR",
    cls: "muscle",
    // tutorino's ficha for the Cupé ZX. Was 180.
    topKph: 196,
    nm: 324,
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
    // Ford Motor Argentina's own figure, not the middle of a range of
    // hearsay. This was 185 -- "sources give 175-190, the middle is the
    // honest pick" -- which is what you write when you have not found the
    // factory number. maximavelocidad.com.ar and todofalcon both carry the
    // official 180, with a measured 179,566.
    topKph: 180,
    zeroTo100: 10.8,
    nm: 300,
    rarity: "uncommon",
    blurb: "Sedán deportivo",
    colors: ["blue", "orange"],
    photo: "ford-falcon-sprint-73",
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
    colors: ["blue", "orange", "red"],
    logo: "/fiat-a-logo.png",
  },
  {
    id: "dodge-1500-gt90",
    make: "Dodge",
    model: "1500 GT90",
    year: 1975,
    kW: 66, // 1498 cm³ I4, 90 CV -- the car sold here on Fittipaldi's name
    kg: 925,
    layout: "FWD",
    cls: "sports",
    // 156,569 measured by Corsa, road test November 1973. Was 160.
    topKph: 157,
    zeroTo100: 13.6,
    nm: 115,
    rarity: "common",
    blurb: "Compacto",
    colors: ["light-blue", "yellow"],
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
   *
   * cls is "sports" at Siro's call: the 2300 GT is a coupé and it was sitting
   * in the saloon grip bucket. It costs something and the cost is named here.
   * The car leaves D for C, so D is down to the R12 and the F-100, and the
   * Taunus lands at the bottom of C just under the Falcon Sprint. Only grip
   * moves (0.96 -> 1.06); CdA is derived from the measured top speed, so the
   * class table never touches it.
   */
  {
    id: "ford-taunus-gt",
    make: "Ford",
    model: "Taunus 2300GT",
    year: 1974,
    kW: 90, // 2.3 I4 OHC, 122 CV SAE at 5.000 rpm
    kg: 1100, // 1.103 kg with a full tank, per the factory sheet
    layout: "FR",
    cls: "sports",
    topKph: 174, // 173,73 measured
    zeroTo100: 12.0,
    nm: 192, // 19,6 kgm at 3.500 rpm
    rarity: "common",
    blurb: "Coupé",
    colors: ["red"],
    photo: "ford-taunus-2300gt",
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
    kW: 76, // 1995 cm³ I4, 104 CV
    kg: 1050,
    layout: "FWD",
    cls: "saloon",
    topKph: 185, // ultimatespecs, 18 2.0 TX/GTX. Was 175.
    zeroTo100: 11.6,
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
    kW: 115, // 4093 cm³ I6, 155 CV -- automobile-catalog's Chevy SS Coupé
    kg: 1230,
    layout: "FR",
    cls: "muscle",
    topKph: 185,
    zeroTo100: 10.5, // automobile-catalog, Chevy SS Coupé 1972
    nm: 300,
    rarity: "uncommon",
    blurb: "Coupé",
  },
  {
    id: "renault-fuego-gta",
    make: "Renault",
    model: "Fuego GTA Max",
    year: 1990,
    kW: 90, // 2.2 I4, 123 CV at 6000 -- the Berta-developed GTA Max
    kg: 1130,
    layout: "FWD",
    cls: "sports",
    topKph: 198, // Was 190. Renault Argentina and testdelayer both give 198.
    nm: 180,
    rarity: "uncommon",
    blurb: "Coupé",
    colors: ["black", "dark-blue", "red", "white"],
    photo: "renault-fuego-gta-max",
    logo: "/renault-logo.png",
  },
  {
    id: "ford-sierra-xr4",
    make: "Ford",
    model: "Sierra XR4",
    year: 1990,
    // The Argentine 2.3 with the Weber 32/36, ~120 CV -- not the European
    // 2.8i XR4i. ultimatespecs lists the Argentine car at 1155 kg.
    kW: 88,
    kg: 1155,
    layout: "FR",
    cls: "sports",
    topKph: 190, // Was 195.
    zeroTo100: 10.3,
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
    /*
     * The Argentine GTI, off testdelayer's own road test: 1984 cm³ 8v, 125 CV
     * at 5700, 970 kg, and 173,300 km/h as the average of its two best runs.
     *
     * This was entered as "2.0 16v, 145 CV" at 200 km/h, which is a car that
     * did not exist here -- 145 CV is the European 16v. The measured top speed
     * is the one to use rather than a factory claim: it is what the car did,
     * and it is what cdaFromTopSpeed is solving drag against.
     */
    kW: 92,
    kg: 970,
    layout: "FWD",
    cls: "sports",
    topKph: 173,
    zeroTo100: 10.4,
    nm: 172,
    rarity: "uncommon",
    blurb: "Compacto deportivo",
  },
  {
    id: "renault-torino-380w",
    make: "Renault",
    model: "Torino 380W",
    year: 1970,
    // 3770 cm³ Tornado I6, 176 HP at 5000 rpm, per es.wikipedia Torino 380 W.
    // The mass was 1290 and the real kerb figure is 1497 -- 207 kg is not a
    // rounding difference, it is a sixth of the car, and it was making a big
    // heavy coupé corner like a light one.
    kW: 129,
    kg: 1497,
    layout: "FR",
    cls: "muscle",
    // 199,390 measured. Was 190.
    topKph: 199,
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
    // 197,9 measured by automobile-catalog; 0-100 in 7,7. Was 206/7.8 -- the
    // 206 is the figure Peugeot quoted for the later 1.9 with the catalysed
    // 122 CV engine, not this one.
    topKph: 198,
    zeroTo100: 7.7,
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
    rarity: "exclusive",
    blurb: "Coupé de carrera",
    colors: ["black", "red", "white", "yellow"],
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
    rarity: "exclusive",
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
    rarity: "vrare",
    blurb: "Deportivo",
    colors: ["black", "bordo", "red", "white", "yellow"],
    photo: "porsche-911-carrera-32-87",
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
    // 255 and 6,1 for the European NA1, per automobile-catalog and
    // encycarpedia. Was 270/5.7, which is the figure the motoring press
    // repeated for the later 3.2 rather than the 3.0 this car is.
    topKph: 255,
    zeroTo100: 6.1,
    nm: 285,
    rarity: "exclusive",
    blurb: "Superdeportivo",
    logo: "/honda-logo.png",
    colors: ["black", "red", "white"],
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
    topKph: 248, // fastestlaps / carfolio. Was 250.
    zeroTo100: 4.9,
    nm: 363,
    rarity: "vrare",
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
    rarity: "unique",
    blurb: "Superdeportivo",
    colors: ["black", "red", "yellow"],
    logo: "/ferrari-logo.png",
  },
  /*
   * One 607, the facelift. Both phases used to be here for the variety, but
   * they were 4 hp and 20 kg apart and rated within a point of each other, so
   * the pair bought two rows on the forecourt and no decision for the player.
   * The photos settled it: the render is the phase 2 body -- wide chrome
   * grille, restyled lights -- and a card cannot say 2000 over that nose.
   *
   * The id keeps its -f2 because it is save data. A player who bought this car
   * has `peugeot-607-v6-f2` in their garage, and renaming it now would empty
   * that garage to make an internal string prettier. `model` is what anyone
   * reads, and it is plain "607 V6" now that there is nothing to tell it from.
   */
  {
    id: "peugeot-607-v6-f2",
    make: "Peugeot",
    model: "607 V6",
    year: 2005,
    kW: 157, // ES9A 3.0 V6, 211 hp -- the facelift
    kg: 1600,
    layout: "FWD",
    cls: "saloon",
    topKph: 237,
    zeroTo100: 8.3,
    nm: 285,
    rarity: "rare",
    blurb: "Sedán ejecutivo",
    colors: ["black", "bordo", "gray", "white"],
    photo: "peugeot-607-v6-phase2",
    logo: "/peugeot-logo.png",
  },

  /*
   * -------------------------------------------------------------------------
   * The bottom of the ladder, and the top of it.
   *
   * The catalogue had a shape problem rather than a size one: fourteen of
   * twenty-five cars were `sports`, class D held exactly TWO cars, and nothing
   * rated S or X at all. So the first race a new player enters -- in the R12
   * they start with -- was a grid of two models, and the ladder they were
   * climbing had no top.
   *
   * None of these has photos yet. `imageFor` falls back to `spec.image`, which
   * is absent, so the card draws its empty frame rather than a broken one, and
   * cars.test.ts stays green because a car that names no file cannot name a
   * missing one. They are real cars with real numbers in the meantime.
   * -------------------------------------------------------------------------
   */

  /**
   * The Fitito. 250.000 built here between 1970 and 1977, a national record.
   *
   * The first `economy` car in the catalogue -- the segment existed in the
   * contract and in the filter list and nothing had ever used it. Worth knowing
   * what that means for where it sells: no house takes `economy` by segment, so
   * this is on Don Beto's floor and nowhere else, which is exactly right for a
   * Fitito and would NOT be right for an expensive one. An `economy` car above
   * uncommon would be Marketplace-only.
   */
  {
    id: "fiat-600r",
    make: "Fiat",
    model: "600 R",
    year: 1972,
    kW: 26.5, // 797 cm³, 36 HP SAE at 4800 rpm
    /*
     * The one figure here I could not source. Every Argentine spec sheet gives
     * displacement, power and top speed and none gives a kerb mass; 620 kg is
     * the Italian 600D's 585 kg plus what the local car carried, and it is a
     * guess wearing an honest number's clothes. If a real figure turns up, it
     * belongs here.
     */
    kg: 620,
    layout: "RR",
    cls: "economy",
    topKph: 120,
    nm: 59, // 6 mKg at 2800 rpm
    rarity: "common",
    blurb: "Fitito",
    logo: "/fiat-logo.png",
  },

  /**
   * Built here by Safrar from 1965. The taxi, the family car, the everything.
   *
   * The XC7 of the last series (1970-1975), which is the one most people mean:
   * 1618 cm³, 73 bhp. The earlier XC6 made 80 and was gone by 1968.
   */
  {
    id: "peugeot-404",
    make: "Peugeot",
    model: "404",
    year: 1970,
    kW: 54, // XC7 1618 cm³, 73 bhp at 5600 rpm
    kg: 1100,
    layout: "FR",
    cls: "saloon",
    topKph: 148,
    nm: 127,
    rarity: "common",
    blurb: "Sedán",
    logo: "/peugeot-logo.png",
  },

  /**
   * The other pickup, so the F-100 stops being a segment of one.
   *
   * Sevel built it in Córdoba from late 1985 to 1991 with the Chevy 250 six --
   * the same 4093 cm³ engine the Chevy 250 saloon in this catalogue runs, at
   * 130 hp here.
   *
   * NO topKph, and that is deliberate rather than lazy. The figures I could
   * find put it around 140 km/h, and 96 kW that only reaches 140 derives a drag
   * area of 2.09 m² -- outside the 0.4-1.4 the importer accepts, because the
   * two numbers genuinely disagree. One of them is wrong and I do not know
   * which, so the car goes in with the class estimate and says `rough` rather
   * than carrying a figure that makes the physics lie.
   */
  {
    id: "chevrolet-c10",
    make: "Chevrolet",
    model: "C-10",
    year: 1987,
    kW: 96, // Chevy 250 CID (4093 cm³), 130 hp
    kg: 1650,
    layout: "FR",
    cls: "truck",
    nm: 300,
    rarity: "uncommon",
    blurb: "Pickup",
  },

  /**
   * 337 road cars. The one that made an F40 look old-fashioned and lost.
   *
   * Rear-engined and four-wheel drive, which is a layout nothing else in the
   * catalogue has in that combination -- the sim reads RR for where the mass
   * sits, and AWD is the closer answer for what it does out of a corner.
   * Modelled as AWD because traction is the thing the 959 is famous for.
   */
  {
    id: "porsche-959",
    make: "Porsche",
    model: "959",
    year: 1987,
    kW: 331, // 450 PS at 6500 rpm
    kg: 1450,
    layout: "AWD",
    cls: "supercar",
    topKph: 317,
    zeroTo100: 3.7,
    nm: 500,
    rarity: "exclusive",
    blurb: "Superdeportivo",
  },

  /**
   * The top of the ladder, and the reason class S was empty until now.
   *
   * Two numbers here needed care. The 0-100 is McLaren's own 3.2 s: published
   * figures run 3.2 to 3.4 and one estimate says 2.9, and the factory number is
   * the honest pick rather than the middle of a range of hearsay -- the same
   * rule the Falcon's top speed follows. Note that the 3.2 s everyone quotes
   * for 0-60 MPH is a different measurement that happens to land on the same
   * number; this field is 0-100 km/h.
   *
   * The top speed is 372 km/h, McLaren's claim for the car as delivered. NOT
   * the 386.4 km/h record: that was XP5 with the rev limiter raised, and the
   * catalogue's rule at the top of this file is to use the unrestricted figure
   * for the car you can buy. As it leaves the factory the limiter stops it at
   * about 356.
   */
  {
    id: "mclaren-f1",
    make: "McLaren",
    model: "F1",
    year: 1994,
    kW: 461, // BMW S70/2 6064 cm³ V12, 627 PS
    kg: 1260, // kerb; 1140 dry
    layout: "MR",
    cls: "supercar",
    topKph: 372,
    zeroTo100: 3.2,
    nm: 650,
    rarity: "unique",
    blurb: "Superdeportivo",
  },
];
export function carById(id: string): CarSpec | undefined {
  return CARS.find((c) => c.id === id);
}
