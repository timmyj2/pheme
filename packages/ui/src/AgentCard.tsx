import { useState } from "react";
import { api, type AgentRun, type SeqEvent } from "./api.ts";

const label = (r: AgentRun) => (r.status === "running" ? "working" : r.status);

export function AgentCard({ run, onOpenChat }: { run: AgentRun; onOpenChat?: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<SeqEvent[] | null>(null);
  const toggle = async () => {
    setOpen(!open);
    if (!open && run.childChatId) setEvents((await api.chat(run.childChatId)).events);
  };
  const secs = run.endedAt ? Math.max(1, Math.round((run.endedAt - run.startedAt) / 1000)) : null;
  return (
    <div className="agent-card" data-status={run.status}>
      <button className="agent-head" onClick={() => void toggle()} aria-expanded={open}>
        <span className="tool-dot" />
        <strong>{run.name}</strong>
        <span className="muted small">{run.source === "copilot" ? "Copilot agent" : "parallel session"}</span>
        <span className="agent-task">{run.task}</span>
        <span className="tool-state">{label(run)}{secs ? ` · ${secs}s` : ""}</span>
      </button>
      {open && (
        <div className="agent-body">
          <div className="muted small">Task</div>
          <pre>{run.task}</pre>
          {run.result && (<><div className="muted small">Result</div><pre>{run.result}</pre></>)}
          {events && events.filter((e) => e.type === "tool_start" || e.type === "tool_end" || e.type === "message").map((e) => (
            <div key={e.seq} className="muted small">{e.type === "tool_start" ? `tool: ${e.name}` : e.type === "tool_end" ? `  → ${e.ok ? "ok" : "failed"}` : ""}</div>
          ))}
          {onOpenChat && <div className="muted small">From chat <button className="link" onClick={() => onOpenChat(run.parentChatId)}>open</button></div>}
        </div>
      )}
    </div>
  );
}
