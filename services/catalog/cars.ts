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
   * Four more from here, chosen for the theme first.
   *
   * A first pass at this added a Fiat 600R, a Chevrolet C-10, a Porsche 959 and
   * a McLaren F1, picked to fill holes in the class ladder. Siro threw three of
   * them out and he was right: the game is Argentine production cars with a
   * handful of imports at the top, and a 959 and an F1 are a different game
   * wearing this one's clothes. A hole in the ladder is a worse reason to add a
   * car than the car being the wrong car.
   *
   * These four are all sourced from measured road tests where one exists --
   * Test del Ayer reprints the original Corsa and Parabrisas timings, which
   * beats a factory claim because a stopwatch cannot round in its own favour.
   * A measured 0-100 is also the field that calibrates the sim exactly.
   *
   * None has photos yet, which is a state the catalogue already supported: the
   * Chevy 250, the 18 GTX, the Gol GTI and the Sierra XR4 have none either.
   * -------------------------------------------------------------------------
   */

  /**
   * Built here by Safrar from 1965: the taxi, the family car, the everything.
   *
   * The XC7 of the last series (1970-1975), which is the one most people mean.
   * The earlier XC6 made 80 bhp and was gone by 1968.
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
   * The other Falcon, and deliberately a NAMED one rather than "a Falcon 3.0".
   *
   * Corsa No. 228, September 1970, after about 20.000 km: 167,200 km/h as the
   * average of two runs in opposite directions, and 13,0 s to 100. Both
   * measured, so the car calibrates itself and the fitted scalar lands at 0.78
   * -- low, for the same reason the Taunus sits at 0.75: 132 HP is an SAE gross
   * figure and the crankshaft never saw all of it.
   *
   * The power is quoted SAE on purpose, because the Sprint above is: es.wikipedia
   * gives the 221 SP as "140 CV DIN / 166 HP SAE (124,5 kW)" and this catalogue
   * took the SAE side. Two Falcons measured by two different standards would
   * make this one look weak next to a car it is genuinely slower than, which is
   * a lie told by units rather than by numbers.
   *
   * The kerb weight is the one figure the test does not give. es.wikipedia puts
   * the Argentine Falcon sedan at 1.230-1.406 kg and this is the middle of it;
   * the choice barely matters here, because the measured 0-100 pins the car
   * either way -- the whole range rates D522 to D525.
   */
  {
    id: "ford-falcon-futura",
    make: "Ford",
    model: "Falcon Futura",
    year: 1970,
    kW: 98, // 221 cid (3.620 cm³) I6, 132 HP SAE at 4.000 rpm
    kg: 1330,
    layout: "FR",
    cls: "saloon",
    topKph: 167, // 167,200 measured
    zeroTo100: 13.0,
    rarity: "common",
    blurb: "Sedán",
    logo: "/ford-logo.png",
  },

  /**
   * The plain 128, next to the IAVA that is already here.
   *
   * The Super Europa arrived in 1983 with two engines, and the 1.3 was the one
   * Corsa called "ya conocida" -- unchanged from the Europa, 60 CV at 6.000
   * rpm. So the performance figures are Test del Ayer's measurements of the
   * Europa 1300 (142,701 km/h averaged over two passes, 15,5 s to 100), which
   * is the same engine in the same body. Said out loud rather than quietly
   * borrowed: there is no road test of a Super Europa 1.3.
   *
   * The weight is arithmetic off the same source. Corsa gives the Super Europa
   * 1.500 a power-to-weight of 10,3 kg per CV at 82 CV, which is 845 kg, and
   * the 1.3 is that car with a smaller engine in it.
   */
  {
    id: "fiat-128-super-europa",
    make: "Fiat",
    model: "128 Super Europa",
    year: 1983,
    kW: 44, // 1.290 cm³, 60 CV DIN at 6.000 rpm
    kg: 845,
    layout: "FWD",
    cls: "saloon",
    topKph: 143, // 142,701 measured, Europa 1300
    zeroTo100: 15.5,
    rarity: "common",
    blurb: "Compacto",
    logo: "/fiat-a-logo.png",
  },

  /**
   * The hot 147, and the quickest thing Fiat sold here in the early 80s.
   *
   * Everything on this one is measured or published in the same road test:
   * 1.301 cm³, 90 CV DIN at 6.200 rpm, 10,8 kgm, 820 kg in running order,
   * 158,7 km/h and 9,49 s to 100. That is the full set, which is why it is the
   * best-calibrated Argentine car in the catalogue.
   */
  {
    id: "fiat-147-sorpasso",
    make: "Fiat",
    model: "147 Sorpasso",
    year: 1982,
    kW: 66, // 1.301 cm³, 90 CV DIN at 6.200 rpm
    kg: 820,
    layout: "FWD",
    cls: "sports",
    topKph: 159, // 158,7 measured
    zeroTo100: 9.5, // 9,49 measured
    nm: 106, // 10,8 kgm
    rarity: "uncommon",
    blurb: "Compacto deportivo",
    logo: "/fiat-a-logo.png",
  },

  /*
   * -------------------------------------------------------------------------
   * The modern imports, off a real forecourt.
   *
   * Siro sent four listings from Rangugni Auto in Pilar, which is an actual
   * high-end Argentine dealer, and these are three of the cars on it. That is a
   * better sourcing rule than my taste: what a real luxury house here has in
   * the window IS the answer to "which imports belong in this game".
   *
   * They also fill class A, which had two cars in it -- the M5 and the F40 --
   * and a class with two cars is barely a class.
   *
   * The site blocks automated fetches (403 on every page, and the listings are
   * not in the search index either), so nothing here comes FROM Rangugni: the
   * URLs named the cars and the figures are sourced the usual way. Prices in
   * this game are derived from rarity and class index anyway, never from what
   * a dealer is asking.
   * -------------------------------------------------------------------------
   */

  /**
   * AWD rather than MR, for a car that is both.
   *
   * The Layout enum cannot say "mid-engined and four-wheel drive", so it has to
   * pick which half the physics cares about -- and what the sim reads `layout`
   * for is which wheels are driven and where load goes under power. This is a
   * quattro; modelling it as rear-drive would understate traction out of a
   * corner and then force the calibration scalar up to 1.09 to hit the measured
   * 0-100 anyway. As AWD it lands at 0.89 and is telling the truth on the way.
   */
  {
    id: "audi-r8-v10",
    make: "Audi",
    model: "R8 V10",
    year: 2010,
    kW: 386, // 5.2 FSI V10, 525 PS
    kg: 1625,
    layout: "AWD",
    cls: "supercar",
    topKph: 316,
    zeroTo100: 3.9, // manual and R tronic alike; the S tronic does 3.6
    nm: 530,
    rarity: "exclusive",
    blurb: "Superdeportivo",
  },

  /**
   * The F80 sedan, and an object lesson in the rule at the top of this file.
   *
   * Its top speed is 280, not the 250 it ships limited to. Both numbers are
   * published and the difference is not cosmetic: at 250 the importer derives a
   * drag area of 1.293 m², nearly the 1.4 ceiling, because the solve assumes
   * the engine ran out of power when in fact the limiter cut in. At the real
   * 280 it is 0.916, which is an M3.
   *
   * The 0-100 is 4.1 s, BMW's figure for the DCT. Careful with the numbers in
   * circulation: the widely quoted 3.9 s is 0-60 MPH, a different measurement
   * that lands near enough to be mistaken for this one. This field is 0-100
   * km/h -- the same trap the McLaren F1 sprang before it was taken out again.
   */
  {
    id: "bmw-m3-f80",
    make: "BMW",
    model: "M3 F80",
    year: 2015,
    kW: 317, // S55 2979 cm³ biturbo, 431 PS
    kg: 1621,
    layout: "FR",
    cls: "saloon",
    topKph: 280, // with the M Driver's Package; 250 delimited
    zeroTo100: 4.1,
    nm: 550,
    rarity: "vrare",
    blurb: "Super Sedán",
    logo: "/bmw-logo.png",
  },

  /**
   * NO topKph, and it is the same rule reaching the opposite conclusion.
   *
   * The only published figure for an M240i is 250 km/h, which is the limiter
   * rather than the car, and the M3 above shows what feeding a limiter to the
   * drag solve does. Unlike the M3 there is no published delimited number to
   * use instead -- there is no M Driver's Package on a 240i.
   *
   * So it goes in without one. The measured 0-100 still calibrates the car
   * exactly; only the drag area falls back to the class estimate, which is a
   * guess honestly labelled rather than a wrong number confidently derived.
   */
  {
    id: "bmw-m240i",
    make: "BMW",
    model: "M240i",
    year: 2017,
    kW: 250, // B58 2998 cm³ turbo, 340 PS
    kg: 1600,
    layout: "FR",
    cls: "sports",
    zeroTo100: 4.8,
    nm: 500,
    rarity: "rare",
    blurb: "Coupé",
    logo: "/bmw-logo.png",
  },
];
export function carById(id: string): CarSpec | undefined {
  return CARS.find((c) => c.id === id);
}
