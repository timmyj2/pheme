import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog } from "./Dialog.tsx";

export interface Command {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

/** Every word typed must appear in the label; labels that start with the query come first. */
export function filterCommands(commands: Command[], q: string, limit = 50): Command[] {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return commands.slice(0, limit);
  const scored: { c: Command; s: number }[] = [];
  for (const c of commands) {
    const l = c.label.toLowerCase();
    if (!words.every((w) => l.includes(w))) continue;
    scored.push({ c, s: l.startsWith(words[0]) ? 0 : l.includes(" " + words[0]) ? 1 : 2 });
    if (scored.length > 4000) break;
  }
  return scored.sort((a, b) => a.s - b.s).slice(0, limit).map((x) => x.c);
}

export function Palette({ commands, onClose }: { commands: Command[]; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const list = useRef<HTMLUListElement>(null);
  const shown = useMemo(() => filterCommands(commands, q), [commands, q]);
  useEffect(() => setSel(0), [q]);
  useEffect(() => { list.current?.querySelector<HTMLElement>(`[data-i="${sel}"]`)?.scrollIntoView({ block: "nearest" }); }, [sel]);
  const run = (c?: Command) => {
    if (!c) return;
    onClose();
    // Let the dialog hand focus back first, so a command that focuses something (new chat) wins.
    setTimeout(c.run, 0);
  };
  return (
    <Dialog label="Command palette" onClose={onClose} className="palette">
      <input
        data-autofocus
        role="combobox"
        aria-expanded="true"
        aria-controls="palette-list"
        aria-activedescendant={shown[sel] ? `pal-${sel}` : undefined}
        aria-label="Type a command or chat title"
        value={q}
        placeholder="Type a command or chat title"
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, shown.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
          else if (e.key === "Home") { e.preventDefault(); setSel(0); }
          else if (e.key === "End") { e.preventDefault(); setSel(Math.max(0, shown.length - 1)); }
          else if (e.key === "Enter") { e.preventDefault(); run(shown[sel]); }
        }}
      />
      <ul id="palette-list" role="listbox" ref={list}>
        {shown.map((c, i) => (
          <li key={c.id} id={`pal-${i}`} data-i={i} role="option" aria-selected={i === sel} className={i === sel ? "sel" : ""} onMouseMove={() => setSel(i)} onClick={() => run(c)}>
            <span className="pal-label">{c.label}</span>
            {c.hint && <span className="muted small">{c.hint}</span>}
          </li>
        ))}
        {shown.length === 0 && <li className="muted" role="option" aria-selected="false">No matches</li>}
      </ul>
    </Dialog>
  );
}
