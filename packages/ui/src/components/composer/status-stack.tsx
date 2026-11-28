// Adapted from hermes-agent (MIT, Copyright (c) 2025 Nous Research), apps/desktop/src/app/chat/composer/status-stack/index.tsx @ 5688461d
// Trimmed to the groups Pheme has data for: running subagents, running background agents and the queue. Rows with nothing in them are not drawn.
import { useState, type ReactNode } from "react";
import type { AgentRun, SeqEvent } from "../../api.ts";
import type { TodoItem } from "../../../../server/src/protocol.ts";
import { IconChevronDown, IconChevronRight, IconX } from "../../lib/icons.ts";
import { Codicon } from "../ui/codicon.tsx";
import { TID } from "../../testids.ts";

export interface ActivityRun { id: string; name: string; task: string; kind: "subagent" | "background" }

/** The agent runs still going in a chat, from its event log: the newest state of each run that is running. */
export function runningActivity(events: SeqEvent[]): ActivityRun[] {
  const last = new Map<string, AgentRun>();
  for (const e of events) if (e.type === "agent_update") last.set(e.run.id, e.run);
  return [...last.values()]
    .filter((r) => r.status === "running")
    .map((r) => ({ id: r.id, name: r.name, task: r.task, kind: r.source === "session" ? "subagent" as const : "background" as const }));
}

const keyFor = (chatId: string | null) => `pheme-stack-collapsed:${chatId ?? "new"}`;
function readCollapsed(chatId: string | null): boolean {
  try { return localStorage.getItem(keyFor(chatId)) === "1"; } catch { return false; }
}
function writeCollapsed(chatId: string | null, v: boolean) {
  try { localStorage.setItem(keyFor(chatId), v ? "1" : "0"); } catch { /* private mode: the choice simply is not remembered */ }
}

interface Props {
  chatId: string | null;
  activity: ActivityRun[];
  /** The engine's unfinished todo list. Shown as a "Todos" row only when given. */
  todos?: TodoItem[];
  queue: string[];
  onRemoveQueued: (i: number) => void;
}

/** Codicon per todo status: a check when done, a filled ring when in progress, an empty ring otherwise. */
const todoIcon = (status: string) => (/^(done|completed|complete)$/i.test(status) ? "pass" : status === "in_progress" ? "circle-large-filled" : "circle-large-outline");

export function StatusStack({ chatId, activity, todos = [], queue, onRemoveQueued }: Props) {
  const [collapsed, setCollapsed] = useState(() => readCollapsed(chatId));
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const subs = activity.filter((a) => a.kind === "subagent");
  const bg = activity.filter((a) => a.kind === "background");
  if (!subs.length && !bg.length && !queue.length && !todos.length) return null;

  const toggleCollapsed = () => { const v = !collapsed; setCollapsed(v); writeCollapsed(chatId, v); };
  const groups: { key: string; label: string; icon: string; items: ReactNode[]; defaultOpen: boolean }[] = [];
  if (todos.length) groups.push({
    key: "todos",
    label: "Todos",
    icon: "checklist",
    defaultOpen: true,
    items: todos.map((t) => (
      <li key={t.id || t.title} className="stack-row todo-row" data-testid={TID.todoRow} data-status={t.status}>
        <Codicon name={todoIcon(t.status)} size="0.8rem" className="todo-glyph" aria-hidden="true" />
        <span className="stack-row-text">{t.title}</span>
      </li>
    )),
  });
  if (subs.length) groups.push({ key: "subagents", label: `${subs.length} Subagents`, icon: "agent", defaultOpen: false, items: subs.map((s) => <RunRow key={s.id} run={s} />) });
  if (bg.length) groups.push({ key: "background", label: `${bg.length} Background`, icon: "server-process", defaultOpen: false, items: bg.map((s) => <RunRow key={s.id} run={s} />) });
  if (queue.length) groups.push({
    key: "queue",
    label: `${queue.length} Queued`,
    icon: "layers",
    defaultOpen: true,
    items: queue.map((q, i) => (
      <li key={i} className="stack-row queued">
        <span className="stack-row-text">{q}</span>
        <button type="button" className="stack-row-x" aria-label={`Remove queued message ${i + 1}`} onClick={() => onRemoveQueued(i)}><IconX className="size-3" aria-hidden="true" /></button>
      </li>
    )),
  });

  return (
    <div className={`status-stack${collapsed ? " is-collapsed" : ""}`} data-testid={TID.statusStack}>
      <button type="button" className="stack-ridge" aria-expanded={!collapsed} aria-label={collapsed ? "Show status" : "Hide status"} title={collapsed ? "Show status" : "Hide status"} onClick={toggleCollapsed} />
      {!collapsed && groups.map((g) => {
        const isOpen = open[g.key] ?? g.defaultOpen;
        return (
          <div className="stack-group" key={g.key}>
            <button type="button" className="stack-head" aria-expanded={isOpen} onClick={() => setOpen((o) => ({ ...o, [g.key]: !isOpen }))}>
              {isOpen ? <IconChevronDown className="size-3" aria-hidden="true" /> : <IconChevronRight className="size-3" aria-hidden="true" />}
              <Codicon name={g.icon} size="0.8rem" className="stack-icon" />
              <span>{g.label}</span>
            </button>
            {isOpen && <ul className="stack-list" aria-label={g.label}>{g.items}</ul>}
          </div>
        );
      })}
    </div>
  );
}

function RunRow({ run }: { run: ActivityRun }) {
  return (
    <li className="stack-row">
      <span className="stack-row-name">{run.name}</span>
      {run.task && <span className="stack-row-text">{run.task}</span>}
    </li>
  );
}
