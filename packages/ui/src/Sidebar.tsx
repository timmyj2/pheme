import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Menu, type MenuItem } from "./Menu.tsx";
import { api, type AgentProfile, type ChatRow, type SearchHit } from "./api.ts";
import type { View } from "./router.ts";
import { formatCombo } from "./keybindings.ts";
import { useBindings } from "./useBindings.ts";
import { TID } from "./testids.ts";

/** Rows rendered before "Show more": keeps the sidebar fast with thousands of chats. */
export const ROW_LIMIT = 150;

export function Brand() {
  return (
    <div className="brand">
      <img src="/icon.svg" alt="" width={22} height={22} />
      <span>Pheme</span>
    </div>
  );
}

export interface Group {
  label: string;
  chats: ChatRow[];
}

const startOfDay = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

/** Short age for a session row: 12m, 3h, 2d. */
export function relTime(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - ts) / 1000));
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/** Line icons for the page rows. Drawn here, not taken from another app. */
function NavIcon({ name }: { name: string }) {
  const d: Record<string, string> = {
    skills: "M3 3.5h7.5v9H3zM10.5 5H13v7.5H6",
    memory: "M8 3.2a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4zM3.5 13.2c.6-2 2.3-3 4.5-3s3.9 1 4.5 3",
    agents: "M5 4.2a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2zM11 5a1.4 1.4 0 1 1 0 2.8A1.4 1.4 0 0 1 11 5zM2.8 12.5c.4-1.6 1.6-2.4 3.4-2.4s3 .8 3.4 2.4M9.2 10.4c1.4.1 2.4.8 2.8 2.1",
    prompts: "M4 3.5h8v9H4zM6 6.5h4M6 9h3",
    jobs: "M8 3.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zM8 5.5V8l2 1.2",
    settings: "M3 5.5h10M3 8h10M3 10.5h10M6 4.5v2M10 7v2M7 9.5v2",
  };
  return (
    <svg className="nav-ico" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d={d[name] ?? ""} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Pinned first, then by recency: Today, Yesterday, Previous 7 days, Older. Empty groups are dropped. */
export function groupChats(chats: ChatRow[], now = Date.now()): Group[] {
  const today = startOfDay(now);
  const day = 86_400_000;
  const buckets: Group[] = [
    { label: "Pinned", chats: [] },
    { label: "Today", chats: [] },
    { label: "Yesterday", chats: [] },
    { label: "Previous 7 days", chats: [] },
    { label: "Older", chats: [] },
  ];
  for (const c of chats) {
    if (c.pinned) buckets[0].chats.push(c);
    else if (c.updatedAt >= today) buckets[1].chats.push(c);
    else if (c.updatedAt >= today - day) buckets[2].chats.push(c);
    else if (c.updatedAt >= today - 7 * day) buckets[3].chats.push(c);
    else buckets[4].chats.push(c);
  }
  return buckets.filter((b) => b.chats.length);
}

function Item({ c, active, unread, tabStop, onOpen, onRename, onPin, onArchive, onDelete, onExport }: {
  c: ChatRow; active: boolean; unread: boolean; tabStop: boolean;
  onOpen: () => void; onRename: (t: string) => void; onPin: () => void; onArchive: () => void; onDelete: () => void; onExport: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(c.title);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const rowBtn = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  useEffect(() => {
    if (editing) { input.current?.focus(); input.current?.select(); }
    // Finishing a rename (Enter/Esc) puts the keyboard back on the row instead of dropping it on the page.
    else if (wasEditing.current && (!document.activeElement || document.activeElement === document.body)) rowBtn.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  const items: MenuItem[] = [
    { label: "Rename", run: () => { setDraft(c.title); setEditing(true); } },
    { label: c.pinned ? "Unpin" : "Pin", run: onPin },
    { label: c.archived ? "Unarchive" : "Archive", run: onArchive },
    { label: "Export as Markdown", run: onExport },
    { label: "Delete…", run: onDelete, danger: true },
  ];
  const commit = () => {
    setEditing(false);
    const t = draft.trim();
    if (t && t !== c.title) onRename(t);
  };

  return (
    <li className={`chat-item${active ? " active" : ""}`} data-testid={TID.sessionRow} data-active={active ? "true" : undefined} data-chat-id={c.id} onContextMenu={(e) => {
      e.preventDefault();
      // From the keyboard (Menu key / Shift+F10) there are no pointer coordinates: open it under the row.
      const r = e.currentTarget.getBoundingClientRect();
      setMenu(e.clientX === 0 && e.clientY === 0 ? { x: r.left + 24, y: r.bottom } : { x: e.clientX, y: e.clientY });
    }}>
      {editing ? (
        <input
          ref={input}
          className="rename"
          value={draft}
          maxLength={120}
          aria-label="Chat title"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            else if (e.key === "Escape") { e.stopPropagation(); setEditing(false); }
          }}
        />
      ) : (
        <button
          className="chat-row"
          data-testid={TID.sessionButton}
          ref={rowBtn}
          tabIndex={tabStop ? 0 : -1}
          onClick={onOpen}
          onDoubleClick={() => { setDraft(c.title); setEditing(true); }}
          aria-current={active ? "page" : undefined}
          title={c.title}
          onKeyDown={(e) => {
            // The list is one Tab stop; arrows (also Home/End) move between rows, across date groups.
            const rows = [...(e.currentTarget.closest("nav")?.querySelectorAll<HTMLElement>(".chat-row") ?? [])];
            const i = rows.indexOf(e.currentTarget);
            const go = (n: number) => { e.preventDefault(); rows[Math.max(0, Math.min(rows.length - 1, n))]?.focus(); };
            if (e.key === "ArrowDown") go(i + 1);
            else if (e.key === "ArrowUp") { if (i === 0) { e.preventDefault(); (e.currentTarget.closest("nav")?.parentElement?.querySelector<HTMLElement>("input[aria-label=\"Search chats\"]") ?? document.querySelector<HTMLElement>("input[aria-label=\"Search chats\"]"))?.focus(); } else go(i - 1); }
            else if (e.key === "Home") go(0);
            else if (e.key === "End") go(rows.length - 1);
            else if (e.key === "F2") { e.preventDefault(); setDraft(c.title); setEditing(true); }
            else if (e.key === "Delete") { e.preventDefault(); onDelete(); }
          }}
        >
          {c.busy ? <span className="spin" role="img" aria-label="working" /> : unread ? <span className="dot" role="img" aria-label="new activity" /> : null}
          <span className="chat-main">
            <span className="chat-title">{c.title}</span>
            <span className="chat-sub">{c.model || "auto"} · {c.userMessages}</span>
          </span>
          <span className="chat-time">{relTime(c.updatedAt)}</span>
        </button>
      )}
      {!editing && (
        <button className="icon-btn row-more" tabIndex={-1} aria-label={`Actions for ${c.title}`} aria-haspopup="menu" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ x: r.left, y: r.bottom + 4 }); }}>⋯</button>
      )}
      {menu && <Menu x={menu.x} y={menu.y} items={items} onClose={() => setMenu(null)} />}
    </li>
  );
}

