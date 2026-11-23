import { useEffect, useState } from "react";
import { BranchBar } from "./BranchBar.tsx";
import { CommitBox } from "./CommitBox.tsx";
import { ShipBox } from "./ShipBox.tsx";
import { api, type ChangedFile, type FileDiff, type GitStatus } from "./api.ts";

const LABEL: Record<string, string> = { modified: "M", added: "A", deleted: "D", renamed: "R", copied: "C", untracked: "U", conflicted: "!", typechange: "T" };
const WORD: Record<string, string> = { modified: "Modified", added: "Added", deleted: "Deleted", renamed: "Renamed", copied: "Copied", untracked: "Untracked", conflicted: "Conflict", typechange: "Type changed" };

function primary(f: ChangedFile): string {
  return f.unstaged === "conflicted" ? "conflicted" : f.unstaged || f.staged;
}

/** Renders a unified diff with +/- colouring. Plain text nodes only (never HTML), so file contents cannot inject markup. */
export function DiffView({ diff }: { diff: string }) {
  const lines = diff.split("\n");
  if (lines.length && lines[lines.length - 1] === "") lines.pop(); // the text ends with a newline: no phantom blank line
  return (
    <pre className="diff" aria-label="Diff">
      {lines.map((l, i) => {
        const kind = l.startsWith("@@") ? "hunk" : l.startsWith("+++") || l.startsWith("---") || l.startsWith("diff ") || l.startsWith("index ") ? "meta" : l.startsWith("+") ? "add" : l.startsWith("-") ? "del" : "ctx";
        return <span key={i} className={`dl ${kind}`}>{l || " "}{"\n"}</span>;
      })}
    </pre>
  );
}

function FileRow({ chatId, f, stale }: { chatId: string; f: ChangedFile; stale: number }) {
  const [open, setOpen] = useState(false);
  const [diff, setDiff] = useState<FileDiff | null>(null);
  const [err, setErr] = useState("");
  const st = primary(f);

  useEffect(() => {
    if (!open) return;
    let dead = false;
    setErr("");
    api.gitDiff(chatId, f.path).then((d) => { if (!dead) setDiff(d); }).catch((e: Error) => { if (!dead) setErr(e.message); });
    return () => { dead = true; };
  }, [open, chatId, f.path, stale, f.additions, f.deletions]);

  return (
    <li className={`change-file st-${st}`}>
      <button className="change-row" aria-expanded={open} onClick={() => setOpen((o) => !o)} title={f.from ? `${f.from} → ${f.path}` : f.path}>
        <span className={`st-badge st-${st}`} role="img" aria-label={WORD[st]}>{LABEL[st]}</span>
        <span className="change-path">{f.path}</span>
        {f.binary ? <span className="muted small">binary</span> : <span className="change-counts"><span className="plus">+{f.additions}</span> <span className="minus">−{f.deletions}</span></span>}
      </button>
      {open && (
        <div className="change-diff">
          {err ? <p className="notice error">{err}</p> : !diff ? <p className="muted small">Loading…</p> : diff.binary ? <p className="muted small">Binary file; no text diff.</p> : diff.diff.trim() === "" ? <p className="muted small">No textual changes (mode or whitespace only).</p> : <DiffView diff={diff.diff} />}
          {diff?.truncated && <p className="muted small">Diff cut short because it is very large. Open the file to see everything.</p>}
        </div>
      )}
    </li>
  );
}

interface Props {
  chatId: string;
  status: GitStatus | null;
  error: string;
  loading: boolean;
  onRefresh: () => void;
  onClose: () => void;
  /** A reply is running: committing is paused so files are not changed underneath it. */
  busy?: boolean;
}

export function ChangesPanel({ chatId, status, error, loading, onRefresh, onClose, busy = false }: Props) {
  const staged = status?.files.filter((f) => f.staged && f.unstaged !== "conflicted") ?? [];
  const unstaged = status?.files.filter((f) => f.unstaged && f.unstaged !== "untracked" && f.unstaged !== "conflicted") ?? [];
  const untracked = status?.files.filter((f) => f.unstaged === "untracked") ?? [];
  const conflicts = status?.files.filter((f) => f.unstaged === "conflicted") ?? [];
  // Re-fetch open diffs when the status changes (an edit while the panel is open).
  const stale = status ? status.files.reduce((n, f) => n + f.additions * 31 + f.deletions * 17 + f.path.length, 0) : 0;
  const total = (status?.files.length ?? 0) + (status?.moreFiles ?? 0);

  const group = (title: string, files: ChangedFile[]) =>
    files.length ? (
      <section className="change-group" key={title}>
        <h3>{title} <span className="muted">({files.length})</span></h3>
        <ul>{files.map((f) => <FileRow key={`${title}:${f.path}`} chatId={chatId} f={f} stale={stale} />)}</ul>
      </section>
    ) : null;

  return (
    <aside className="changes-panel" aria-label="Changes">
      <header className="changes-head">
        <h2>Changes</h2>
        <span className="spacer" />
        <button className="icon-btn" aria-label="Refresh changes" title="Refresh" onClick={onRefresh} disabled={loading}>{loading ? "…" : "↻"}</button>
        <button className="icon-btn" aria-label="Close changes" title="Close" onClick={onClose}>✕</button>
      </header>
      {status?.repo && !status.problem && status.hasCommits && <BranchBar key={`branch-${chatId}`} chatId={chatId} status={status} busy={busy} onChanged={onRefresh} />}
      <div className="changes-body">
        {error && <p className="notice error" role="alert">{error}</p>}
        {!status && !error && <p className="muted small">Loading…</p>}
        {status && !status.repo && <p className="notice">{status.problem}</p>}
        {status?.repo && status.problem && <p className="notice error">{status.problem}</p>}
        {status?.repo && !status.problem && total === 0 && <p className="muted">No changes. The working tree is clean.</p>}
        {group("Conflicts", conflicts)}
        {group("Staged", staged)}
        {group("Unstaged", unstaged)}
        {group("Untracked", untracked)}
        {!!status?.moreFiles && <p className="muted small">…and {status.moreFiles} more files not shown. Commit them from a terminal, or in smaller groups.</p>}
      </div>
      {status?.repo && !status.problem && <CommitBox key={chatId} chatId={chatId} status={status} busy={busy} onDone={onRefresh} />}
      {status?.repo && !status.problem && status.hasCommits && !status.protectedBranch && <ShipBox key={`ship-${chatId}`} chatId={chatId} status={status} busy={busy} suggestedTitle={status.lastSubject || status.branch || ""} onDone={onRefresh} />}
    </aside>
  );
}
