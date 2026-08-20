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
