import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface MenuItem {
  label: string;
  /** Right-aligned secondary text: a price, or why the item is disabled. */
  hint?: string;
  /** When set, the first activation arms the item and shows this instead. */
  confirm?: string;
  danger?: boolean;
  disabled?: boolean;
  onPick: () => void;
}

interface Props {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

const EDGE = 8;

/**
 * A right-click menu, rendered through a portal to document.body.
 *
 * The portal is not decoration. Cards are <button> elements, and a menu
 * nested inside one would be a button inside a button -- invalid, and the
 * inner control stops being reachable by keyboard in some browsers. Going
 * out to the body also frees the menu from the card's `overflow: hidden`.
 */
export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [pos, setPos] = useState({ x, y });
  const [armed, setArmed] = useState<number | null>(null);

  const firstEnabled = items.findIndex((i) => !i.disabled);

  // Flip the menu back inside the viewport before it paints. useLayoutEffect
  // rather than useEffect: with useEffect the reader sees one frame of the
  // menu hanging off the edge of the window.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      x: Math.max(EDGE, Math.min(x, window.innerWidth - r.width - EDGE)),
      y: Math.max(EDGE, Math.min(y, window.innerHeight - r.height - EDGE)),
    });
  }, [x, y]);

  // Focus moves into the menu on open and back to the card on close, so a
  // keyboard user is not dumped at the top of the document.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    itemRefs.current[firstEnabled]?.focus();
    return () => opener?.focus?.();
  }, [firstEnabled]);

  useEffect(() => {
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    // pointerdown, not click: the right-click that opened this menu already
    // spent its pointerdown, so the next one is always a fresh gesture.
    document.addEventListener("pointerdown", away, true);
    document.addEventListener("keydown", key);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onClose, true);
    return () => {
      document.removeEventListener("pointerdown", away, true);
      document.removeEventListener("keydown", key);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [onClose]);

  const step = (from: number, dir: 1 | -1) => {
    const n = items.length;
    for (let i = 1; i <= n; i++) {
      const at = (from + dir * i + n * n) % n;
      if (!items[at]?.disabled) return at;
    }
    return from;
  };

  const pick = (i: number) => {
    const item = items[i];
    if (!item || item.disabled) return;
    // Destructive items arm on the first activation and fire on the second.
    // Selling cannot be undone, and a stray right-click plus a stray left
    // click is a very cheap way to lose a car.
    if (item.confirm && armed !== i) {
      setArmed(i);
      return;
    }
    onClose();
    item.onPick();
  };

  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = step(i, e.key === "ArrowDown" ? 1 : -1);
      setArmed(null);
      itemRefs.current[next]?.focus();
    }
  };

  return createPortal(
    <div
      ref={ref}
      className="ctx"
      role="menu"
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) => {
        const isArmed = armed === i;
        return (
          <button
            key={item.label}
            ref={(el) => {
              itemRefs.current[i] = el;
            }}
            type="button"
            role="menuitem"
            className={`ctx-item${item.danger ? " danger" : ""}${isArmed ? " armed" : ""}`}
            disabled={item.disabled}
            onClick={() => pick(i)}
            onKeyDown={(e) => onKeyDown(e, i)}
            onMouseEnter={() => {
              if (!isArmed) setArmed(null);
            }}
          >
            <span className="ctx-label">{isArmed ? item.confirm : item.label}</span>
            {item.hint && !isArmed ? <span className="ctx-hint">{item.hint}</span> : null}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}
