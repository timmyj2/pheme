import type { ReactNode } from "react";
import { IconCheck, IconCircleFilled, IconX } from "./lib/icons.ts";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, type GitStatus, type RemoteInfo } from "./api.ts";
import { PrDetails } from "./PrDetails.tsx";
import { useToast } from "./toast.tsx";

interface Props {
  chatId: string;
  status: GitStatus;
  busy: boolean;
  /** Suggested pull request title (the last commit's subject or the branch name). */
  suggestedTitle: string;
  onDone: () => void;
}

const CHECKS: Record<string, string> = { passing: "Checks passing", failing: "Checks failing", pending: "Checks running", none: "No checks" };
const CHECK_ICON: Record<string, ReactNode> = {
  passing: <IconCheck className="mr-1 inline size-3 align-[-2px]" aria-hidden="true" />,
  failing: <IconX className="mr-1 inline size-3 align-[-2px]" aria-hidden="true" />,
  pending: <IconCircleFilled className="mr-1 inline size-2 align-[-1px]" aria-hidden="true" />,
};

/** Push the branch and open a pull request. Every step asks first; nothing is forced. */
export function ShipBox({ chatId, status, busy, suggestedTitle, onDone }: Props) {
  const toast = useToast();
  const [info, setInfo] = useState<RemoteInfo | null>(null);
  const [loadError, setLoadError] = useState("");
  const [working, setWorking] = useState<"" | "push" | "pr">("");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<"" | "push" | "pr">("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [draft, setDraft] = useState(false);
  const [titleEdited, setTitleEdited] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const i = await api.gitRemote(chatId);
      if (mine !== seq.current) return;
      setInfo(i);
      setLoadError("");
    } catch (e) {
      if (mine === seq.current) setLoadError((e as Error).message);
    }
  }, [chatId]);

  // Reload when the branch or its ahead/behind count changes (a commit, a push), and once a minute while the box is open (CI status; each check makes a few GitHub calls).
  const key = `${status.branch}|${status.ahead}|${status.behind}|${status.upstream}`;
  useEffect(() => { void load(); }, [load, key]);
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 60000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => { if (!titleEdited) setTitle(suggestedTitle); }, [suggestedTitle, titleEdited]);

  if (loadError) return <div className="ship-box"><p className="notice error" role="alert">{loadError}</p></div>;
  if (!info) return <div className="ship-box"><p className="muted small">Checking the remote…</p></div>;
  if (info.problem) return <div className="ship-box"><p className="muted small">{info.problem}</p></div>;

  const unpushed = !info.upstream || info.ahead > 0;
  const canPr = info.github && info.ghInstalled && info.ghSignedIn && !info.pr && !unpushed;
  const wait = busy ? "A reply is running. Wait for it to finish, or stop it." : "";

  const push = async () => {
    setWorking("push");
    setError("");
    try {
      const r = await api.gitPush(chatId);
      toast.info(`Pushed ${r.branch} to ${r.remote}`);
      setConfirm("");
      await load();
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setConfirm("");
    } finally {
      setWorking("");
    }
  };

  const createPr = async () => {
    setWorking("pr");
    setError("");
    try {
      const r = await api.gitPr(chatId, { title, body, draft });
      toast.info(`Opened pull request${r.number ? ` #${r.number}` : ""}`);
      setConfirm("");
      setTitleEdited(false);
      setBody("");
      await load();
    } catch (e) {
      setError((e as Error).message);
      setConfirm("");
    } finally {
      setWorking("");
    }
  };

  return (
    <div className="ship-box">
      <h3>Push and pull request</h3>
      <p className="muted small">
        {info.branch} → {info.remote}
        {info.upstream ? (info.ahead || info.behind ? ` · ${info.ahead ? `${info.ahead} to push` : ""}${info.ahead && info.behind ? ", " : ""}${info.behind ? `${info.behind} behind` : ""}` : " · up to date") : " · not pushed yet"}
      </p>
      {error && <p className="notice error" role="alert">{error}</p>}

      {unpushed && confirm !== "push" && (
        <button className="btn" disabled={!!wait || working !== ""} title={wait} onClick={() => setConfirm("push")}>Push {info.branch}…</button>
      )}
      {confirm === "push" && (
        <div className="approval" role="group" aria-label="Confirm push">
          <strong>Push {info.branch} to {info.remote}?</strong>
          <span className="muted small">Pheme never force-pushes.</span>
          <div className="row">
            <button className="btn primary" disabled={working !== ""} onClick={() => void push()}>{working === "push" ? "Pushing…" : "Push"}</button>
            <button className="btn" disabled={working !== ""} onClick={() => setConfirm("")}>Cancel</button>
          </div>
        </div>
      )}
      {info.behind > 0 && <p className="muted small">GitHub has {info.behind} commit{info.behind === 1 ? "" : "s"} you do not. If a push is rejected, pull or rebase in a terminal first.</p>}

      {info.pr ? (
        <div className="pr-card">
          <a href={info.pr.url} target="_blank" rel="noreferrer noopener">#{info.pr.number} {info.pr.title}</a>
          <span className={`checks ${info.pr.checks}`}>{info.pr.draft ? "Draft · " : ""}{CHECK_ICON[info.pr.checks]}{CHECKS[info.pr.checks]}</span>
          <PrDetails chatId={chatId} number={info.pr.number} />
        </div>
      ) : canPr ? (
        <>
          {confirm !== "pr" && <button className="btn primary" disabled={!!wait || working !== ""} title={wait} onClick={() => setConfirm("pr")}>Open pull request…</button>}
          {confirm === "pr" && (
            <div className="approval pr-form" role="group" aria-label="Confirm pull request">
              <strong>Open a pull request: {info.branch} → {info.defaultBase}</strong>
              <input aria-label="Pull request title" value={title} maxLength={256} onChange={(e) => { setTitle(e.target.value); setTitleEdited(true); }} />
              <textarea aria-label="Pull request description" rows={4} value={body} placeholder="Description (optional)" onChange={(e) => setBody(e.target.value)} />
              <label className="check"><input type="checkbox" checked={draft} onChange={(e) => setDraft(e.target.checked)} /> Open as a draft</label>
              <div className="row">
                <button className="btn primary" disabled={working !== "" || !title.trim()} onClick={() => void createPr()}>{working === "pr" ? "Opening…" : "Open pull request"}</button>
                <button className="btn" disabled={working !== ""} onClick={() => setConfirm("")}>Cancel</button>
              </div>
            </div>
          )}
        </>
      ) : (
        <p className="muted small">
          {!info.github ? "Pull requests are for GitHub remotes." : !info.ghInstalled ? "The GitHub CLI (gh) is not installed." : !info.ghSignedIn ? "The GitHub CLI is not signed in. Run gh auth login in a terminal." : unpushed ? "Push the branch to open a pull request." : ""}
          {info.compareUrl && (!info.ghInstalled || !info.ghSignedIn) && !unpushed && <> <a href={info.compareUrl} target="_blank" rel="noreferrer noopener">Open it on GitHub instead</a>.</>}
        </p>
      )}
    </div>
  );
}
