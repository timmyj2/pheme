import { useEffect, useRef, useState } from "react";
import { api, type Prompt } from "./api.ts";
import { matchPrompt } from "./Prompts.tsx";
import { useToast } from "./toast.tsx";

/** Folder paths compare equal when they differ only by a trailing slash. */
const sameDir = (a?: string, b?: string) => (a ?? "").replace(/[\\/]+$/, "") === (b ?? "").replace(/[\\/]+$/, "") && !!a && !!b;

/** The prompts offered in a chat: those for every chat plus those for this chat's project, project ones first. */
export function promptsFor(all: Prompt[], projectDir: string | undefined, query: string): Prompt[] {
  const scoped = all.filter((p) => !p.projectDir || sameDir(p.projectDir, projectDir));
  const hits = scoped.filter((p) => matchPrompt(p, query));
  // names that start with the query come before names that only contain it
  const q = query.trim().toLowerCase();
  const rank = (p: Prompt) => (p.projectDir ? 0 : 2) + (q && p.name.toLowerCase().startsWith(q) ? 0 : 1);
  return hits.map((p, i) => ({ p, i })).sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i).map((x) => x.p);
}

/** Where the first {{placeholder}} sits in `text`, so it can be selected for typing over. */
export function firstPlaceholder(text: string): [number, number] | null {
  const m = /\{\{[^{}\n]{1,80}\}\}/.exec(text);
  return m ? [m.index, m.index + m[0].length] : null;
}

/** Loads the saved prompts whenever the picker opens. */
export function usePrompts(open: boolean): { all: Prompt[]; error: string; loading: boolean; reload: () => void } {
  const [all, setAll] = useState<Prompt[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);
  const reload = () => {
    const mine = ++seq.current;
    setLoading(true);
    api.prompts().then((p) => { if (mine === seq.current) { setAll(p); setError(""); } }).catch((e: Error) => { if (mine === seq.current) setError(e.message); }).finally(() => { if (mine === seq.current) setLoading(false); });
  };
  useEffect(() => { if (open) reload(); }, [open]);
  return { all, error, loading, reload };
}

interface ListProps {
  items: Prompt[];
  active: number;
  loading: boolean;
  error: string;
  total: number;
  onPick: (p: Prompt) => void;
  onHover: (i: number) => void;
  onRetry: () => void;
}

export function PromptList({ items, active, loading, error, total, onPick, onHover, onRetry }: ListProps) {
  return (
    <div className="prompt-pop">
      {error ? <p className="notice error small" role="alert">{error} <button className="link" onClick={onRetry}>Try again</button></p>
        : loading && total === 0 ? <p className="muted small">Loading…</p>
        : items.length === 0 ? <p className="muted small">{total === 0 ? "No saved prompts yet." : "No prompt matches."}</p>
        : (
          <ul role="listbox" aria-label="Saved prompts" id="prompt-listbox">
            {items.map((p, i) => (
              <li key={p.id} id={`prompt-opt-${p.id}`} role="option" aria-selected={i === active} className={i === active ? "active" : ""} onMouseEnter={() => onHover(i)} onMouseDown={(e) => { e.preventDefault(); onPick(p); }}>
                <span className="prompt-opt-name">{p.name}{p.projectDir ? <span className="pr-badge">project</span> : null}</span>
                <span className="muted small prompt-opt-text">{p.text.replace(/\s+/g, " ").slice(0, 90)}</span>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}

/** Save the message being written as a prompt. Asks only for a name, and whether it belongs to this project. */
export function SaveAsPrompt({ text, projectDir, onSaved, onCancel }: { text: string; projectDir?: string; onSaved: () => void; onCancel: () => void }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [project, setProject] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true); setError("");
    try {
      await api.createPrompt({ name, text, ...(project && projectDir ? { projectDir } : {}) });
      toast.info("Saved as a prompt");
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <form className="prompt-save" onSubmit={(e) => { e.preventDefault(); if (name.trim()) void save(); }} aria-label="Save as prompt">
      {error && <p className="notice error small" role="alert">{error}</p>}
      <input autoFocus aria-label="Prompt name" placeholder="Name this prompt" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onCancel(); } }} />
      {projectDir && <label className="check small"><input type="checkbox" checked={project} onChange={(e) => setProject(e.target.checked)} /> Only in this project</label>}
      <div className="row"><button className="btn primary small" type="submit" disabled={saving || !name.trim()}>{saving ? "Saving…" : "Save"}</button><button className="btn small" type="button" onClick={onCancel}>Cancel</button></div>
    </form>
  );
}
