import { useEffect, useRef } from "react";

export interface MenuItem {
  label: string;
  run: () => void;
  danger?: boolean;
}

/** Floating menu at a point (context menu) or under a button. Arrow keys move, Enter picks, Esc/outside click closes. */
export function Menu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("button")?.focus();
    const out = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("mousedown", out, true);
    window.addEventListener("blur", onClose);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("mousedown", out, true);
      window.removeEventListener("blur", onClose);
      window.removeEventListener("resize", onClose);
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [onClose]);
  // Keep the menu inside the viewport.
  const left = Math.max(8, Math.min(x, window.innerWidth - 200));
  const top = Math.max(8, Math.min(y, window.innerHeight - items.length * 36 - 16));
  const onKey = (e: React.KeyboardEvent) => {
    const btns = [...(ref.current?.querySelectorAll<HTMLElement>("button") ?? [])];
    const i = btns.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") { e.stopPropagation(); onClose(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); btns[(i + 1) % btns.length]?.focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); btns[(i - 1 + btns.length) % btns.length]?.focus(); }
    else if (e.key === "Tab") { e.preventDefault(); onClose(); }
  };
  return (
    <ul ref={ref} className="menu" role="menu" style={{ left, top }} onKeyDown={onKey}>
      {items.map((it) => (
        <li key={it.label} role="none">
          <button role="menuitem" className={it.danger ? "danger" : ""} onClick={() => { onClose(); it.run(); }}>{it.label}</button>
        </li>
      ))}
    </ul>
  );
}
