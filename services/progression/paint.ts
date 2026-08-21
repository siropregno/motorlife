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
  yellow: "Amarillo",
  orange: "Naranja",
  green: "Verde",
};

export function colorName(color: string): string {
  return NAMES[color] ?? color;
}

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
