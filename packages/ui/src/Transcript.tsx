import { IconPaperclip } from "./lib/icons.ts";
import { Attachments } from "./AttachmentView.tsx";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AgentCard } from "./AgentCard.tsx";
import { LazyMarkdown as Markdown } from "./LazyMarkdown.tsx";
import type { ApprovalDecision, SeqEvent } from "./api.ts";
import { buildBlocks, type Block } from "./blocks.ts";
import { ApprovalDone, ApprovalStack, type ApprovalBlock } from "./components/tool/approval.tsx";
import { ToolGroup } from "./components/tool/tool-group.tsx";
import type { Pending } from "./useChat.ts";
import { TID } from "./testids.ts";
import { Enter } from "./components/thread/Enter.tsx";
import { PromptBlock } from "./components/thread/PromptBlock.tsx";
import { ReplyActions } from "./components/thread/ReplyActions.tsx";
import { ScrollToBottom } from "./components/thread/ScrollToBottom.tsx";
import { WorkingRow } from "./components/thread/WorkingRow.tsx";
import { formatDuration, groupTurns, turnMs, type Turn } from "./components/thread/turns.ts";
import "./components/thread/thread.css";

/** Long chats render only the most recent events; older ones load on request. */
const WINDOW = 400;
const STICK_PX = 80;

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

interface Props {
  chatId?: string | null;
  events: SeqEvent[];
  streaming: string;
  busy: boolean;
  loaded: boolean;
  pending: Pending[];
  onAnswer: (id: string, d: ApprovalDecision) => void;
  onCopy: (text: string) => void;
  onRetry: (text: string) => void;
  onDismissPending: (id: number) => void;
  onResendPending: (p: Pending) => void;
  onSuggest: (text: string) => void;
  onOpenChat?: (id: string) => void;
}

const SUGGESTIONS = ["What can you do?", "Remember that I prefer short answers", "List the files in my home folder", "Help me write a reusable skill"];

