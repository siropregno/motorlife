import { useEffect, useRef, useState } from "react";
import { ICON } from "../lib/icons";
import { Confirm } from "./Confirm";
import { Glyph } from "./Glyph";

interface Props {
  onReset: () => void;
  onClose: () => void;
}

/**
 * Settings, which today is one thing: start again.
 *
 * A dialog rather than a fifth Screen, and that is the whole design decision.
 * The other three tabs are places you go to DO something with cars, and each
 * has a screen's worth of content; this has one row. Made a screen it would be
 * a page you can be left standing on, with the garage torn down behind it, and
 * the way back would be picking one of the other tabs rather than closing what
 * you opened. As a dialog the section you were in is still lit in the nav and
 * still there behind the backdrop, and the arrow puts you back in it.
 *
 * The reset itself goes through the same Confirm the garage uses to sell a car,
 * stacked over this one. Wiping a save is the most destructive button in the
 * game, and it should not answer to a single click -- and it should ask in the
 * same box, with the same back arrow first, as everything else that cannot be
 * undone.
 */
export function SettingsModal({ onReset, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  const [asking, setAsking] = useState(false);
  /*
   * Whether the answer was yes, remembered across the question closing.
   *
   * The reset cannot fire while the question is still up: closing a <dialog>
   * that has another modal dialog nested inside it takes the parent out of the
   * top layer with a child still in it, and Chrome leaves the child's backdrop
   * painted over a page you can no longer click. So the yes is recorded, the
   * question closes itself, and the work happens in its onClose -- by then
   * there is one dialog left and it is this one.
   */
  const done = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
    // After showModal, never before: it moves focus itself, and the red button
    // is the first thing in here that can take it.
    back.current?.focus();
  }, []);

  return (
    <>
    <dialog
      ref={ref}
      className="modal settings-modal"
      /*
       * Guarded by target, and this is not defensive coding -- it is a bug
       * that shipped. React simulates bubbling for `close`, so the question
       * stacked on top of this one closing sent its close event up to THIS
       * handler, and answering "no" to the reset shut the settings box as
       * well. The question is a sibling now rather than a child, and this
       * only listens to its own.
       */
      onClose={(e) => {
        if (e.target === ref.current) onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
    >
      <div className="settings-body">
        <h2 className="settings-title">Ajustes</h2>

        <div className="settings-row">
          <div className="settings-what">
            <span className="settings-label">Resetear progreso</span>
            {/* The consequence in full, before the click rather than after it:
                what goes, and that nothing brings it back. */}
            <span className="settings-note">
              Borra tus autos, tu plata y tus carreras. Volvés a empezar de cero.
            </span>
          </div>
          <button className="btn danger settings-reset" onClick={() => setAsking(true)}>
            Resetear
          </button>
        </div>

        <div className="settings-acts">
          {/* The same arrow that leaves the paint shop and the sell question,
              so "get out of this box" is one gesture across the game.

              Focused by hand in the effect above rather than by autoFocus:
              showModal() does its own focus pass, and it runs AFTER React has
              applied autoFocus, so the attribute alone left the focus on the
              dialog itself. */}
          <button
            ref={back}
            className="btn"
            aria-label="Volver"
            title="Volver"
            onClick={() => ref.current?.close()}
          >
            <Glyph src={ICON.back} />
          </button>
        </div>
      </div>
    </dialog>

      {asking ? (
        <Confirm
          question="¿Resetear todo tu progreso?"
          detail="Perdés tus autos, tu plata y tus carreras. No se puede deshacer."
          yes="Resetear"
          danger
          onYes={() => {
            done.current = true;
          }}
          onClose={() => {
            setAsking(false);
            if (!done.current) return;
            done.current = false;
            // This closes the settings box too: the reset puts you in a fresh
            // garage, and there is nothing left in here to look at. The caller
            // does the closing rather than a close() here, so the dialog is
            // never asked to close itself on the same tick React unmounts it.
            onReset();
          }}
        />
      ) : null}
    </>
  );
}
