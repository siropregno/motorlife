/**
 * DEV TOOLS: the two levers that let you look at a screen without playing your
 * way to it.
 *
 * They live here, beside buyCar and sellCar, rather than in the component that
 * draws the buttons, for the reason every other save move does: the rules about
 * what a save may become belong to the save, and a click handler that edited
 * `credits` inline would be the one place in the game where money appears
 * without a function to test.
 *
 * Both are honest about what they are. Neither pretends to be play:
 *
 *   - The refresh rotates the Marketplace WITHOUT touching racesRun, because
 *     racesRun is a stat the player is shown and a payout the race screen
 *     counts. Turning over a shop must not claim you drove.
 *   - The grant adds credits and says nothing about where they came from. There
 *     is no "sold a car" toast to fake, and no stat that would be wrong after.
 *
 * They are not gated behind a build flag. This is a single-player game with a
 * localStorage save that anyone can edit in devtools in ten seconds -- a hidden
 * button is not a defence against cheating, it is only a defence against
 * finding it, and Siro uses these to look at the shop.
 */

import type { Save } from "./save";

/**
 * How much one press of the grant is worth.
 *
 * 50k is chosen against the catalogue rather than as a round number: it buys
 * anything at Don Beto outright, it is most of a decent sports car, and it is
 * well short of the F40. So one press moves you a tier and it takes several to
 * reach the top of the game -- which keeps the button useful for "let me see
 * the sports screen" without it being the fastest way to own everything by
 * accident.
 */
export const DEV_CREDITS = 50_000;

/**
 * Push the Marketplace on by one rotation.
 *
 * `usedLot` is seeded with racesRun + lotNudge, so bumping the nudge draws the
 * next lot in the same deterministic sequence a race would have drawn. That is
 * the point of a counter over a random reseed: the lot after a refresh is a lot
 * you could genuinely have reached by racing, so nothing you see here is a
 * rotation the real game cannot produce.
 *
 * It never returns the save unchanged -- there is no illegal case, a shop can
 * always turn over -- but it still returns a NEW object rather than mutating,
 * because App compares by identity to decide whether a move happened.
 */
export function refreshMarket(save: Save): Save {
  return { ...save, lotNudge: save.lotNudge + 1 };
}

/**
 * Put money in the wallet.
 *
 * The amount is a parameter with a default rather than DEV_CREDITS read inside,
 * so a test can grant an odd number and a future second button ("+1M") is a
 * call site rather than an edit here.
 *
 * A non-finite or non-positive amount returns the save UNCHANGED, the same
 * contract buyCar and sellCar have: this is reachable from a click handler and
 * a refused move should do nothing rather than write NaN into the wallet, which
 * would render as "NaN CR" and persist.
 */
export function grantCredits(save: Save, amount: number = DEV_CREDITS): Save {
  if (!Number.isFinite(amount) || amount <= 0) return save;
  return { ...save, credits: save.credits + Math.round(amount) };
}
