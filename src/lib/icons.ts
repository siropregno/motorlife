/**
 * The action glyphs, in one place because every one of them is used twice:
 * once in the right-click menu on a card and once on a button in the sheet.
 * A path written out at both call sites is a path that goes stale at one.
 *
 * All three are white on transparency, the same convention as the section nav
 * icons, so whatever draws them dims them with opacity rather than recolouring.
 */
export const ICON = {
  drive: "/car-key.png",
  paint: "/paint-brush.png",
  sell: "/sell.svg",
} as const;
