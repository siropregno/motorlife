import { useEffect, useRef } from "react";

interface Props {
  question: string;
  /** The consequence, spelled out. Usually the money. */
  detail?: string;
  /** What "yes" does, said as a verb rather than as "yes". */
  yes: string;
  danger?: boolean;
  onYes: () => void;
  onClose: () => void;
}

/**
 * "Are you sure?", as its own dialog.
 *
 * This replaced an arm-in-place button -- click Vender, it becomes "Vender por
 * 7.300 cr", click again to confirm. That pattern has a real flaw and the
 * garage sheet showed it: arming makes the button WIDER, the action row is
 * right-aligned, so the button grows out from under the pointer. The mouse
 * leaves it without moving, and the confirming click lands on nothing or on
 * the neighbouring button. A question that appears in its own box under the
 * cursor's own terms cannot do that.
 *
 * It stacks over the spec sheet rather than replacing it: <dialog> has a top
 * layer, so the second showModal() sits above the first with the car still
 * visible behind it. You are answering a question ABOUT something, and taking
 * that something off the screen to ask is how people end up confirming the
 * wrong car.
 */
export function Confirm({ question, detail, yes, danger, onYes, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className="modal confirm"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
    >
      <div className="confirm-body">
        <p className="confirm-q">{question}</p>
        {detail ? <p className="confirm-detail">{detail}</p> : null}
        <div className="confirm-acts">
          {/* No first, and focused first. The destructive answer should never
              be the one a stray Enter picks. */}
          <button className="btn" autoFocus onClick={() => ref.current?.close()}>
            No
          </button>
          <button
            className={`btn${danger ? " danger" : " primary"}`}
            onClick={() => {
              onYes();
              ref.current?.close();
            }}
          >
            {yes}
          </button>
        </div>
      </div>
    </dialog>
  );
}
