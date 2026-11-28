import { useCallback, useEffect, useRef, useState } from "react";
import { api, type BranchList, type GitStatus, type StashEntry } from "./api.ts";
import { useToast } from "./toast.tsx";
import { TID } from "./testids.ts";

interface Props {
  chatId: string;
  status: GitStatus;
  /** A reply is running: files may be changing, so branch and stash actions are paused. */
  busy: boolean;
  onChanged: () => void;
}

export function ago(unixSeconds: number, now = Date.now()): string {
  const s = Math.max(0, Math.floor(now / 1000 - unixSeconds));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

/** Switch branches, make a branch, and set work aside (stash). Nothing runs without a click; risky steps ask first. */
export function BranchBar({ chatId, status, busy, onChanged }: Props) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<BranchList | null>(null);
  const [stashes, setStashes] = useState<{ stashes: StashEntry[]; more: number } | null>(null);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [filter, setFilter] = useState("");
  const [newName, setNewName] = useState("");
  const [note, setNote] = useState("");
  const [needStash, setNeedStash] = useState("");
  const [confirmDrop, setConfirmDrop] = useState("");
  const seq = useRef(0);
  const wait = busy ? "A reply is running. Wait for it to finish, or stop it." : "";

  const load = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const [b, s] = await Promise.all([api.gitBranches(chatId), api.gitStashes(chatId)]);
      if (mine !== seq.current) return;
      setList(b); setStashes(s); setError("");
    } catch (e) {
      if (mine === seq.current) setError((e as Error).message);
    }
  }, [chatId]);

  // Reload when opened, and when the branch changes underneath (a commit or switch somewhere else).
  useEffect(() => { if (open) void load(); }, [open, load, status.branch, status.files.length]);

  const run = async (fn: () => Promise<string>) => {
    setWorking(true); setError("");
    try {
      toast.info(await fn());
      setNeedStash(""); setConfirmDrop("");
      await load();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  };

  const switchTo = (name: string, stash = false) => run(async () => {
    try {
      const r = await api.gitSwitch(chatId, { name, stash });
      return `Switched to ${r.branch}${r.stashed ? ". Your changes are in the stash list." : ""}`;
    } catch (e) {
      if (!stash && /would be overwritten/i.test((e as Error).message)) { setNeedStash(name); throw new Error(""); }
      throw e;
    }
  });

  const shown = (list?.branches ?? []).filter((b) => b.name.toLowerCase().includes(filter.trim().toLowerCase()));
  const dirty = status.files.length > 0;

  return (
    <div className="branch-bar">
      <button className="branch-pill" data-testid={TID.branchPill} aria-expanded={open} aria-controls="branch-panel" onClick={() => setOpen((o) => !o)}>
        <span aria-hidden="true">⎇</span> {status.detached ? "detached HEAD" : status.branch ?? "no branch"}
        <span className="muted small"> · branches and stash {open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div id="branch-panel" className="branch-panel">
          {error && <p className="notice error" role="alert">{error}</p>}
          {needStash && (
            <div className="approval" role="group" aria-label="Confirm stash and switch">
              <strong>Your unsaved changes would be overwritten by {needStash}.</strong>
              <span className="muted small">Pheme can set them aside (stash), switch, and you can restore them later from the stash list. Nothing is deleted.</span>
              <div className="row">
                <button className="btn primary" disabled={working} onClick={() => void switchTo(needStash, true)}>Set aside and switch</button>
                <button className="btn" disabled={working} onClick={() => setNeedStash("")}>Cancel</button>
              </div>
            </div>
          )}
          <h3>Branches</h3>
          <input aria-label="Filter branches" placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          {!list ? <p className="muted small">Loading…</p> : shown.length === 0 ? <p className="muted small">No branch matches.</p> : (
            <ul className="branch-list">
              {shown.map((b) => (
                <li key={b.name}>
                  <button className="branch-item" aria-current={b.current ? "true" : undefined} disabled={b.current || working || !!wait} title={wait || b.subject} onClick={() => void switchTo(b.name)}>
                    <span className="branch-name">{b.current ? "● " : ""}{b.name}</span>
                    <span className="muted small">{b.subject} · {ago(b.date)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {list && list.more > 0 && <p className="muted small">{list.more} more branches not shown. Use the filter.</p>}
          <form className="row" onSubmit={(e) => { e.preventDefault(); if (newName.trim()) void run(async () => { const r = await api.gitSwitch(chatId, { name: newName.trim(), create: true }); setNewName(""); return `Created and switched to ${r.branch}`; }); }}>
            <input aria-label="Branch to create from here" placeholder="New branch from here…" value={newName} maxLength={200} onChange={(e) => setNewName(e.target.value)} />
            <button className="btn" type="submit" disabled={working || !!wait || !newName.trim()} title={wait}>Create</button>
          </form>

          <h3>Stash <span className="muted small">(work set aside)</span></h3>
          <form className="row" onSubmit={(e) => { e.preventDefault(); void run(async () => { await api.gitStashPush(chatId, { message: note }); setNote(""); return "Changes set aside"; }); }}>
            <input aria-label="Stash note" placeholder="Note (optional)" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
            <button className="btn" type="submit" disabled={working || !!wait || !dirty} title={wait || (dirty ? "" : "There are no changes to set aside")}>Set aside {dirty ? status.files.length : 0}</button>
          </form>
          {stashes && stashes.stashes.length === 0 && <p className="muted small">Nothing set aside.</p>}
          <ul className="stash-list">
            {(stashes?.stashes ?? []).map((s) => (
              <li key={s.sha} data-testid={TID.stashItem}>
                <div className="stash-info"><span>{s.message}</span><span className="muted small">{s.branch ? `from ${s.branch} · ` : ""}{ago(s.date)}</span></div>
                {confirmDrop === s.sha ? (
                  <div className="row" role="group" aria-label="Confirm delete stash">
                    <span className="small">Delete this for good?</span>
                    <button className="btn danger small" disabled={working} onClick={() => void run(async () => { await api.gitStashDrop(chatId, s.sha); return "Stash deleted"; })}>Delete</button>
                    <button className="btn small" disabled={working} onClick={() => setConfirmDrop("")}>Keep</button>
                  </div>
                ) : (
                  <div className="row">
                    <button className="btn small" disabled={working || !!wait} title={wait} aria-label={`Restore stash: ${s.message}`} onClick={() => void run(async () => { const r = await api.gitStashApply(chatId, s.sha, true); return r.dropped ? "Changes restored" : "Changes restored (the stash was kept)"; })}>Restore</button>
                    <button className="btn small" disabled={working} aria-label={`Delete stash: ${s.message}`} onClick={() => setConfirmDrop(s.sha)}>Delete…</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {stashes && stashes.more > 0 && <p className="muted small">{stashes.more} older stashes not shown.</p>}
        </div>
      )}
    </div>
  );
}
