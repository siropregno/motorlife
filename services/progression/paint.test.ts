import { describe, it, expect } from "vitest";
import { CARS, carById } from "@catalog/cars";
import { colorFor, colorName, colorsOf, imageFor } from "./paint";

const m3 = carById("bmw-m3-e30")!;
const f40 = carById("ferrari-f40")!;

describe("which colours a car comes in", () => {
  it("reads them off the catalogue, and is empty for a one-colour car", () => {
    expect(colorsOf(m3)).toEqual(["black", "red", "white", "yellow"]);
    expect(colorsOf(f40)).toEqual([]);
  });

  it("names them in Spanish, and falls back to the slug", () => {
    expect(colorName("light-blue")).toBe("Celeste");
    expect(colorName("yellow")).toBe("Amarillo");
    expect(colorName("chartreuse")).toBe("chartreuse");
  });
});

describe("the colour of a listing", () => {
  it("is the same every time it is asked", () => {
    for (const salt of ["donbeto", "usados-3", "garage"]) {
      expect(colorFor(m3, salt)).toBe(colorFor(m3, salt));
    }
  });

  it("is always one the car actually comes in", () => {
    for (let i = 0; i < 200; i++) {
      const c = colorFor(m3, `s${i}`)!;
      expect(colorsOf(m3)).toContain(c);
    }
  });

  it("uses all of them across enough draws", () => {
    const seen = new Set(Array.from({ length: 200 }, (_, i) => colorFor(m3, `s${i}`)));
    expect(seen.size).toBe(colorsOf(m3).length);
  });

  it("is nothing at all for a car that comes in one colour", () => {
    expect(colorFor(f40, "donbeto")).toBeUndefined();
  });

  it("differs between forecourts, so the same car is two cars", () => {
    const differ = ["a", "b", "c", "d", "e", "f"].map((s) => colorFor(m3, s));
    expect(new Set(differ).size).toBeGreaterThan(1);
  });
});

describe("the photo for a car", () => {
  it("is derived from the id and the colour", () => {
    expect(imageFor(m3, "yellow")).toBe("/bmw-m3-e30-yellow.png");
    expect(imageFor(carById("renault-12-tl")!, "light-blue")).toBe(
      "/renault-12-tl-light-blue.png",
    );
  });

  it("falls back to the single image rather than to a broken path", () => {
    // a colour the car does not come in must not produce a 404
    expect(imageFor(m3, "chartreuse")).toBe(m3.image);
    expect(imageFor(f40, "red")).toBe(f40.image);
    expect(imageFor(f40, undefined)).toBe(f40.image);
  });

  it("gives every car in the catalogue a photo or nothing, never a guess", () => {
    for (const car of CARS) {
      const img = imageFor(car, colorFor(car, "donbeto"));
      if (img === undefined) {
        expect(car.image).toBeUndefined();
        expect(colorsOf(car)).toEqual([]);
      } else {
        expect(img.startsWith("/")).toBe(true);
      }
    }
  });
});