export function Sidebar(props: {
  chats: ChatRow[];
  activeId: string | null;
  view: View;
  unread: Set<string>;
  searchRef: RefObject<HTMLInputElement | null>;
  onNew: () => void;
  onOpen: (id: string) => void;
  onView: (v: View) => void;
  onRename: (c: ChatRow, title: string) => void;
  onPin: (c: ChatRow) => void;
  onArchive: (c: ChatRow) => void;
  onDelete: (c: ChatRow) => void;
  onExport: (c: ChatRow) => void;
}) {
  const keys = useBindings();
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [limit, setLimit] = useState(ROW_LIMIT);
  const needle = q.trim().toLowerCase();
  // Search inside message text too (the server scans the chat logs); results arrive a moment after typing stops.
  const [msgHits, setMsgHits] = useState<SearchHit[]>([]);
  const [msgState, setMsgState] = useState<"idle" | "loading" | "done" | "error">("idle");
  useEffect(() => {
    if (needle.length < 2 || showArchived) { setMsgHits([]); setMsgState("idle"); return; }
    let dead = false;
    setMsgState("loading");
    const t = setTimeout(() => {
      api.search(needle).then((r) => { if (!dead) { setMsgHits(r.hits); setMsgState("done"); } }).catch(() => { if (!dead) { setMsgHits([]); setMsgState("error"); } });
    }, 300);
    return () => { dead = true; clearTimeout(t); };
  }, [needle, showArchived]);

  const rows = useMemo(
    () => props.chats.filter((c) => (showArchived ? c.archived : !c.archived) && (!needle || c.title.toLowerCase().includes(needle))),
    [props.chats, showArchived, needle],
  );
  // Chats whose title already matched are not listed twice.
  const extraHits: SearchHit[] = needle.length >= 2 && !showArchived ? msgHits.filter((h) => !rows.some((r) => r.id === h.id)) : [];
  const groups = useMemo(() => (needle ? [{ label: `Results (${rows.length})`, chats: rows }] : groupChats(rows)), [rows, needle]);
  useEffect(() => setLimit(ROW_LIMIT), [needle, showArchived]);

  let budget = limit;
  const shownGroups = groups.map((g) => { const chats = g.chats.slice(0, Math.max(0, budget)); budget -= chats.length; return { ...g, chats }; }).filter((g) => g.chats.length);
  // Roving tab stop: the open chat, else the first row, so Tab skips the rest of the list.
  const shown = shownGroups.flatMap((g) => g.chats);
  const tabStopId = (shown.find((c) => c.id === props.activeId && props.view === "chat") ?? shown[0])?.id;
  const hiddenCount = rows.length - shownGroups.reduce((n, g) => n + g.chats.length, 0);

  const navLabel: Record<string, string> = { skills: "Skills", memory: "Memory", prompts: "Prompts", jobs: "Scheduled jobs", settings: "Settings" };
  const [rail, setRail] = useState<"sessions" | "agents">(props.view === "agents" ? "agents" : "sessions");
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const wantSearch = useRef(false);
  useEffect(() => { if (props.view === "agents") setRail("agents"); }, [props.view]);
  useEffect(() => {
    const show = () => { wantSearch.current = true; setRail("sessions"); };
    window.addEventListener("pheme-show-sessions", show);
    return () => window.removeEventListener("pheme-show-sessions", show);
  }, []);
  useEffect(() => {
    if (rail !== "sessions" || !wantSearch.current) return;
    wantSearch.current = false;
    props.searchRef.current?.focus();
  }, [rail, props.searchRef]);
  useEffect(() => {
    if (rail !== "agents") return;
    api.agentProfiles().then(setAgents).catch(() => {});
  }, [rail]);
  return (
    <aside className="sidebar" aria-label="Sidebar">
      <Brand />
      <div className="rail">
        <button aria-pressed={rail === "sessions"} className={rail === "sessions" ? "active" : ""} onClick={() => setRail("sessions")}>Sessions</button>
        <button aria-pressed={rail === "agents"} className={rail === "agents" ? "active" : ""} onClick={() => setRail("agents")}>Agents</button>
      </div>
      <button className="nav-row new-chat" onClick={props.onNew} title={`New chat (${formatCombo(keys.new)})`}><span className="nav-ico" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 16 16"><path d="M8 3.5v9M3.5 8h9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg></span>New chat</button>
      <nav className="nav" aria-label="Pages">
        {(["skills", "memory", "prompts", "jobs", "settings"] as const).map((v) => (
          <button key={v} className={props.view === v ? "active" : ""} aria-current={props.view === v ? "page" : undefined} onClick={() => props.onView(v)}><NavIcon name={v} />{navLabel[v]}</button>
        ))}
      </nav>
      <div id="side-folder" className="side-folder" />
      {rail === "agents" ? (
        <nav className="chat-list" aria-label="Agents">
          <h2 className="group-label">Agents</h2>
          <ul>
            {agents.map((a) => (
              <li key={a.name} className="chat-item">
                <button className="chat-row" onClick={() => props.onView("agents")}>
                  <span className="chat-main">
                    <span className="chat-title">{a.name}</span>
                    <span className="chat-sub">{a.description || "Saved agent"}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {agents.length === 0 && <p className="muted small empty-list">No agents yet.</p>}
          <button className="link small" onClick={() => props.onView("agents")}>Open the agents page</button>
        </nav>
      ) : (
      <>
      <input
        ref={props.searchRef}
        className="search"
        type="search"
        placeholder="Search chats"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Escape") { setQ(""); (e.target as HTMLInputElement).blur(); } else if (e.key === "ArrowDown") { e.preventDefault(); (document.querySelector(".chat-list .chat-row") as HTMLElement | null)?.focus(); } }}
        aria-label="Search chats"
      />
      <nav className="chat-list" aria-label="Chats">
        {shownGroups.map((g) => (
          <section key={g.label}>
            <h2 className="group-label">{g.label}</h2>
            <ul>
              {g.chats.map((c) => (
                <Item
                  key={c.id}
                  c={c}
                  active={c.id === props.activeId && props.view === "chat"}
                  unread={props.unread.has(c.id)}
                  tabStop={c.id === tabStopId}
                  onOpen={() => props.onOpen(c.id)}
                  onRename={(t) => props.onRename(c, t)}
                  onPin={() => props.onPin(c)}
                  onArchive={() => props.onArchive(c)}
                  onDelete={() => props.onDelete(c)}
                  onExport={() => props.onExport(c)}
                />
              ))}
            </ul>
          </section>
        ))}
        {needle.length >= 2 && !showArchived && msgState === "loading" && <p className="muted small search-status" role="status">Searching messages…</p>}
        {needle.length >= 2 && !showArchived && msgState === "error" && <p className="muted small search-status">Could not search messages right now.</p>}
        {extraHits.length > 0 && (
          <section>
            <h2 className="group-label">In messages</h2>
            <ul>
              {extraHits.slice(0, 10).map((h) => (
                <li key={h.id} className="chat-item">
                  <button className="msg-hit" onClick={() => props.onOpen(h.id)} title={h.title}>
                    <span className="chat-title">{h.title}</span>
                    <span className="muted small snippet">{h.role === "you" ? "You: " : ""}{h.snippet}</span>
                  </button>
                </li>
              ))}
            </ul>
            {extraHits.length > 10 && <p className="muted small search-status">…and {extraHits.length - 10} more. Type more to narrow it down.</p>}
          </section>
        )}
        {hiddenCount > 0 && <button className="link small" onClick={() => setLimit((n) => n + ROW_LIMIT)}>Show {Math.min(ROW_LIMIT, hiddenCount)} more ({hiddenCount} hidden; search finds them all)</button>}
        {rows.length === 0 && extraHits.length === 0 && <div className="muted small empty-list">{needle ? "No chats match." : showArchived ? "No archived chats." : "No chats yet."}</div>}
      </nav>
      <button className="link small" onClick={() => setShowArchived(!showArchived)}>{showArchived ? "Back to chats" : "Show archived"}</button>
      </>
      )}
    </aside>
  );
}
