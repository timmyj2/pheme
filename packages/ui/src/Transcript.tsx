import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AgentCard } from "./AgentCard.tsx";
import { Markdown } from "./Markdown.tsx";
import type { ApprovalDecision, SeqEvent } from "./api.ts";
import { APPROVAL_LABEL, buildBlocks, toolDuration, toolSummary, type Block, type ToolItem } from "./blocks.ts";
import type { Pending } from "./useChat.ts";

/** Long chats render only the most recent events; older ones load on request. */
const WINDOW = 400;
const STICK_PX = 80;

const clock = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

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

const Row = memo(function ToolRow({ t }: { t: ToolItem }) {
  const [open, setOpen] = useState(false);
  const state = t.ok === undefined ? "running" : t.ok ? "ok" : "failed";
  return (
    <div className="tool-row" data-state={state}>
      <button className="tool-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="tool-dot" aria-hidden />
        <span className="tool-name">{t.name}</span>
        <span className="tool-sum">{toolSummary(t.name, t.args)}</span>
        <span className="tool-state">{state}{toolDuration(t) ? ` · ${toolDuration(t)}` : ""}</span>
      </button>
      {open && <pre className="tool-body">{JSON.stringify(t.args, null, 2)}{t.result !== undefined ? `\n\n→ ${t.result}` : ""}</pre>}
    </div>
  );
});

const ToolGroup = memo(function ToolGroup({ items }: { items: ToolItem[] }) {
  const running = items.some((i) => i.ok === undefined);
  const failed = items.filter((i) => i.ok === false).length;
  const [open, setOpen] = useState(false);
  if (items.length <= 3) return <div className="tool-group">{items.map((t) => <Row key={t.id} t={t} />)}</div>;
  const expanded = open;
  return (
    <div className="tool-group">
      <button className="tool-summary" onClick={() => setOpen(!open)} aria-expanded={expanded}>
        <span className="chev" aria-hidden>{expanded ? "▾" : "▸"}</span>
        {items.length} tool calls
        {running ? " · running" : ""}
        {failed ? ` · ${failed} failed` : ""}
      </button>
      {expanded && items.map((t) => <Row key={t.id} t={t} />)}
    </div>
  );
});

function Approval({ b, live, onAnswer }: { b: Extract<Block, { kind: "approval" }>; live: boolean; onAnswer: (id: string, d: ApprovalDecision) => void }) {
  if (b.decision || !live) {
    return <div className="approval-done muted small">{b.decision ? APPROVAL_LABEL[b.decision] : "Approval expired"} · {b.title}: <code>{b.detail.slice(0, 140)}</code></div>;
  }
  return (
    <div className="approval" role="alertdialog" aria-label={b.title}>
      <div className="approval-title">{b.title}</div>
      <pre className="approval-detail">{b.detail}</pre>
      <div className="approval-actions">
        <button className="btn primary" onClick={() => onAnswer(b.id, "once")}>Allow once</button>
        <button className="btn" onClick={() => onAnswer(b.id, "chat")}>Allow for this chat</button>
        <button className="btn danger" onClick={() => onAnswer(b.id, "deny")}>Deny</button>
      </div>
    </div>
  );
}

function Actions({ ts, onCopy, onRetry }: { ts?: number; onCopy: () => void; onRetry?: () => void }) {
  return (
    <div className="msg-actions">
      <button className="icon-btn" onClick={onCopy} aria-label="Copy message" title="Copy">⧉ Copy</button>
      {onRetry && <button className="icon-btn" onClick={onRetry} aria-label="Try again" title="Send the last message again">↻ Try again</button>}
      {ts ? <time className="muted small" dateTime={new Date(ts).toISOString()} title={new Date(ts).toLocaleString()}>{clock(ts)}</time> : null}
    </div>
  );
}

interface Props {
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
  const [shown, setShown] = useState(WINDOW);
  const grewBy = useRef<number | null>(null);

  const visible = useMemo(() => events.slice(-shown), [events, shown]);
  const blocks = useMemo(() => buildBlocks(visible), [visible]);
  const lastAssistant = useMemo(() => { for (let i = blocks.length - 1; i >= 0; i--) if (blocks[i].kind === "assistant") return i; return -1; }, [blocks]);
  const lastUser = useMemo(() => { for (let i = blocks.length - 1; i >= 0; i--) { const b = blocks[i]; if (b.kind === "user") return b.text; } return ""; }, [blocks]);

