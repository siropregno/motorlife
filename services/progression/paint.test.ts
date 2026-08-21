import { describe, it, expect } from "vitest";
import { CARS, carById } from "@catalog/cars";
import { colorFor, colorName, colorsOf, imageFor, photoStem } from "./paint";

const m3 = carById("bmw-m3-e30")!;
const f40 = carById("ferrari-f40")!;
/**
 * A car with NO photo at all. Every photographed car has paint now, so this
 * is the only real example of the other branch left in the catalogue.
 */
const plain = carById("chevrolet-chevy-250")!;

/** A one-photo car, built rather than found: none are left to point at. */
const single = { ...plain, id: "test-single", image: "/test-single.png" };

describe("which colours a car comes in", () => {
  it("reads them off the catalogue, and is empty for a one-colour car", () => {
    expect(colorsOf(m3)).toEqual(["black", "red", "white", "yellow"]);
    expect(colorsOf(f40)).toEqual(["black", "red", "yellow"]);
    expect(colorsOf(plain)).toEqual([]);
    expect(colorsOf(single)).toEqual([]);
  });

  it("names them in Spanish, and falls back to the slug", () => {
    expect(colorName("light-blue")).toBe("Celeste");
    expect(colorName("dark-blue")).toBe("Azul oscuro");
    expect(colorName("bordo")).toBe("Bordó");
    expect(colorName("yellow")).toBe("Amarillo");
    expect(colorName("chartreuse")).toBe("chartreuse");
  });

  /*
   * The fallback above is a safety net, not a licence. A colour with no entry
   * in NAMES renders its English slug on the card -- "bordo" next to "Negro"
   * and "Blanco" -- and nothing else in the codebase notices, because a slug
   * IS a valid string. So the catalogue is the test: every colour any car
   * declares has to have been translated.
   */
  it("has a Spanish name for every colour the catalogue actually uses", () => {
    const used = [...new Set(CARS.flatMap((c) => colorsOf(c)))].sort();
    const untranslated = used.filter((k) => colorName(k) === k);
    expect(untranslated, `add these to NAMES in paint.ts`).toEqual([]);
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
    expect(colorFor(plain, "donbeto")).toBeUndefined();
  });

  it("differs between forecourts, so the same car is two cars", () => {
    const differ = ["a", "b", "c", "d", "e", "f"].map((s) => colorFor(m3, s));
    expect(new Set(differ).size).toBeGreaterThan(1);
  });
});

describe("the photo for a car", () => {
  it("is derived from the stem and the colour", () => {
    expect(imageFor(m3, "yellow")).toBe("/bmw-m3-e30-yellow.png");
    // stem != id: the renders came named after the car, not the id
    expect(photoStem(carById("renault-fuego-gta")!)).toBe("renault-fuego-gta-max");
    expect(imageFor(carById("renault-fuego-gta")!, "dark-blue")).toBe(
      "/renault-fuego-gta-max-dark-blue.png",
    );
    expect(imageFor(carById("ford-taunus-gt")!, "red")).toBe("/ford-taunus-2300gt-red.png");
    expect(photoStem(m3)).toBe(m3.id);
    expect(imageFor(carById("renault-12-tl")!, "light-blue")).toBe(
      "/renault-12-tl-light-blue.png",
    );
  });

  it("falls back to the single image rather than to a broken path", () => {
    // a colour the car does not come in must not produce a 404
    expect(imageFor(m3, "chartreuse")).toBe(m3.image);
    // a one-photo car ignores any colour it is handed
    expect(imageFor(single, "red")).toBe("/test-single.png");
    expect(imageFor(single, undefined)).toBe("/test-single.png");
    // and a car with no photo at all gets nothing, not a guessed path
    expect(imageFor(plain, "red")).toBeUndefined();
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
