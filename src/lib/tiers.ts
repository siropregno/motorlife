import type { PartLevel } from "@contracts/mods";
import type { ClassLetter } from "@sim/rating";

/**
 * Class letters borrow the rarity ladder, so D reads grey and X reads red the
 * same way a common card reads grey and an apex card reads red. Rarity and
 * class are different questions -- how rare, how fast -- but they are both
 * tiers, and one visual language for both is one thing to learn instead of
 * two.
 *
 * Nothing paints rarity any more. It sets price and how often a car turns up
 * in the dealership; the colour on screen always answers "how fast".
 */
export const CLASS_TIER: Record<ClassLetter, string> = {
  D: "common",
  C: "uncommon",
  B: "rare",
  A: "epic",
  S: "legendary",
  X: "apex",
};

export function classTierClass(letter: ClassLetter): string {
  return CLASS_TIER[letter] ?? "common";
}

/**
 * The PART ladder's class names, which are not the class ladder's.
 *
 * Here rather than in Workshop.tsx because the car sheet reads the same four
 * colours off the same four levels: the workshop is where you fit a part and
 * the sheet is where you check what is fitted, and the two disagreeing about
 * what pink means would make the colour worth nothing. The hexes they resolve
 * to are --part-* in tokens.css.
 */
export const PART_TIER: Record<PartLevel, string> = {
  0: "stock",
  1: "street",
  2: "sport",
  3: "racing",
};
