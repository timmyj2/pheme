import { useCallback, useEffect, useRef, useState } from "react";
import { api, type ApprovalDecision, type SeqEvent } from "./api.ts";
import { AgentCard } from "./AgentCard.tsx";
import { Markdown } from "./markdown.tsx";

export function useChat(chatId: string, onTurnEnd: () => void) {
  const [events, setEvents] = useState<SeqEvent[]>([]);
  const [streaming, setStreaming] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef(onTurnEnd);
  endRef.current = onTurnEnd;

  useEffect(() => {
    let es: EventSource | undefined;
    let dead = false;
    setEvents([]);
    setStreaming("");
    setError("");
    api.chat(chatId).then((c) => {
      if (dead) return;
      setEvents(c.events);
      setBusy(c.busy);
      const last = c.events.length ? c.events[c.events.length - 1].seq : 0;
      es = new EventSource(api.eventsUrl(chatId, last));
      es.onmessage = (m) => {
        const e = JSON.parse(m.data) as SeqEvent;
        if (e.type === "delta") return setStreaming((s) => s + e.text);
        if (e.type === "message") setStreaming("");
        if (e.type === "turn_start") setBusy(true);
        if (e.type === "idle") {
          setBusy(false);
          setStreaming("");
          endRef.current();
        }
        setEvents((prev) => (prev.some((p) => p.seq === e.seq) ? prev : [...prev, e]));
      };
    }).catch((e: Error) => setError(e.message));
    return () => {
      dead = true;
      es?.close();
    };
  }, [chatId]);

  const send = useCallback(async (text: string) => {
    setError("");
    try {
      await api.send(chatId, text);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [chatId]);

  return { events, streaming, busy, error, send, stop: () => api.stop(chatId) };
}

function ToolRow({ start, end }: { start: Extract<SeqEvent, { type: "tool_start" }>; end?: Extract<SeqEvent, { type: "tool_end" }> }) {
  const [open, setOpen] = useState(false);
  const a = start.args as Record<string, unknown> | undefined;
  const summary = a && typeof a === "object" ? String(a.detail ?? a.command ?? a.path ?? a.name ?? a.action ?? a.content ?? "").slice(0, 80) : "";
  const state = !end ? "running" : end.ok ? "ok" : "failed";
  return (
    <div className="tool-row" data-state={state}>
      <button className="tool-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="tool-dot" />
        <span className="tool-name">{start.name}</span>
        <span className="tool-sum">{summary}</span>
        <span className="tool-state">{state}</span>
      </button>
      {open && (
        <pre className="tool-body">{JSON.stringify(start.args, null, 2)}{end ? `\n\n→ ${end.result}` : ""}</pre>
      )}
    </div>
  );
}

function ApprovalCard({ ev, onAnswer }: { ev: Extract<SeqEvent, { type: "approval_request" }>; onAnswer: (d: ApprovalDecision) => void }) {
  return (
    <div className="approval" role="alertdialog" aria-label={ev.title}>
      <div className="approval-title">{ev.title}</div>
      <pre className="approval-detail">{ev.detail}</pre>
      <div className="approval-actions">
        <button className="btn primary" onClick={() => onAnswer("once")}>Allow once</button>
        <button className="btn" onClick={() => onAnswer("chat")}>Allow for this chat</button>
        <button className="btn danger" onClick={() => onAnswer("deny")}>Deny</button>
      </div>
    </div>
  );
}

export function Transcript({ chatId, events, streaming, busy }: { chatId: string; events: SeqEvent[]; streaming: string; busy: boolean }) {
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [events.length, streaming]);
  const ends = new Map<string, Extract<SeqEvent, { type: "tool_end" }>>();
  const resolved = new Set<string>();
  const latestRun = new Map<string, Extract<SeqEvent, { type: "agent_update" }>>();
  const firstSeen = new Set<string>();
  for (const e of events) {
    if (e.type === "tool_end") ends.set(e.id, e);
    if (e.type === "approval_resolved") resolved.add(e.id);
    if (e.type === "agent_update") latestRun.set(e.run.id, e);
  }
  return (
    <div className="transcript">
      <div className="transcript-inner">
        {events.length === 0 && <div className="empty">What can I help with?</div>}
        {events.map((e) => {
          switch (e.type) {
            case "user":
              return <div key={e.seq} className="bubble user">{e.text}</div>;
            case "message":
              return <div key={e.seq} className="assistant"><Markdown text={e.text} /></div>;
            case "tool_start":
              return <ToolRow key={e.seq} start={e} end={ends.get(e.id)} />;
            case "approval_request":
              return !resolved.has(e.id) && busy ? <ApprovalCard key={e.seq} ev={e} onAnswer={(d) => void api.approve(chatId, e.id, d)} /> : null;
            case "agent_update": {
              if (firstSeen.has(e.run.id)) return null;
              firstSeen.add(e.run.id);
              return <AgentCard key={e.run.id} run={latestRun.get(e.run.id)!.run} />;
            }
            case "notice":
              return <div key={e.seq} className={`notice ${e.kind}`}>{e.text}</div>;
            case "error":
              return <div key={e.seq} className="notice error">{e.message}</div>;
            default:
              return null;
          }
        })}
        {streaming && <div className="assistant streaming"><Markdown text={streaming} /></div>}
        {busy && !streaming && <div className="thinking" aria-label="Working">●●●</div>}
        <div ref={bottom} />
      </div>
    </div>
  );
}

export function Composer({ busy, onSend, onStop }: { busy: boolean; onSend: (t: string) => void; onStop: () => void }) {
  const [text, setText] = useState("");
  const ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { ta.current?.focus(); }, []);
  const submit = () => {
    const t = text.trim();
    if (!t || busy) return;
    onSend(t);
    setText("");
  };
  return (
    <div className="composer">
      <textarea
        ref={ta}
        value={text}
        rows={2}
        placeholder="Message Pheme"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
      />
      {busy ? (
        <button className="btn danger" onClick={onStop}>Stop</button>
      ) : (
        <button className="btn primary" onClick={submit} disabled={!text.trim()}>Send</button>
      )}
    </div>
  );
}

export function ChatView({ chatId, title, onTurnEnd }: { chatId: string; title: string; onTurnEnd: () => void }) {
  const { events, streaming, busy, error, send, stop } = useChat(chatId, onTurnEnd);
  return (
    <section className="chat">
      <header className="page-head"><h1>{title}</h1></header>
      <Transcript chatId={chatId} events={events} streaming={streaming} busy={busy} />
      {error && <div className="notice error banner">{error}</div>}
      <Composer busy={busy} onSend={(t) => void send(t).then(onTurnEnd)} onStop={() => void stop()} />
    </section>
  );
}
