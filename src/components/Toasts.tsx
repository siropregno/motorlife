import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ToastKind = "info" | "good" | "bad";

interface Toast {
  id: number;
  text: string;
  kind: ToastKind;
  /** Held one frame set for the exit animation before the node is dropped. */
  leaving?: boolean;
}

type Push = (text: string, kind?: ToastKind) => void;

const ToastContext = createContext<Push>(() => {});

/**
 * Fire a toast from anywhere under the provider. Stable across renders, so it
 * is safe in an effect dependency list.
 */
export const useToast = (): Push => useContext(ToastContext);

const LIFETIME_MS = 3400;
const EXIT_MS = 180;
const MAX = 4;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  // One set of handles for every pending timer, cleared on unmount. Without
  // it a toast still in flight when the tree goes away sets state on a dead
  // component.
  const after = useCallback((ms: number, fn: () => void) => {
    const h = setTimeout(() => {
      timers.current.delete(h);
      fn();
    }, ms);
    timers.current.add(h);
  }, []);

  const drop = useCallback(
    (id: number) => {
      // Both steps are idempotent: dismissing by hand and then having the
      // lifetime timer fire is the normal case, not an edge case.
      setToasts((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
      after(EXIT_MS, () => setToasts((list) => list.filter((t) => t.id !== id)));
    },
    [after],
  );

  const push = useCallback<Push>(
    (text, kind = "info") => {
      const id = nextId.current++;
      setToasts((list) => [...list, { id, text, kind }].slice(-MAX));
      after(LIFETIME_MS, () => drop(id));
    },
    [after, drop],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const h of pending) clearTimeout(h);
      pending.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`toast ${t.kind}${t.leaving ? " leaving" : ""}`}
            onClick={() => drop(t.id)}
          >
            {t.text}
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
