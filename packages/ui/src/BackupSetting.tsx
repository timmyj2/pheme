import { useRef, useState } from "react";
import { ConfirmDialog } from "./Dialog.tsx";
import { api, type BackupPreview } from "./api.ts";
import { useToast } from "./toast.tsx";

const mb = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);

/** Settings panel: download everything Pheme stores, or restore from a backup file (with a preview first). */
export function BackupSetting() {
  const toast = useToast();
  const [busy, setBusy] = useState<"" | "download" | "preview" | "restore">("");
  const [error, setError] = useState("");
  const [picked, setPicked] = useState<{ file: File; preview: BackupPreview } | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const download = async () => {
    setBusy("download");
    setError("");
    try {
      const { blob, name } = await api.downloadBackup();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast.info(`Backup saved as “${name}” (${mb(blob.size)})`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    setPicked(null);
    setOverwrite(false);
    if (file.size > 250_000_000) { setError("That file is over 250 MB, which is more than Pheme can restore."); return; }
    setBusy("preview");
    try {
      setPicked({ file, preview: await api.previewRestore(file) });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
      if (input.current) input.current.value = ""; // allow choosing the same file again
    }
  };

  const restore = async () => {
    if (!picked) return;
    setBusy("restore");
    setError("");
    try {
      const r = await api.restore(picked.file, overwrite);
      toast.info(`Restored ${r.written} file${r.written === 1 ? "" : "s"}${r.skipped ? `, kept ${r.skipped} that already existed` : ""}. Reloading…`);
      setPicked(null);
      setTimeout(() => window.location.reload(), 900);
    } catch (e) {
      setError((e as Error).message);
      setBusy("");
    }
  };

  const p = picked?.preview;
  return (
    <div className="panel">
      <h3>Backup and restore</h3>
      <p className="muted small">One file with your chats, skills, memory, agents, jobs and settings. Keep it somewhere safe, or use it to move Pheme to another computer. It does not include your Copilot sign-in.</p>
      <div className="row">
        <button className="btn" disabled={busy !== ""} onClick={() => void download()}>{busy === "download" ? "Preparing…" : "Download backup"}</button>
        <label className={`btn${busy !== "" ? " disabled" : ""}`}>
          {busy === "preview" ? "Reading…" : "Restore from file…"}
          <input ref={input} type="file" accept=".pheme-backup,application/octet-stream" className="sr-only" disabled={busy !== ""} onChange={(e) => void choose(e.target.files?.[0])} />
        </label>
      </div>
      {error && <p className="notice error" role="alert">{error}</p>}
      {p && picked && (
        <div className="restore-preview" role="group" aria-label="Restore preview">
          <strong>{picked.file.name}</strong>
          <ul className="small">
            <li>Made {new Date(p.createdAt).toLocaleString()}{p.appVersion ? ` by Pheme ${p.appVersion}` : ""}</li>
            <li>{p.chats} chat{p.chats === 1 ? "" : "s"}, {p.skills} skill{p.skills === 1 ? "" : "s"}, {p.agents} agent{p.agents === 1 ? "" : "s"}{p.hasMemory ? ", memory" : ""}{p.hasSettings ? ", settings" : ""}</li>
            <li>{p.newFiles} new file{p.newFiles === 1 ? "" : "s"} · {p.existingFiles} already here{p.existingChats ? ` (${p.existingChats} of the chats)` : ""}</li>
          </ul>
          <label className="check"><input type="radio" name="restore-mode" checked={!overwrite} onChange={() => setOverwrite(false)} /> Add what is missing and keep everything already here (safest)</label>
          <label className="check"><input type="radio" name="restore-mode" checked={overwrite} onChange={() => setOverwrite(true)} /> Replace what is already here with the backup's version</label>
          <p className="muted small">Pheme saves your current data in a “backups” folder inside its data folder first, so you can undo a mistake.</p>
          <div className="row">
            <button className="btn primary" disabled={busy !== ""} onClick={() => (overwrite ? setConfirm(true) : void restore())}>{busy === "restore" ? "Restoring…" : "Restore"}</button>
            <button className="btn" disabled={busy !== ""} onClick={() => setPicked(null)}>Cancel</button>
          </div>
        </div>
      )}
      {confirm && <ConfirmDialog title="Replace existing data?" body={`${p?.existingFiles ?? 0} file(s) here will be replaced with the backup's versions. A copy of your current data is saved first.`} confirmLabel="Replace" danger onConfirm={() => { setConfirm(false); void restore(); }} onClose={() => setConfirm(false)} />}
    </div>
  );
}
