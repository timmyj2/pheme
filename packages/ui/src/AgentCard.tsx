// Adapted from hermes-agent (MIT, Copyright (c) 2025 Nous Research), apps/desktop/src/components/assistant-ui/tool/delegate.tsx @ 5688461d
// Rewritten: one bordered row per sub-agent (status glyph, goal, source and duration). Pheme's AgentRun has no model field,
// so no model is shown. The row's goal is the task; opening the child chat stays a button in the body.
import { useState } from "react";
import { api, type AgentRun, type SeqEvent } from "./api.ts";
import { IconAlertTriangle, IconCheck } from "./lib/icons.ts";
import { GlyphSpinner } from "./components/ui/glyph-spinner.tsx";
import { TID } from "./testids.ts";
import "./components/tool/tool.css";

const label = (r: AgentRun) => (r.status === "running" ? "working" : r.status);

export function AgentCard({ run, onOpenChat }: { run: AgentRun; onOpenChat?: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<SeqEvent[] | null>(null);
  const toggle = async () => {
    setOpen(!open);
    if (!open && run.childChatId) setEvents((await api.chat(run.childChatId)).events);
  };
  const secs = run.endedAt ? Math.max(1, Math.round((run.endedAt - run.startedAt) / 1000)) : null;
  const source = run.source === "copilot" ? "Copilot agent" : "parallel session";
  return (
    <div className="delegate-row" data-status={run.status} data-testid={TID.delegateRow}>
      <button className="delegate-head" onClick={() => void toggle()} aria-expanded={open}>
        <span className="delegate-glyph">
          {run.status === "running" ? <GlyphSpinner ariaLabel="Working" /> : run.status === "done" ? <IconCheck size={12} aria-hidden="true" /> : <IconAlertTriangle size={12} aria-hidden="true" />}
        </span>
        <span className="delegate-goal">{run.task}</span>
        <span className="delegate-meta">{run.name} · {source} · {label(run)}{secs ? ` · ${secs}s` : ""}</span>
      </button>
      {open && (
        <div className="delegate-body">
          {run.result && <pre>{run.result}</pre>}
          {events && events.filter((e) => e.type === "tool_start" || e.type === "tool_end").map((e) => (
            <div key={e.seq} className="small">{e.type === "tool_start" ? `tool: ${e.name}` : `  → ${e.ok ? "ok" : "failed"}`}</div>
          ))}
          {onOpenChat && <div className="small">From chat <button className="link" onClick={() => onOpenChat(run.parentChatId)}>open</button></div>}
        </div>
      )}
    </div>
  );
}
