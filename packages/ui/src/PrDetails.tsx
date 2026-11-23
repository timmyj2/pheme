import { useCallback, useEffect, useRef, useState } from "react";
import { api, type PrCheck, type PrDetail } from "./api.ts";

const MARK: Record<PrCheck["state"], string> = { passing: "✓", failing: "✗", pending: "●", skipped: "–" };
const WORD: Record<PrCheck["state"], string> = { passing: "passed", failing: "failed", pending: "running", skipped: "skipped" };

export function reviewText(r: PrDetail["review"]): string {
  return r === "approved" ? "Approved" : r === "changes_requested" ? "Changes requested" : r === "review_required" ? "Review required" : "No review yet";
}

export function mergeText(pr: Pick<PrDetail, "state" | "mergeable" | "mergeState" | "draft">): string {
  if (pr.state === "merged") return "Merged";
  if (pr.state === "closed") return "Closed";
  if (pr.draft) return "Draft: not ready to merge";
  if (pr.mergeable === "conflicting") return "Has merge conflicts";
  if (pr.mergeState === "behind") return "Behind the base branch";
  if (pr.mergeState === "blocked") return "Blocked until requirements are met";
  if (pr.mergeState === "unstable") return "Some checks are not passing";
  if (pr.mergeable === "mergeable") return "Ready to merge";
  return "Merge status not known yet";
}

/** Checks, review and merge state for the branch's pull request. Looks again every 20 s while checks are running. */
export function PrDetails({ chatId, number }: { chatId: string; number: number }) {
  const [pr, setPr] = useState<PrDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true);
    try {
      const r = await api.gitPrDetail(chatId);
      if (mine !== seq.current) return;
      setPr(r.pr);
      setError("");
    } catch (e) {
      if (mine === seq.current) setError((e as Error).message);
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [chatId]);

  useEffect(() => { setPr(null); void load(); }, [load, number]);
  const pending = pr?.checksSummary === "pending" && pr.state === "open";
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 20000);
    return () => clearInterval(t);
  }, [pending, load]);

  if (error && !pr) return <p className="notice error small" role="alert">{error} <button className="link" onClick={() => void load()}>Try again</button></p>;
  if (!pr) return <p className="muted small">Loading checks…</p>;

  const bad = pr.checks.filter((c) => c.state === "failing" || c.state === "pending");
  const rest = pr.checks.filter((c) => c.state === "passing" || c.state === "skipped");
  const shown = showAll ? pr.checks : bad;
  const counts = pr.checks.reduce<Record<string, number>>((m, c) => ({ ...m, [c.state]: (m[c.state] ?? 0) + 1 }), {});

  return (
    <div className="pr-details" aria-label={`Pull request #${pr.number} details`}>
      <div className="pr-badges">
        <span className={`pr-badge ${pr.state}`}>{pr.state === "open" ? (pr.draft ? "Draft" : "Open") : pr.state === "merged" ? "Merged" : "Closed"}</span>
        <span className={`pr-badge review-${pr.review}`}>{reviewText(pr.review)}</span>
        <span className={`pr-badge merge-${pr.state === "open" && pr.mergeable === "conflicting" ? "bad" : "info"}`}>{mergeText(pr)}</span>
      </div>
      <p className="muted small">{pr.head} → {pr.base} · {pr.changedFiles} file{pr.changedFiles === 1 ? "" : "s"} · <span className="add">+{pr.additions}</span> <span className="del">−{pr.deletions}</span></p>
      {pr.checks.length === 0 ? <p className="muted small">No checks have reported yet.</p> : (
        <>
          <p className="small" role="status">
            {counts.failing ? `${counts.failing} failed` : ""}{counts.failing && (counts.pending || counts.passing) ? " · " : ""}
            {counts.pending ? `${counts.pending} running` : ""}{counts.pending && counts.passing ? " · " : ""}
            {counts.passing ? `${counts.passing} passed` : ""}{counts.skipped ? ` · ${counts.skipped} skipped` : ""}
          </p>
          <ul className="pr-checks">
            {shown.map((c) => (
              <li key={`${c.workflow ?? ""}|${c.name}`} className={`chk ${c.state}`}>
                <span aria-hidden="true">{MARK[c.state]}</span>
                <span className="sr-only">{WORD[c.state]}: </span>
                {c.url ? <a href={c.url} target="_blank" rel="noreferrer noopener">{c.name}</a> : <span>{c.name}</span>}
                {c.workflow && <span className="muted small"> · {c.workflow}</span>}
              </li>
            ))}
          </ul>
          {rest.length > 0 && <button className="link small" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>{showAll ? "Show only checks that need attention" : `Show all ${pr.checks.length} checks`}</button>}
          {pr.moreChecks > 0 && showAll && <p className="muted small">{pr.moreChecks} more not shown. See them on GitHub.</p>}
        </>
      )}
      <div className="row">
        <a className="btn small" href={pr.url} target="_blank" rel="noreferrer noopener">Open on GitHub</a>
        <button className="btn small" disabled={loading} onClick={() => void load()}>{loading ? "Refreshing…" : "Refresh"}</button>
      </div>
    </div>
  );
}
