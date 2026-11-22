import { useMemo, useState } from "react";
import type { ChatRow } from "./api.ts";

export type View = "chat" | "skills" | "memory" | "agents" | "jobs" | "settings";

export function Brand() {
  return (
    <div className="brand">
      <img src="/icon.svg" alt="" width={22} height={22} />
      <span>Pheme</span>
    </div>
  );
}

export function Sidebar(props: {
  chats: ChatRow[];
  activeId: string | null;
  view: View;
  onNew: () => void;
  onOpen: (id: string) => void;
  onView: (v: View) => void;
  onPin: (c: ChatRow) => void;
  onArchive: (c: ChatRow) => void;
}) {
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return props.chats.filter((c) => (showArchived ? c.archived : !c.archived) && (!needle || c.title.toLowerCase().includes(needle)));
  }, [props.chats, q, showArchived]);
  const pinned = rows.filter((c) => c.pinned);
  const rest = rows.filter((c) => !c.pinned);
  const row = (c: ChatRow) => (
    <li key={c.id} className={c.id === props.activeId && props.view === "chat" ? "active" : ""}>
      <button className="chat-row" onClick={() => props.onOpen(c.id)} title={c.title}>
        {c.busy && <span className="spin" aria-label="working" />}
        <span className="chat-title">{c.title}</span>
      </button>
      <span className="row-actions">
        <button aria-label={c.pinned ? "Unpin" : "Pin"} title={c.pinned ? "Unpin" : "Pin"} onClick={() => props.onPin(c)}>{c.pinned ? "★" : "☆"}</button>
        <button aria-label={c.archived ? "Unarchive" : "Archive"} title={c.archived ? "Unarchive" : "Archive"} onClick={() => props.onArchive(c)}>{c.archived ? "↩" : "▣"}</button>
      </span>
    </li>
  );
  return (
    <aside className="sidebar">
      <Brand />
      <button className="btn primary new-chat" onClick={props.onNew}>New chat</button>
      <input className="search" type="search" placeholder="Search chats" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search chats" />
      <div className="chat-list">
        {pinned.length > 0 && <div className="group-label">Pinned</div>}
        <ul>{pinned.map(row)}</ul>
        <div className="group-label">{showArchived ? "Archived" : "Chats"}</div>
        <ul>{rest.map(row)}</ul>
        {rows.length === 0 && <div className="muted small">No chats</div>}
      </div>
      <button className="link small" onClick={() => setShowArchived(!showArchived)}>{showArchived ? "Back to chats" : "Show archived"}</button>
      <nav className="nav">
        {(["skills", "memory", "agents", "jobs", "settings"] as const).map((v) => (
          <button key={v} className={props.view === v ? "active" : ""} onClick={() => props.onView(v)}>{v === "jobs" ? "Scheduled jobs" : v[0].toUpperCase() + v.slice(1)}</button>
        ))}
        <div className="kbd-hint muted small">Ctrl+K for commands</div>
      </nav>
    </aside>
  );
}
