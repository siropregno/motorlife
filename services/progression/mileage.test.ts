import { describe, it, expect } from "vitest";
import type { CarSpec } from "@contracts/car";
import { CARS, carById } from "@catalog/cars";
import {
  KM_TAU,
  FLOOR_KM,
  KM_PER_YEAR,
  NOW_YEAR,
  ZERO_KM_FROM,
  conditionOf,
  expectedKm,
  formatKm,
  kmFor,
  mulFor,
  priceWithKm,
} from "./mileage";

const modern = (year: number): CarSpec => ({
  ...(carById("bmw-m5-e60") as CarSpec),
  id: `test-${year}`,
  year,
});

describe("what a year implies", () => {
  it("starts at nothing and only ever climbs", () => {
    expect(expectedKm(NOW_YEAR)).toBe(0);
    let last = -1;
    for (let age = 0; age <= 60; age++) {
      const km = expectedKm(NOW_YEAR - age);
      expect(km).toBeGreaterThanOrEqual(last);
      last = km;
    }
  });

  it("runs at about the annual rate while the car is young", () => {
    // the first year is nearly the full rate; the decay has not bitten yet
    expect(expectedKm(NOW_YEAR - 1)).toBeGreaterThan(KM_PER_YEAR * 0.9);
    expect(expectedKm(NOW_YEAR - 1)).toBeLessThanOrEqual(KM_PER_YEAR);
  });

  /**
   * The whole reason this is a curve and not a multiplication. Flat, a '72
   * expected 594.000 km and the generator was putting 985.800 on the screen.
   * Cars do 14.000 a year while they are somebody's only car, not for fifty
   * years, which is how a fifty-year-old car is still on the road at all.
   */
  it("saturates instead of running to a million", () => {
    expect(expectedKm(NOW_YEAR - 50)).toBeLessThan(200_000);
    expect(expectedKm(1900)).toBeLessThan(KM_PER_YEAR * KM_TAU + 1);
    // and an old car is worth far less than the flat model claimed
    expect(expectedKm(NOW_YEAR - 50)).toBeLessThan(50 * KM_PER_YEAR * 0.3);
  });

  /** The reference points Siro brought, as assertions. */
  it("agrees with the rules of thumb", () => {
    const at = (age: number, km: number) =>
      conditionOf({ ...(carById("renault-12-tl") as CarSpec), year: NOW_YEAR - age }, km);
    expect(at(5, 90_000).band).toBe("high"); // 5 years, 90.000 = uso intenso
    expect(at(5, 75_000).band).toBe("normal"); // 15.000 a year = ordinary
    expect(at(5, 25_000).band).toBe("low"); // under 5.000 a year = sat around
    expect(at(30, 200_000).band).toBe("normal"); // 200k on something old
    expect(at(30, 500_000).band).toBe("high");
  });

  it("does not run the clock backwards for a car from the future", () => {
    expect(expectedKm(NOW_YEAR + 3)).toBe(0);
  });
});

describe("the odometer on a listing", () => {
  it("is the same number every time it is asked", () => {
    for (const c of CARS.slice(0, 8)) {
      expect(kmFor(c, "donbeto")).toBe(kmFor(c, "donbeto"));
    }
  });

  it("reads differently on two forecourts", () => {
    const differ = CARS.filter((c) => kmFor(c, "donbeto") !== kmFor(c, "usados-3"));
    expect(differ.length).toBeGreaterThan(CARS.length / 2);
  });

  /** The rule Siro asked for, and the whole reason this module exists. */
  it("never puts 0 km on a car built before 2020", () => {
    for (const c of CARS) {
      for (const salt of ["a", "b", "c", "donbeto", "usados-1", "usados-2"]) {
        expect(c.year).toBeLessThan(ZERO_KM_FROM); // the catalogue today
        expect(kmFor(c, salt), `${c.id} @ ${salt}`).toBeGreaterThanOrEqual(FLOOR_KM);
      }
    }
  });

  it("does allow 0 km once a car is new enough", () => {
    const zeroes = Array.from({ length: 40 }, (_, i) => kmFor(modern(2024), `s${i}`)).filter(
      (km) => km === 0,
    );
    expect(zeroes.length).toBeGreaterThan(5);
    // and one year under the line, never
    const old = Array.from({ length: 40 }, (_, i) => kmFor(modern(ZERO_KM_FROM - 1), `s${i}`));
    expect(old.every((km) => km >= FLOOR_KM)).toBe(true);
  });

  it("puts a plausible number on an old car most of the time", () => {
    const r12 = carById("renault-12-tl")!;
    const expected = expectedKm(r12.year);
    const draws = Array.from({ length: 60 }, (_, i) => kmFor(r12, `s${i}`));
    const normal = draws.filter((km) => km > expected * 0.4);
    expect(normal.length).toBeGreaterThan(draws.length * 0.7);
  });

  it("turns up a shed-kept 90s car with about a thousand on it", () => {
    // the case Siro described: a 90s car at ~1000 km, and it must be findable
    const fuego = carById("renault-fuego-gta")!;
    const draws = Array.from({ length: 200 }, (_, i) => kmFor(fuego, `s${i}`));
    const survivors = draws.filter((km) => conditionOf(fuego, km).band === "survivor");
    expect(survivors.length).toBeGreaterThan(4);
    expect(Math.min(...survivors)).toBeLessThan(6_000);
  });
});

