import type { CarSpec } from "@contracts/car";
import { hashSeed, mulberry32 } from "@sim/rng";

/**
 * Colour.
 *
 * A car in this game is a model plus an odometer plus a colour, and the last
 * two are what make two 128 IAVAs different objects. Like km, the colour of a
 * listing is a pure function of the car and a salt, so a forecourt shows the
 * same red Fiat every render and the one you buy stays the colour you bought.
 *
 * The photo is DERIVED from the pair rather than stored per colour in the
 * catalogue: `/bmw-m3-e30-yellow.png`. That is the whole reason the files were
 * renamed to match car ids -- an id plus a colour has to be enough to name the
 * file, or every new colour means another line of catalogue to forget.
 */

/** Spanish for the sheet; the value stays the English slug in the filename. */
const NAMES: Record<string, string> = {
  black: "Negro",
  white: "Blanco",
  red: "Rojo",
  blue: "Azul",
  "light-blue": "Celeste",
  "dark-blue": "Azul oscuro",
  silver: "Gris plata",
  gray: "Gris",
  bordo: "Bordó",
  yellow: "Amarillo",
  orange: "Naranja",
  green: "Verde",
};

export function colorName(color: string): string {
  return NAMES[color] ?? color;
}

/**
 * What the colour looks like, for the swatches in the repaint picker.
 *
 * These are approximations of the renders and they are MEANT to be edited by
 * eye -- a dot 18px across only has to be recognisable next to the others in
 * one car's palette, which is the only place two of them are ever seen
 * together. I sampled them off the photos first and threw the results away:
 * most of a car in a studio shot is its own shadow, so the honest average of
 * Ferrari red is a dusty rose, and the honest average of black is mid grey.
 *
 * Note "light-blue" is a teal here rather than a sky blue, because the F-100
 * and the R12 that wear it are teal. The swatch follows the cars.
 */
const SWATCH: Record<string, string> = {
  black: "#1c1e20",
  white: "#e8eaec",
  red: "#c0392b",
  blue: "#24397a",
  "light-blue": "#3f8fa0",
  "dark-blue": "#16224a",
  silver: "#b6b8ba",
  gray: "#6f747a",
  yellow: "#e3b81c",
  orange: "#d2652f",
  green: "#2f7d4f",
  bordo: "#6b2027",
};

/** Falls back to a mid grey: an unknown colour gets a dot, never an empty hole. */
export function colorSwatch(color: string): string {
  return SWATCH[color] ?? "#6f747a";
}

/** Every colour the swatch table knows. The gate test walks this against the catalogue. */
export const SWATCHED = Object.keys(SWATCH);

/** The colours a car can be had in, or none if it only has the one photo. */
export function colorsOf(spec: CarSpec): string[] {
  return spec.colors ?? [];
}

/**
 * Which one this listing is. Salted the same way the odometer is, so the two
 * agree about what car this is: one draw, one car, one photo.
 */
export function colorFor(spec: CarSpec, salt: string): string | undefined {
  const colors = colorsOf(spec);
  if (colors.length === 0) return undefined;
  const rng = mulberry32(hashSeed(`${spec.id}|color|${salt}`));
  return colors[Math.floor(rng() * colors.length)];
}

/** The filename stem: the id unless the car declares otherwise. */
export function photoStem(spec: CarSpec): string {
  return spec.photo ?? spec.id;
}

/**
 * The photo for this exact car. Falls back to the car's single `image` when it
 * has no colours, and to `image` again if a colour somehow has no file -- a
 * missing photo should be a car without a picture, never a broken one.
 */
export function imageFor(spec: CarSpec, color?: string): string | undefined {
  if (color && colorsOf(spec).includes(color)) return `/${photoStem(spec)}-${color}.png`;
  return spec.image;
}
