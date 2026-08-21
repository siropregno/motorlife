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
} as const;
