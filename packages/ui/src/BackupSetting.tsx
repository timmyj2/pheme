import { useRef, useState } from "react";
import { ConfirmDialog } from "./Dialog.tsx";
import { api, type BackupPreview } from "./api.ts";
import { useToast } from "./toast.tsx";
import { SettingsHeading } from "./components/overlay/settings-rows.tsx";
import { cn } from "./lib/utils.ts";

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
  const link = "inline-flex h-7 items-center rounded-md border border-(--ui-stroke-secondary) px-3 text-xs text-(--ui-text-secondary) transition-colors hover:bg-(--ui-control-hover-background) hover:text-foreground disabled:pointer-events-none disabled:opacity-50";
  return (
    <>
      <SettingsHeading>Backup and restore</SettingsHeading>
      <p className="text-xs leading-relaxed text-(--ui-text-tertiary)">One file with your chats, skills, memory, agents, jobs and settings. Keep it somewhere safe, or use it to move Pheme to another computer. It does not include your Copilot sign-in.</p>
      <div className="flex flex-wrap items-center gap-2 py-3">
        <button className={cn(link, "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground border-transparent")} disabled={busy !== ""} onClick={() => void download()} type="button">{busy === "download" ? "Preparing…" : "Download backup"}</button>
        <label className={cn(link, "cursor-pointer", busy !== "" && "pointer-events-none opacity-50")}>
          {busy === "preview" ? "Reading…" : "Restore from file…"}
          <input ref={input} type="file" accept=".pheme-backup,application/octet-stream" className="sr-only" disabled={busy !== ""} onChange={(e) => void choose(e.target.files?.[0])} />
        </label>
      </div>
      {error && <p className="over text-xs" role="alert">{error}</p>}
      {p && picked && (
        <div className="flex flex-col gap-2 rounded-lg border border-(--ui-stroke-secondary) p-3 text-xs" role="group" aria-label="Restore preview">
          <strong className="text-[13px] font-medium text-foreground">{picked.file.name}</strong>
          <ul className="flex flex-col gap-0.5 text-(--ui-text-tertiary)">
            <li>Made {new Date(p.createdAt).toLocaleString()}{p.appVersion ? ` by Pheme ${p.appVersion}` : ""}</li>
            <li>{p.chats} chat{p.chats === 1 ? "" : "s"}, {p.skills} skill{p.skills === 1 ? "" : "s"}, {p.agents} agent{p.agents === 1 ? "" : "s"}{p.hasMemory ? ", memory" : ""}{p.hasSettings ? ", settings" : ""}</li>
            <li>{p.newFiles} new file{p.newFiles === 1 ? "" : "s"} · {p.existingFiles} already here{p.existingChats ? ` (${p.existingChats} of the chats)` : ""}</li>
          </ul>
          <label className="flex items-center gap-2 text-(--ui-text-secondary)"><input type="radio" name="restore-mode" checked={!overwrite} onChange={() => setOverwrite(false)} /> Add what is missing and keep everything already here (safest)</label>
          <label className="flex items-center gap-2 text-(--ui-text-secondary)"><input type="radio" name="restore-mode" checked={overwrite} onChange={() => setOverwrite(true)} /> Replace what is already here with the backup's version</label>
          <p className="text-(--ui-text-tertiary)">Pheme saves your current data in a “backups” folder inside its data folder first, so you can undo a mistake.</p>
          <div className="flex items-center gap-2 pt-1">
            <button className="inline-flex h-7 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50" disabled={busy !== ""} onClick={() => (overwrite ? setConfirm(true) : void restore())} type="button">{busy === "restore" ? "Restoring…" : "Restore"}</button>
            <button className={link} disabled={busy !== ""} onClick={() => setPicked(null)} type="button">Cancel</button>
          </div>
        </div>
      )}
      {confirm && <ConfirmDialog title="Replace existing data?" body={`${p?.existingFiles ?? 0} file(s) here will be replaced with the backup's versions. A copy of your current data is saved first.`} confirmLabel="Replace" danger onConfirm={() => { setConfirm(false); void restore(); }} onClose={() => setConfirm(false)} />}
    </>
  );
}
