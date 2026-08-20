import type { ClassLetter } from "@sim/rating";

/**
 * Class letters borrow the rarity ladder, so D reads grey and X reads red the
 * same way a common card reads grey and an apex card reads red. Rarity and
 * class are different questions -- how rare, how fast -- but they are both
 * tiers, and one visual language for both is one thing to learn instead of
 * two. They stay distinguishable by form: rarity is the bar, class is the
 * letter.
 */
export const CLASS_TONE: Record<ClassLetter, string> = {
  D: "tone-common",
  C: "tone-uncommon",
  B: "tone-rare",
  A: "tone-epic",
  S: "tone-legendary",
  X: "tone-apex",
};

export function classToneClass(letter: ClassLetter): string {
  return CLASS_TONE[letter] ?? "tone-common";
}
