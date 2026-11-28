import { useEffect, useMemo, useRef, useState } from "react";
import { api, type ChangedFile, type GitStatus } from "./api.ts";
import { useToast } from "./toast.tsx";
import { TID } from "./testids.ts";

/** First-guess commit message and branch name; mirrors the server helpers so the box is filled in with no round trip. */
export function suggestMessage(files: ChangedFile[]): string {
  if (!files.length) return "";
  const kind = (f: ChangedFile) => (f.unstaged === "untracked" || f.staged === "added" ? "Add" : f.staged === "deleted" || f.unstaged === "deleted" ? "Remove" : f.staged === "renamed" ? "Rename" : "Update");
  const kinds = new Set(files.map(kind));
  const verb = kinds.size === 1 ? [...kinds][0] : "Update";
  const names = files.map((f) => f.path.split("/").pop() ?? f.path);
  return `${verb} ${names.slice(0, 3).join(", ")}${names.length > 3 ? ` and ${names.length - 3} more` : ""}`;
}
export function suggestBranch(message: string): string {
  const slug = message.split("\n")[0].toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/g, "");
  return `pheme/${slug || "changes"}`;
}

interface Props {
  chatId: string;
  status: GitStatus;
  busy: boolean;
  onDone: () => void;
}

/** Pick files, write a message, confirm, commit. Remembers the last commit so it can be undone. */
export function CommitBox({ chatId, status, busy, onDone }: Props) {
  const toast = useToast();
  const files = status.files;
  const eligible = useMemo(() => files.filter((f) => f.unstaged !== "conflicted"), [files]);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(eligible.filter((f) => !f.risky).map((f) => f.path)));
  const [message, setMessage] = useState("");
  const [edited, setEdited] = useState(false);
  const [branch, setBranch] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [last, setLast] = useState<{ sha: string; short: string; branch: string; summary: string } | null>(null);
  const [riskyOk, setRiskyOk] = useState<Set<string>>(new Set());
  const known = useRef(new Set(files.map((f) => f.path)));

  // Files that appear later are ticked automatically (unless they look like secrets); files that vanish are dropped.
  useEffect(() => {
    setPicked((prev) => {
      const next = new Set([...prev].filter((p) => eligible.some((f) => f.path === p)));
      for (const f of eligible) if (!known.current.has(f.path) && !f.risky) next.add(f.path);
      known.current = new Set(files.map((f) => f.path));
      return next.size === prev.size && [...next].every((p) => prev.has(p)) ? prev : next;
    });
  }, [files, eligible]);

  const chosen = eligible.filter((f) => picked.has(f.path));
  const chosenKey = chosen.map((f) => f.path).join("\n");
  const needsBranch = !!status.protectedBranch;
  const risky = chosen.filter((f) => f.risky);
  const suggested = suggestMessage(chosen);
  useEffect(() => { if (!edited) setMessage(suggested); }, [suggested, edited]);
  useEffect(() => { if (needsBranch && !branch) setBranch(suggestBranch(message || suggested)); }, [needsBranch, branch, message, suggested]);
  useEffect(() => { setConfirming(false); }, [chosenKey]); // the selection changed: ask again

  const toggle = (p: string) => setPicked((s) => { const n = new Set(s); if (n.has(p)) n.delete(p); else n.add(p); return n; });
  const allOn = eligible.length > 0 && chosen.length === eligible.length;
  const problem = busy ? "A reply is running and may still be changing files. Wait for it to finish, or stop it." : !chosen.length ? "Tick at least one file." : !message.trim() ? "Write a commit message." : needsBranch && !branch.trim() ? "Enter a name for the new branch." : "";

  const commit = async () => {
    setWorking(true);
    setError("");
    try {
      const r = await api.gitCommit(chatId, { message, paths: chosen.map((f) => f.path), branch: needsBranch ? branch.trim() : undefined, allowRisky: [...riskyOk] });
      setLast(r);
      setConfirming(false);
      setEdited(false);
      setMessage("");
      setBranch("");
      setRiskyOk(new Set());
      toast.info(`Committed ${r.short} on ${r.branch}`);
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setConfirming(false);
    } finally {
      setWorking(false);
    }
  };

  const undo = async () => {
    if (!last) return;
    setWorking(true);
    setError("");
    try {
      await api.gitUndo(chatId, last.sha);
      toast.info(`Undid ${last.short}. Your changes are back, still staged.`);
      setLast(null);
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="commit-box">
      {eligible.length > 0 && (
        <div className="commit-pick">
          <label className="check"><input type="checkbox" checked={allOn} onChange={() => setPicked(allOn ? new Set() : new Set(eligible.filter((f) => !f.risky).map((f) => f.path)))} /> {chosen.length} of {eligible.length} files selected</label>
          <ul className="pick-list" aria-label="Files to commit">
            {eligible.map((f) => (
              <li key={f.path}>
                <label className="check" title={f.path}>
                  <input type="checkbox" checked={picked.has(f.path)} onChange={() => toggle(f.path)} />
                  <span className="change-path">{f.path}</span>
                  {f.risky && <span className="risk" title="This file name looks like it holds a secret">⚠ secret?</span>}
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
      {eligible.length > 0 && (
        <>
          <textarea className="commit-msg" aria-label="Commit message" rows={3} value={message} placeholder="Commit message" onChange={(e) => { setMessage(e.target.value); setEdited(true); }} />
          {needsBranch && (
            <label className="field small"><span>You are on <b>{status.branch ?? "a detached HEAD"}</b>, so this goes on a new branch:</span>
              <input aria-label="New branch name" value={branch} onChange={(e) => setBranch(e.target.value)} spellCheck={false} />
            </label>
          )}
          {error && <p className="notice error" role="alert">{error}</p>}
          {!confirming && <button className="btn primary" disabled={!!problem || working} title={problem} onClick={() => setConfirming(true)}>Commit {chosen.length ? `${chosen.length} file${chosen.length === 1 ? "" : "s"}` : ""}…</button>}
          {problem && !confirming && <p className="muted small">{problem}</p>}
          {confirming && (
            <div className="approval commit-confirm" role="group" aria-label="Confirm commit">
              <strong>Commit {chosen.length} file{chosen.length === 1 ? "" : "s"}{needsBranch ? ` to new branch ${branch}` : ` on ${status.branch}`}?</strong>
              <pre className="small">{message.trim().split("\n")[0]}</pre>
              {risky.length > 0 && (
                <div className="notice error">
                  <p>These look like secrets: {risky.map((f) => f.path).join(", ")}. Once committed they are in Git history.</p>
                  <label className="check"><input type="checkbox" checked={risky.every((f) => riskyOk.has(f.path))} onChange={(e) => setRiskyOk(e.target.checked ? new Set(risky.map((f) => f.path)) : new Set())} /> I understand, commit them anyway</label>
                </div>
              )}
              <div className="row">
                <button className="btn primary" disabled={working || (risky.length > 0 && !risky.every((f) => riskyOk.has(f.path)))} onClick={() => void commit()}>{working ? "Committing…" : "Commit"}</button>
                <button className="btn" disabled={working} onClick={() => setConfirming(false)}>Cancel</button>
              </div>
            </div>
          )}
        </>
      )}
      {last && (
        <div className="commit-done" data-testid={TID.commitDone} role="status">
          <span>✓ <code>{last.short}</code> on {last.branch}: {last.summary}</span>
          <button className="btn small" disabled={working || busy} onClick={() => void undo()} title="Go back to before this commit; your changes stay">Undo</button>
        </div>
      )}
    </div>
  );
}
