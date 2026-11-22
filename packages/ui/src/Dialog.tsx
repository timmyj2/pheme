import { useEffect, useRef, type ReactNode } from "react";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Accessible modal: traps Tab, closes on Esc and backdrop click, and returns focus to whatever opened it. */
export function Dialog({ label, onClose, children, className = "" }: { label: string; onClose: () => void; children: ReactNode; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const first = box.current?.querySelector<HTMLElement>("[data-autofocus]") ?? box.current?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    return () => {
      if (opener && document.contains(opener)) opener.focus();
    };
  }, []);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab" || !box.current) return;
    const items = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.closest("[hidden]"));
    if (!items.length) return;
    const firstEl = items[0];
    const lastEl = items[items.length - 1];
    if (e.shiftKey && document.activeElement === firstEl) {
      e.preventDefault();
      lastEl.focus();
    } else if (!e.shiftKey && document.activeElement === lastEl) {
      e.preventDefault();
      firstEl.focus();
    }
  };
  return (
    <div className="overlay" onMouseDown={onClose}>
      <div ref={box} className={`dialog ${className}`} role="dialog" aria-modal="true" aria-label={label} onMouseDown={(e) => e.stopPropagation()} onKeyDown={onKey}>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, body, confirmLabel, danger, onConfirm, onClose }: { title: string; body: string; confirmLabel: string; danger?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Dialog label={title} onClose={onClose}>
      <h2 className="dialog-title">{title}</h2>
      <p className="muted">{body}</p>
      <div className="dialog-actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className={`btn ${danger ? "danger" : "primary"}`} data-autofocus onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</button>
      </div>
    </Dialog>
  );
}
