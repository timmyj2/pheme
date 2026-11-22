import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

export interface ToastAction {
  label: string;
  run: () => void;
}
export interface Toast {
  id: number;
  kind: "info" | "error";
  text: string;
  action?: ToastAction;
}

interface Api {
  info: (text: string, action?: ToastAction) => void;
  error: (text: string, action?: ToastAction) => void;
}

const Ctx = createContext<Api>({ info() {}, error() {} });
export const useToast = () => useContext(Ctx);

const MAX_VISIBLE = 4;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback((kind: Toast["kind"], text: string, action?: ToastAction) => {
    setToasts((prev) => {
      // Collapse identical consecutive toasts instead of stacking a wall of the same error.
      if (prev.some((t) => t.kind === kind && t.text === text)) return prev;
      const id = next.current++;
      if (kind === "info") timers.current.set(id, setTimeout(() => dismiss(id), 3500));
      return [...prev, { id, kind, text, action }].slice(-MAX_VISIBLE);
    });
  }, [dismiss]);

  const api = useMemo<Api>(() => ({ info: (t, a) => push("info", t, a), error: (t, a) => push("error", t, a) }), [push]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="toasts" role="region" aria-label="Notifications">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`} role={t.kind === "error" ? "alert" : "status"}>
            <span className="toast-text">{t.text}</span>
            {t.action && <button className="link" onClick={() => { t.action!.run(); dismiss(t.id); }}>{t.action.label}</button>}
            <button className="toast-x" aria-label="Dismiss" onClick={() => dismiss(t.id)}>×</button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