export function Transcript(props: Props) {
  const { events, streaming, busy, loaded, pending } = props;
  const scroller = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const [atBottom, setAtBottom] = useState(true);
  const [missed, setMissed] = useState(false);
  const [approvalBelow, setApprovalBelow] = useState(false);
  const [shown, setShown] = useState(WINDOW);
  const grewBy = useRef<number | null>(null);
  // The blocks that were on screen when the chat loaded do not slide in again; only blocks that arrive later do.
  const seed = useRef<{ chat: string | null | undefined; keys: Set<string> } | null>(null);

  const visible = useMemo(() => events.slice(-shown), [events, shown]);
  const blocks = useMemo(() => buildBlocks(visible), [visible]);
  const turns = useMemo(() => groupTurns(blocks), [blocks]);
  if (loaded && (!seed.current || seed.current.chat !== props.chatId)) seed.current = { chat: props.chatId, keys: new Set(blocks.map((b) => b.key)) };
  const enterFor = (key: string) => !!seed.current && !seed.current.keys.has(key);

  const lastAssistant = useMemo(() => { for (let i = blocks.length - 1; i >= 0; i--) if (blocks[i].kind === "assistant") return i; return -1; }, [blocks]);
  const latestReply = lastAssistant >= 0 ? blocks[lastAssistant].key : "";
  const lastUser = useMemo(() => { for (let i = blocks.length - 1; i >= 0; i--) { const b = blocks[i]; if (b.kind === "user") return b.text; } return ""; }, [blocks]);
  const runningTool = useMemo(() => { for (let i = blocks.length - 1; i >= 0; i--) { const b = blocks[i]; if (b.kind === "tools") { const t = b.items.find((x) => x.ok === undefined); if (t) return t.name; } } return undefined; }, [blocks]);
  const approvalOpen = useMemo(() => busy && blocks.some((b) => b.kind === "approval" && !b.decision), [blocks, busy]);
  // Live approvals are answered from the stack at the bottom; the transcript keeps only their settled lines.
  const pendingApprovals = useMemo(() => (busy ? blocks.filter((b): b is ApprovalBlock => b.kind === "approval" && !b.decision) : []), [blocks, busy]);

  const toBottom = useCallback((smooth = false) => {
    const el = scroller.current;
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth && !reduce ? "smooth" : "auto" });
    stick.current = true;
    setAtBottom(true);
    setMissed(false);
  }, []);

  // Whether a pending approval card sits below the viewport, so the pill can say so.
  const refreshApproval = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    const below = [...el.querySelectorAll<HTMLElement>('[data-approval-pending="true"]')].some((n) => {
      const r = n.getBoundingClientRect();
      return r.height > 0 && r.top >= box.bottom;
    });
    setApprovalBelow(below);
  }, []);

  // New chat or first load: start at the bottom.
  useLayoutEffect(() => { if (loaded) toBottom(); }, [loaded, toBottom]);

  // Follow new content only while the reader is at the bottom; otherwise show the pill with "New" state.
  const prevPending = useRef(0);
  useLayoutEffect(() => {
    // Sending a message always brings you to it, wherever you had scrolled to.
    const ownSend = pending.length > prevPending.current;
    prevPending.current = pending.length;
    if (grewBy.current !== null && scroller.current) {
      scroller.current.scrollTop += scroller.current.scrollHeight - grewBy.current;
      grewBy.current = null;
      return;
    }
    if (ownSend || stick.current) toBottom();
    else setMissed(true);
    refreshApproval();
  }, [events.length, streaming, pending.length, toBottom, refreshApproval, approvalOpen]);

  // Markdown, images and expanding rows change the height without changing the event count.
  useEffect(() => {
    const el = inner.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => { if (stick.current) toBottom(); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [toBottom]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    // Scrolling up escapes the follow; coming back to the bottom re-engages it.
    const near = el.scrollHeight - el.clientHeight - el.scrollTop < STICK_PX;
    stick.current = near;
    setAtBottom(near);
    if (near) setMissed(false);
    refreshApproval();
  };

  const hidden = events.length - visible.length;
  const showEarlier = () => {
    grewBy.current = scroller.current?.scrollHeight ?? null;
    setShown((n) => n + WINDOW);
  };

  const empty = loaded && events.length === 0 && pending.length === 0;
  const lastTurn = turns.length - 1;

  const renderBlock = (b: Block, i: number, turn: Turn, ti: number, lastInTurn: number) => {
    const enabled = enterFor(b.key);
    switch (b.kind) {
      case "assistant": {
        const isLastReply = i === lastInTurn;
        const dur = isLastReply && !(busy && ti === lastTurn) ? turnMs(turn) : undefined;
        return (
          <Enter key={b.key} id={b.key} enabled={enabled} className="reply" testId={TID.assistantMessage}>
            <div className="assistant" data-testid={TID.assistantBlock}><Markdown text={b.text} /></div>
            <ReplyActions
              duration={dur !== undefined ? formatDuration(dur) : undefined}
              onCopy={() => props.onCopy(b.text)}
              onRetry={!busy && b.key === latestReply && lastUser ? () => props.onRetry(lastUser) : undefined}
            />
          </Enter>
        );
      }
      case "tools":
        return <Enter key={b.key} id={b.key} enabled={enabled} className="scaffold"><ToolGroup items={b.items} /></Enter>;
      case "approval":
        if (busy && !b.decision) return null;
        return <Enter key={b.key} id={b.key} enabled={enabled} className="block"><ApprovalDone b={b} /></Enter>;
      case "agent":
        return <Enter key={b.key} id={b.key} enabled={enabled} className="scaffold"><AgentCard run={b.run} onOpenChat={props.onOpenChat} /></Enter>;
      case "notice":
        return <Enter key={b.key} id={b.key} enabled={enabled} className={`notice ${b.tone}`}><div role={b.tone === "error" ? "alert" : undefined}>{b.text}</div></Enter>;
      default:
        return null;
    }
  };

  return (
    <div className="transcript-wrap">
      <div className="transcript" data-testid={TID.transcript} ref={scroller} onScroll={onScroll} role="log" aria-label="Conversation" aria-live="off" tabIndex={-1}>
        <div className="transcript-inner" ref={inner}>
          {!loaded && <div className="skeleton" aria-label="Loading chat"><i /><i /><i /></div>}
          {empty && (
            <div className="empty">
              <div className="empty-mark">Pheme</div>
              <div className="empty-title">What can I help with?</div>
              <div className="suggestions">
                {SUGGESTIONS.map((s) => <button key={s} className="chip" onClick={() => props.onSuggest(s)}>{s}</button>)}
              </div>
            </div>
          )}
          {hidden > 0 && <button className="btn load-earlier" onClick={showEarlier}>Show {Math.min(WINDOW, hidden)} earlier messages <span className="muted">({hidden} hidden events)</span></button>}
          {turns.map((turn, ti) => {
            let lastInTurn = -1;
            turn.body.forEach((b, i) => { if (b.kind === "assistant") lastInTurn = i; });
            return (
              <div key={turn.key} className="turn" data-testid={TID.turn}>
                {turn.user && (
                  <PromptBlock id={turn.user.key} enabled={enterFor(turn.user.key)}
                    footer={turn.user.attachments ? <div className="turn-attachments"><Attachments chatId={props.chatId ?? null} items={turn.user.attachments} /></div> : undefined}>
                    {turn.user.text}
                  </PromptBlock>
                )}
                {turn.body.map((b, i) => renderBlock(b, i, turn, ti, lastInTurn))}
              </div>
            );
          })}
          {pending.map((p) => (
            <div key={`p${p.id}`} className="turn">
              <PromptBlock id={`p${p.id}`} enabled pending failed={!!p.failed}
                footer={
                  <div className="turn-status">
                    {p.files?.length ? <ul className="att-list" aria-label="Attachments being sent">{p.files.map((n, i) => <li key={i}><span className="att-chip"><IconPaperclip className="inline size-3.5 align-[-2px]" aria-hidden="true" /> {n}</span></li>)}</ul> : null}
                    {p.failed ? (
                      <div className="msg-actions show">
                        <span className="over small">Not sent: {p.failed}</span>
                        {!p.files?.length && <button className="icon-btn" onClick={() => props.onResendPending(p)}>Retry</button>}
                        <button className="icon-btn" onClick={() => props.onDismissPending(p.id)}>Dismiss</button>
                      </div>
                    ) : <div className="muted small">Sending…</div>}
                  </div>
                }>
                {p.text}
              </PromptBlock>
            </div>
          ))}
          {streaming && (
            <div className="turn">
              <div className="reply streaming" data-testid={TID.assistantBlock} aria-busy="true"><Markdown text={streaming} /></div>
            </div>
          )}
          <ApprovalStack items={pendingApprovals} onAnswer={props.onAnswer} />
          {busy && <WorkingRow hint={approvalOpen ? "Waiting for your approval" : runningTool ? `Running ${runningTool}` : "Working"} />}
        </div>
      </div>
      {!atBottom && <ScrollToBottom approvalBelow={approvalBelow} unseen={missed} onClick={() => toBottom(true)} />}
    </div>
  );
}
