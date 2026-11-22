import { useEffect, useMemo, useRef, useState } from "react";

export interface Command {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

export function Palette({ commands, onClose }: { commands: Command[]; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return commands.filter((c) => !n || c.label.toLowerCase().includes(n)).slice(0, 50);
  }, [commands, q]);
  useEffect(() => { setSel(0); }, [q]);
  const run = (c?: Command) => {
    if (!c) return;
    onClose();
    c.run();
  };
  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="palette" role="dialog" aria-label="Command palette" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={input}
          value={q}
          placeholder="Type a command or chat title"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            else if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, shown.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
            else if (e.key === "Enter") run(shown[sel]);
          }}
        />
        <ul>
          {shown.map((c, i) => (
            <li key={c.id} className={i === sel ? "sel" : ""} onMouseEnter={() => setSel(i)} onClick={() => run(c)}>
              <span>{c.label}</span>
              {c.hint && <span className="muted small">{c.hint}</span>}
            </li>
          ))}
          {shown.length === 0 && <li className="muted">No matches</li>}
        </ul>
      </div>
    </div>
  );
}
