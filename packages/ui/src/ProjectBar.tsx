import { useState } from "react";
import { Dialog } from "./Dialog.tsx";
import type { GitStatus } from "./api.ts";

interface Props {
  dir: string | undefined;
  status: GitStatus | null;
  busy: boolean;
  panelOpen: boolean;
  onTogglePanel: () => void;
  onSetDir: (dir: string | null) => Promise<void>;
  /** Icon only. Used in the top bar, where a wrapping label covers the chat. */
  compact?: boolean;
}

/** The folder this chat works in, with the branch and a Changes toggle. */
export function ProjectBar({ dir, status, busy, panelOpen, onTogglePanel, onSetDir, compact }: Props) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const count = status?.repo ? status.files.length + (status.moreFiles ?? 0) : 0;
  const folderName = dir ? dir.split(/[\\/]/).filter(Boolean).pop() ?? dir : "";

  const save = async (next: string | null) => {
    setSaving(true);
    setErr("");
    try {
      await onSetDir(next);
      setEditing(false);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const box = compact ? { width: 28, height: 28, minWidth: 28, minHeight: 0, maxWidth: 28, maxHeight: 28, padding: 0, margin: 0, overflow: "hidden", flex: "0 0 28px" } as const : undefined;
  return (
    <div className="project-bar" style={box}>
      {dir ? (
        <>
          <button className="project-folder" style={box} title={`${dir}\nClick to change`} onClick={() => { setValue(dir); setErr(""); setEditing(true); }} aria-label={`Project folder ${dir}. Change`}>
            <span aria-hidden>📁</span> {!compact && <span className="project-name">{folderName}</span>}
          </button>
          {!compact && status?.repo && status.branch && <span className="project-branch" title={status.upstream ? `Tracking ${status.upstream}` : "No upstream branch"}>⎇ {status.branch}{status.ahead ? ` ↑${status.ahead}` : ""}{status.behind ? ` ↓${status.behind}` : ""}</span>}
          {!compact && status?.repo && status.detached && <span className="project-branch warn">detached HEAD</span>}
          {!compact && <span className="spacer" />}
          {!compact && (
            <button className={`btn small${panelOpen ? " active" : ""}`} aria-pressed={panelOpen} onClick={onTogglePanel} title="Show changed files and diffs">
              Changes{count ? <span className="count-badge">{count}</span> : null}
            </button>
          )}
        </>
      ) : (
        <>
        <button className="project-folder empty" style={box} aria-label="Choose a project folder" onClick={() => { setValue(""); setErr(""); setEditing(true); }}>
          <span aria-hidden>📁</span> {!compact && <span className="folder-label">Choose a project folder</span>}
        </button>
        </>
      )}
      {editing && (
        <Dialog label="Project folder" onClose={() => setEditing(false)}>
          <form className="dialog-form" onSubmit={(e) => { e.preventDefault(); void save(value.trim()); }}>
            <h2>Project folder</h2>
            <p className="muted small">Pheme works in this folder: its shell commands and file edits run here, and the Changes panel shows its Git changes. Use the full path.</p>
            {busy && <p className="notice error">A reply is running. Stop it or wait before changing the folder.</p>}
            <input data-autofocus aria-label="Folder path" value={value} onChange={(e) => setValue(e.target.value)} placeholder="/Users/you/project   or   C:\Users\you\project" spellCheck={false} />
            {err && <p className="notice error" role="alert">{err}</p>}
            <div className="row">
              <button type="submit" className="btn primary" disabled={saving || busy || !value.trim()}>Use this folder</button>
              {dir && <button type="button" className="btn danger" disabled={saving || busy} onClick={() => void save(null)}>Remove folder</button>}
              <button type="button" className="btn" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
