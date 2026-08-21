import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { CarSpec } from "@contracts/car";
import { formatCredits } from "@progression/economy";
import { colorName, colorSwatch, colorsOf, imageFor } from "@progression/paint";
import { ICON } from "../lib/icons";
import { Glyph } from "./Glyph";

interface Props {
  spec: CarSpec;
  /** What the car wears today. The dot for it is live but cannot be bought. */
  color?: string | undefined;
  price: number;
  credits: number;
  onPaint: (color: string) => void;
  onClose: () => void;
}

/**
 * The paint shop: one car, one row of colours, one price.
 *
 * This was a third footer state inside the car sheet, sharing that dialog's
 * two-column frame with the spec list and the class badge. It is its own
 * dialog now, and the reason is the photo: choosing paint is looking at the
 * car, and everything that is not the car is in the way of that. Nothing here
 * is a figure about the machine -- the sheet already answered those before you
 * decided to spend money on how it looks.
 *
 * The row underneath is a three-column grid rather than a flex row with
 * space-between. Both put the dots in the middle when the sides happen to
 * match in width, but only the grid keeps them on the CENTRE of the dialog
 * when they do not, and they never do: the way out is a 15px arrow and the
 * price is five characters and a currency. Under space-between the palette
 * would sit slightly left on every car in the game.
 */
export function PaintModal({ spec, color, price, credits, onPaint, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
  }, []);

  const palette = colorsOf(spec);
  const shown = preview ?? color;
  const hero = imageFor(spec, shown) ?? spec.image;
  /** Something picked, something different from what it wears, and the money. */
  const payable = preview !== null && preview !== color && credits >= price;

  return (
    <dialog
      ref={ref}
      className="modal paint-modal"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
    >
      <div className="paint-hero">
        {hero ? (
          <img src={hero} alt={`${spec.make} ${spec.model}${shown ? ` ${colorName(shown)}` : ""}`} />
        ) : (
          <span className="modal-nophoto">sin foto</span>
        )}
      </div>

      <div className="paint-row">
        <button
          className="btn paint-back"
          aria-label="Volver"
          title="Volver"
          onClick={() => ref.current?.close()}
        >
          <Glyph src={ICON.back} />
        </button>

        {/* Every dot is live, the current colour included: clicking that one is
            how you get back to the car as it stands after trying another. What
            it does not do is arm the price. */}
        <div className="paint-swatches" role="group" aria-label="Colores">
          {palette.map((c) => (
            <button
              key={c}
              type="button"
              className={`paint-dot${shown === c ? " on" : ""}${c === color ? " current" : ""}`}
              style={{ "--dot": colorSwatch(c) } as CSSProperties}
              aria-label={c === color ? `${colorName(c)}, el color actual` : colorName(c)}
              title={c === color ? `${colorName(c)} · el color actual` : colorName(c)}
              onClick={() => setPreview(c)}
            />
          ))}
        </div>

        {/* The label is the number and nothing else: the brush got you in here
            and the dots are the choice, so what is left to say is the cost. */}
        <button
          className={`btn paint-pay${payable ? " primary" : ""}`}
          disabled={!payable}
          title={preview === color ? "Ya es de este color" : preview ? undefined : "Elegí un color"}
          onClick={() => {
            if (preview) onPaint(preview);
            ref.current?.close();
          }}
        >
          {credits < price ? `Faltan ${formatCredits(price - credits)} cr` : `${formatCredits(price)} cr`}
        </button>
      </div>
    </dialog>
  );
}
