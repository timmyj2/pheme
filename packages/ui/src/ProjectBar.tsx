import { IconFolder, IconLayoutSidebarRight } from "./lib/icons.ts";
import { useState } from "react";
import { Dialog } from "./Dialog.tsx";
import type { GitStatus } from "./api.ts";
import { TID } from "./testids.ts";

interface Props {
  dir: string | undefined;
  status: GitStatus | null;
  busy: boolean;
  panelOpen: boolean;
  onTogglePanel: () => void;
  onSetDir: (dir: string | null) => Promise<void>;
  /** Kept for the chat's call site; the controls are always icon-sized now. */
  compact?: boolean;
}

/**
 * The project folder button and the right-panel toggle, shown in the top-right icon cluster. The folder name and
 * branch are shown in the right column itself (RightPanel).
 */
export function ProjectBar({ dir, status, busy, panelOpen, onTogglePanel, onSetDir }: Props) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const count = status?.repo ? status.files.length + (status.moreFiles ?? 0) : 0;

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

  const iconBtn = "icon-btn relative rounded p-1 hover:text-foreground";
  return (
    <>
      <button className={iconBtn} aria-label={dir ? `Project folder ${dir}. Change` : "Choose a project folder"} title={dir ? `${dir}\nClick to change` : "Choose a project folder"} onClick={() => { setValue(dir ?? ""); setErr(""); setEditing(true); }}>
        <IconFolder className="size-3.5" aria-hidden="true" />
      </button>
      {dir && (
        <button className={`${iconBtn} ${panelOpen ? "text-primary" : ""}`} aria-pressed={panelOpen} data-testid={TID.rightPanelToggle} aria-label={panelOpen ? "Hide the right panel" : "Show the right panel"} title={panelOpen ? "Hide the right panel" : "Show files and changes"} onClick={onTogglePanel}>
          <IconLayoutSidebarRight className="size-3.5" aria-hidden="true" />
          {!panelOpen && count > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-3 rounded-full bg-primary px-0.5 text-center text-[9px] leading-3 text-primary-foreground">{count}</span>}
        </button>
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
    </>
  );
}
