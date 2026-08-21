/**
 * An icon inside a button.
 *
 * Always alt="" and aria-hidden. Every one of these sits in a button that
 * carries its own aria-label, so giving the image a name too would have a
 * screen reader announce the action twice. The button is the control; the
 * glyph is paint on it.
 *
 * Lived in CarModal until Confirm wanted the same back arrow. One line of
 * markup is not much to copy, but the class it carries is the contract with
 * the stylesheet, and two copies of that drift.
 */
export function Glyph({ src }: { src: string }) {
  return <img className="btn-icon" src={src} alt="" aria-hidden="true" />;
}