  const toBottom = useCallback((smooth = false) => {
    const el = scroller.current;
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth && !reduce ? "smooth" : "auto" });
    stick.current = true;
    setAtBottom(true);
    setMissed(false);
  }, []);

  // New chat or first load: start at the bottom.
  useLayoutEffect(() => { if (loaded) toBottom(); }, [loaded, toBottom]);

  // Follow new content only while the reader is at the bottom; otherwise show "Jump to latest".
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
  }, [events.length, streaming, pending.length, toBottom]);

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
    const near = el.scrollHeight - el.clientHeight - el.scrollTop < STICK_PX;
    stick.current = near;
    setAtBottom(near);
    if (near) setMissed(false);
  };

  const hidden = events.length - visible.length;
  const showEarlier = () => {
    grewBy.current = scroller.current?.scrollHeight ?? null;
    setShown((n) => n + WINDOW);
  };

  const empty = loaded && events.length === 0 && pending.length === 0;

  return (
    <div className="transcript-wrap">
      <div className="transcript" ref={scroller} onScroll={onScroll} role="log" aria-label="Conversation" aria-live="off" tabIndex={-1}>
        <div className="transcript-inner" ref={inner}>
          {!loaded && <div className="skeleton" aria-label="Loading chat"><i /><i /><i /></div>}
          {empty && (
            <div className="empty">
              <div className="empty-title">What can I help with?</div>
              <div className="suggestions">
                {SUGGESTIONS.map((s) => <button key={s} className="chip" onClick={() => props.onSuggest(s)}>{s}</button>)}
              </div>
            </div>
          )}
          {hidden > 0 && <button className="btn load-earlier" onClick={showEarlier}>Show {Math.min(WINDOW, hidden)} earlier ({hidden} hidden events)</button>}
          {blocks.map((b, i) => {
            switch (b.kind) {
              case "user":
                return (
                  <div key={b.key} className="msg user-msg">
                    <div className="bubble user">{b.text}</div>
                    <Actions ts={b.ts} onCopy={() => props.onCopy(b.text)} />
                  </div>
                );
              case "assistant":
                return (
                  <div key={b.key} className="msg assistant-msg">
                    <div className="assistant"><Markdown text={b.text} /></div>
                    <Actions ts={b.ts} onCopy={() => props.onCopy(b.text)} onRetry={!busy && i === lastAssistant && lastUser ? () => props.onRetry(lastUser) : undefined} />
                  </div>
                );
              case "tools":
                return <ToolGroup key={b.key} items={b.items} />;
              case "approval":
                return <Approval key={b.key} b={b} live={busy} onAnswer={props.onAnswer} />;
              case "agent":
                return <AgentCard key={b.key} run={b.run} onOpenChat={props.onOpenChat} />;
              case "notice":
                return <div key={b.key} className={`notice ${b.tone}`} role={b.tone === "error" ? "alert" : undefined}>{b.text}</div>;
            }
          })}
          {pending.map((p) => (
            <div key={`p${p.id}`} className={`msg user-msg pending${p.failed ? " failed" : ""}`}>
              <div className="bubble user">{p.text}</div>
              {p.failed ? (
                <div className="msg-actions show">
                  <span className="over small">Not sent: {p.failed}</span>
                  <button className="icon-btn" onClick={() => props.onResendPending(p)}>Retry</button>
                  <button className="icon-btn" onClick={() => props.onDismissPending(p.id)}>Dismiss</button>
                </div>
              ) : <div className="msg-actions show muted small">Sending…</div>}
            </div>
          ))}
          {streaming && <div className="assistant streaming" aria-busy="true"><Markdown text={streaming} /></div>}
          {busy && !streaming && <div className="thinking" role="status" aria-label="Pheme is working"><span /><span /><span /></div>}
        </div>
      </div>
      {!atBottom && (
        <button className={`jump${missed ? " new" : ""}`} onClick={() => toBottom(true)} aria-label="Jump to the latest message">
          ↓ {missed ? "New messages" : "Latest"}
        </button>
      )}
    </div>
  );
}
