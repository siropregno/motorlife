import type { PartId } from "@contracts/mods";

/**
 * The glyphs, in one place because most of them are used twice: once in the
 * right-click menu on a card and once on a button in the sheet. A path written
 * out at both call sites is a path that goes stale at one.
 *
 * Every one is white on transparency, the same convention as the section nav
 * icons, so whatever draws them dims them with opacity rather than recolouring.
 * That is what lets the same file sit on a dark button and on a purple badge.
 */
export const ICON = {
  drive: "/car-key.png",
  paint: "/paint-brush.png",
  sell: "/icon-shop.png",
  back: "/back.png",
  settings: "/settings.png",
  /**
   * The collector's mark. Not an action -- it is the one glyph here that
   * nobody clicks -- but it obeys the same white-on-transparency rule as the
   * rest, so it belongs to the same table rather than to a path in CarCard.
   */
  shiny: "/shiny.png",
  /** The workshop, on the nav tab and on the sheet's button. */
  wrench: "/wrench.png",
} as const;

/**
 * The four parts, each with its own glyph.
 *
 * Separate from ICON because these are indexed by PartId rather than reached
 * by name: the workshop maps over PART_IDS and needs a glyph per part, and a
 * lookup that can miss would be a hole in the row rather than a type error.
 * Record<PartId, string> is what makes adding a fifth part a compile failure
 * here instead of a blank tile at runtime.
 */
export const PART_ICON: Record<PartId, string> = {
  suspension: "/suspension.png",
  gearbox: "/transmission.png",
  exhaust: "/exhaust.png",
  turbo: "/turbo.png",
};

/** The engine rebuild, which is not one of the four. */
export const ENGINE_ICON = "/engine.png";
