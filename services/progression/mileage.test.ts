import { describe, it, expect } from "vitest";
import type { CarSpec } from "@contracts/car";
import { CARS, carById } from "@catalog/cars";
import {
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
  it("counts kilometres from the year to now", () => {
    expect(expectedKm(NOW_YEAR)).toBe(0);
    expect(expectedKm(NOW_YEAR - 1)).toBe(KM_PER_YEAR);
    expect(expectedKm(NOW_YEAR - 10)).toBe(10 * KM_PER_YEAR);
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
    // 400.000 on a car from 1990 is NORMAL -- 36 years at 11.000 a year is
    // 396.000. It takes twice that to be a hard-used car.
    expect(conditionOf(fuego, 400_000).band).toBe("normal");
    expect(conditionOf(fuego, 700_000).band).toBe("high");
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
