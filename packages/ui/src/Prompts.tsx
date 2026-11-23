import { useEffect, useMemo, useState } from "react";
import { ConfirmDialog } from "./Dialog.tsx";
import { api, type Prompt } from "./api.ts";
import { LoadError } from "./Pages.tsx";
import { useToast } from "./toast.tsx";
import { useUnsaved } from "./unsaved.ts";

interface Draft { id: string | null; name: string; text: string; projectDir: string }
const BLANK: Draft = { id: null, name: "", text: "", projectDir: "" };

/** Case-insensitive match on name, text or folder; every word must appear somewhere. */
export function matchPrompt(p: Pick<Prompt, "name" | "text" | "projectDir">, query: string): boolean {
  const hay = `${p.name}\n${p.text}\n${p.projectDir ?? ""}`.toLowerCase();
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}

export function folderLabel(dir: string): string {
  const parts = dir.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? dir;
}

/** Saved prompts: create, edit, delete. They are inserted from the message box (the 📋 button, or type "/"). */
export function PromptsPage() {
  const toast = useToast();
  const [items, setItems] = useState<Prompt[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [edit, setEdit] = useState<Draft | null>(null);
  const [baseline, setBaseline] = useState("");
  const [query, setQuery] = useState("");
  const [confirm, setConfirm] = useState<Prompt | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = () => api.prompts().then((p) => { setItems(p); setLoadError(""); }).catch((e: Error) => setLoadError(e.message));
  useEffect(() => { void load(); }, []);

  const snap = (d: Draft | null) => JSON.stringify(d && [d.name, d.text, d.projectDir.trim()]);
  useUnsaved(!!edit && snap(edit) !== baseline);
  const open = (d: Draft) => { setEdit(d); setBaseline(snap(d)); setError(""); };

  const save = async () => {
    if (!edit || saving) return;
    setSaving(true); setError("");
    try {
      const body = { name: edit.name, text: edit.text, projectDir: edit.projectDir };
      if (edit.id) await api.updatePrompt(edit.id, body); else await api.createPrompt(body);
      setEdit(null); toast.info("Saved"); await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (p: Prompt) => {
    try { await api.deletePrompt(p.id); toast.info("Deleted"); } catch (e) { toast.error((e as Error).message); }
    setConfirm(null); await load();
  };

  const shown = useMemo(() => (items ?? []).filter((p) => matchPrompt(p, query)), [items, query]);

  return (
    <section className="page wide">
      <header className="page-head">
        <h2 className="page-title">Prompts</h2>
        <p className="muted">Saved messages you use again and again. In a chat, press the 📋 button next to the message box, or type <kbd>/</kbd>, to insert one. Put <code>{"{{like this}}"}</code> where you want to fill something in.</p>
      </header>
      {loadError && !items && <LoadError error={loadError} onRetry={() => void load()} />}
      <div className="panel">
        <div className="row">
          <button className="btn primary" onClick={() => open({ ...BLANK })}>New prompt</button>
          <input className="grow" aria-label="Search prompts" placeholder="Search prompts…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {items && items.length === 0 && !edit && <p className="muted small">No saved prompts yet. Try one like “Explain {"{{this}}"} to me as if I am new to it”.</p>}
        {items && items.length > 0 && shown.length === 0 && <p className="muted small">No prompt matches “{query}”.</p>}
        <ul className="prompt-list">
          {shown.map((p) => (
            <li key={p.id} className="job">
              <div className="job-main">
                <strong>{p.name}</strong>
                {p.projectDir ? <span className="pr-badge" title={p.projectDir}>Project: {folderLabel(p.projectDir)}</span> : null}
                <div className="muted small prompt-preview">{p.text.length > 160 ? `${p.text.slice(0, 160)}…` : p.text}</div>
              </div>
              <div className="row">
                <button className="btn" aria-label={`Edit ${p.name}`} onClick={() => open({ id: p.id, name: p.name, text: p.text, projectDir: p.projectDir ?? "" })}>Edit</button>
                <button className="btn danger" aria-label={`Delete ${p.name}`} onClick={() => setConfirm(p)}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
        {edit && (
          <div className="panel" role="group" aria-label={edit.id ? "Edit prompt" : "New prompt"}>
            {error && <p className="notice error" role="alert">{error}</p>}
            <label className="field">Name<input value={edit.name} maxLength={80} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
            <label className="field">Text<textarea className="area" rows={8} value={edit.text} maxLength={20000} onChange={(e) => setEdit({ ...edit, text: e.target.value })} /></label>
            <label className="field">Only in this project folder (optional)<input value={edit.projectDir} placeholder="Leave empty to offer it in every chat" onChange={(e) => setEdit({ ...edit, projectDir: e.target.value })} /></label>
            <div className="row">
              <button className="btn primary" disabled={saving || !edit.name.trim() || !edit.text.trim()} onClick={() => void save()}>{saving ? "Saving…" : "Save"}</button>
              <button className="btn" onClick={() => setEdit(null)}>Cancel</button>
            </div>
          </div>
        )}
      </div>
      {confirm && <ConfirmDialog title="Delete this prompt?" body={`“${confirm.name}” will be deleted. This cannot be undone.`} confirmLabel="Delete" danger onConfirm={() => void remove(confirm)} onClose={() => setConfirm(null)} />}
    </section>
  );
}