describe("condition", () => {
  it("reads an old car with few kilometres as a collector's car", () => {
    const fuego = carById("renault-fuego-gta")!;
    expect(conditionOf(fuego, 1_600).band).toBe("survivor");
    expect(conditionOf(fuego, 1_600).label).toBe("De colección");
    // 20.000 on a '90 is 550 a year: kept, not driven
    expect(conditionOf(fuego, 20_000).band).toBe("survivor");
    expect(conditionOf(fuego, 150_000).band).toBe("normal");
    // a '90 expects about 171.000, so 400.000 is a car that worked for a living
    expect(conditionOf(fuego, 400_000).band).toBe("high");
  });

  /**
   * Low kilometres are worth money at any age, but only an old car is a
   * COLLECTOR's car. Without the age gate a nearly-new car would wear the
   * badge for the crime of being nearly new.
   */
  it("does not call a nearly-new car a collector's car", () => {
    const young = modern(NOW_YEAR - 3);
    const cond = conditionOf(young, 8_000);
    expect(cond.band).toBe("low");
    expect(cond.label).toBe("Poco uso");
    // ...but it is still worth more than the same car with ordinary use
    expect(cond.mul).toBeGreaterThan(conditionOf(young, expectedKm(young.year)).mul);
  });

  it("reads the SAME kilometres differently depending on the year", () => {
    // 30.000 km is nothing on a '71 and a normal life on a car from 2023
    const r12 = carById("renault-12-tl")!;
    expect(conditionOf(r12, 30_000).band).toBe("survivor");
    expect(conditionOf(modern(2023), 30_000).band).toBe("normal");
  });

  it("calls a genuinely new car 0 km", () => {
    expect(conditionOf(modern(2024), 0).band).toBe("cero");
    expect(conditionOf(modern(2024), 0).label).toBe("0 km");
  });
});

describe("what condition does to price", () => {
  it("never pays more for more kilometres", () => {
    let last = Infinity;
    for (let r = 0; r <= 4; r += 0.02) {
      const mul = mulFor(r);
      expect(mul).toBeLessThanOrEqual(last + 1e-9);
      last = mul;
    }
  });

  it("pays a premium for a survivor and a discount for a hack", () => {
    const fuego = carById("renault-fuego-gta")!;
    const base = 100_000;
    expect(priceWithKm(base, fuego, 1_600)).toBeGreaterThan(base * 1.3);
    expect(priceWithKm(base, fuego, expectedKm(fuego.year))).toBeCloseTo(base, -3);
    expect(priceWithKm(base, fuego, expectedKm(fuego.year) * 3)).toBeLessThan(base * 0.8);
  });

  it("stays inside the anchors however silly the odometer", () => {
    const c = carById("ferrari-f40")!;
    for (const km of [0, 1, 500, 50_000, 5_000_000]) {
      const mul = conditionOf(c, km).mul;
      expect(mul).toBeLessThanOrEqual(1.6);
      expect(mul).toBeGreaterThanOrEqual(0.72);
    }
  });
});

describe("formatting", () => {
  it("writes kilometres the way the rest of the game writes numbers", () => {
    expect(formatKm(0)).toBe("0 km");
    expect(formatKm(1_600)).toBe("1.600 km");
    expect(formatKm(412_000)).toBe("412.000 km");
  });
});
