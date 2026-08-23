import type { CarSpec, Rarity } from "@contracts/car";
import { ratingOf } from "@catalog/rating";

/**
 * What a car is worth from the catalogue, before its odometer and before
 * anything is bolted to it.
 *
 * It lives here rather than in economy.ts because both economy.ts and mods.ts
 * need it, and mods.ts is what economy.ts asks for the value of a build. Two
 * modules needing the same number is not a cycle; two modules importing each
 * other IS, and pulling the shared number down into a leaf is the fix that
 * does not involve a mutable module-level function nobody can trace.
 *
 * economy.ts re-exports priceOf, so every existing caller is unchanged.
 */

/**
 * Price is set by desirability, not by lap time. A cheap car that is
 * exceptional for its class index is a bargain, and hunting those is the
 * meta-game. Real classic markets work the same way: an E30 M3 costs more
 * than its lap time justifies.
 */
const RARITY_PRICE: Record<Rarity, number> = {
  common: 14_000,
  uncommon: 32_000,
  rare: 70_000,
  vrare: 150_000,
  exclusive: 500_000,
  unique: 2_000_000,
};

/** Performance nudges price, but only gently. Rarity dominates. */
const INDEX_PIVOT = 550;
const INDEX_INFLUENCE = 0.6;

/**
 * The STOCK price of the model. Mods are never in here: what a car is worth
 * from the catalogue is a property of the model, and a modified car is priced
 * by adding the resale of its parts on top (see modsValue). Folding mods into
 * this would make a modified car's own parts inflate the price of the next
 * part you fit to it.
 */
export function priceOf(spec: CarSpec): number {
  const base = RARITY_PRICE[spec.rarity];
  const { index } = ratingOf(spec);
  const mul = Math.max(
    0.6,
    Math.min(2, 1 + (INDEX_INFLUENCE * (index - INDEX_PIVOT)) / INDEX_PIVOT),
  );
  return Math.round((base * mul) / 100) * 100;
}
