// Adapted from hermes-agent (MIT, Copyright (c) 2025 Nous Research), apps/desktop/src/app/chat/sidebar/{session-row,row-geometry}.tsx and app/shell/sidebar-label.tsx @ 5688461d (layout and classes; data and routing are Pheme's).
import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode, type RefObject } from "react";
import { Menu, type MenuItem } from "./Menu.tsx";
import { api, type AgentProfile, type ChatRow, type SearchHit } from "./api.ts";
import type { View } from "./router.ts";
import { formatCombo } from "./keybindings.ts";
import { useBindings } from "./useBindings.ts";
import { TID } from "./testids.ts";
import { SectionLabel } from "./components/ui/rail.tsx";
import { IconFilter, IconFolder, IconHome, IconLayoutSidebarLeftCollapse, IconPin, IconSearch } from "./lib/icons.ts";

/** Rows rendered before "Show more": keeps the sidebar fast with thousands of chats. */
export const ROW_LIMIT = 150;
/** Sessions shown under a project before "Show all N sessions". */
export const PROJECT_PREVIEW = 3;

export interface Group {
  label: string;
  chats: ChatRow[];
}

export interface ProjectGroup {
  /** The folder path, or "" for chats with no project folder ("Home"). */
  dir: string;
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

/** Recency buckets (Today, Yesterday, ...). Kept for the unit tests and for search results. */
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

/** Chats under their project folder, "Home" (no folder) first, then folders by most recent activity. */
export function groupByProject(chats: ChatRow[]): ProjectGroup[] {
  const map = new Map<string, ProjectGroup>();
  for (const c of chats) {
    const dir = c.projectDir ?? "";
    let g = map.get(dir);
    if (!g) {
      const name = dir ? dir.split(/[\\/]/).filter(Boolean).pop() ?? dir : "Home";
      g = { dir, label: name, chats: [] };
      map.set(dir, g);
    }
    g.chats.push(c);
  }
  const latest = (g: ProjectGroup) => Math.max(0, ...g.chats.map((c) => c.updatedAt));
  return [...map.values()].sort((a, b) => (a.dir === "" ? -1 : b.dir === "" ? 1 : latest(b) - latest(a)));
}

/** Line icons for the nav rows. Drawn here, not taken from another app. */
const NAV_ICON: Record<string, string> = {
  skills: "M3 3.5h7.5v9H3zM10.5 5H13v7.5H6",
  memory: "M8 3.2a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4zM3.5 13.2c.6-2 2.3-3 4.5-3s3.9 1 4.5 3",
  prompts: "M4 3.5h8v9H4zM6 6.5h4M6 9h3",
  jobs: "M8 3.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zM8 5.5V8l2 1.2",
  settings: "M3 5.5h10M3 8h10M3 10.5h10M6 4.5v2M10 7v2M7 9.5v2",
  new: "M8 3.5v9M3.5 8h9",
};
function NavIcon({ name }: { name: string }) {
  return (
    <svg className="size-4 shrink-0 text-muted-foreground" viewBox="0 0 16 16" aria-hidden="true">
      <path d={NAV_ICON[name] ?? ""} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const ROW = "group flex w-full min-h-[26px] items-center gap-2 rounded-md border border-solid bg-transparent px-2 py-1 text-left text-[12.5px] transition-colors";

function Item({ c, active, unread, tabStop, onOpen, onRename, onPin, onArchive, onDelete, onExport }: {
  c: ChatRow; active: boolean; unread: boolean; tabStop: boolean;
  onOpen: (shift: boolean) => void; onRename: (t: string) => void; onPin: () => void; onArchive: () => void; onDelete: () => void; onExport: () => void;
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
    <li className="group relative flex items-center" data-testid={TID.sessionRow} data-active={active ? "true" : undefined} data-chat-id={c.id} onContextMenu={(e) => {
      e.preventDefault();
      // From the keyboard (Menu key / Shift+F10) there are no pointer coordinates: open it under the row.
      const r = e.currentTarget.getBoundingClientRect();
      setMenu(e.clientX === 0 && e.clientY === 0 ? { x: r.left + 24, y: r.bottom } : { x: e.clientX, y: e.clientY });
    }}>
      {editing ? (
        <input
          ref={input}
          className="mx-1 w-full rounded-md border border-primary/60 bg-background px-2 py-1 text-[12.5px] text-foreground outline-none"
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
          className={`${ROW} ${active ? "border-primary/70 bg-foreground/[0.07] text-foreground" : "border-transparent text-foreground/85 hover:border-foreground/15 hover:bg-foreground/[0.05]"}`}
          data-testid={TID.sessionButton}
          ref={rowBtn}
          tabIndex={tabStop ? 0 : -1}
          onClick={(e: MouseEvent) => onOpen(e.shiftKey)}
          onDoubleClick={() => { setDraft(c.title); setEditing(true); }}
          aria-current={active ? "page" : undefined}
          title={`${c.title}\nShift-click to ${c.pinned ? "unpin" : "pin"}`}
          onKeyDown={(e) => {
            // The list is one Tab stop; arrows (also Home/End) move between rows, across project groups.
            const rows = [...(e.currentTarget.closest("nav")?.querySelectorAll<HTMLElement>("[data-testid='session-button']") ?? [])];
            const i = rows.indexOf(e.currentTarget);
            const go = (n: number) => { e.preventDefault(); rows[Math.max(0, Math.min(rows.length - 1, n))]?.focus(); };
            if (e.key === "ArrowDown") go(i + 1);
            else if (e.key === "ArrowUp") { if (i === 0) { e.preventDefault(); document.querySelector<HTMLElement>("input[aria-label=\"Search chats\"]")?.focus(); } else go(i - 1); }
            else if (e.key === "Home") go(0);
            else if (e.key === "End") go(rows.length - 1);
            else if (e.key === "F2") { e.preventDefault(); setDraft(c.title); setEditing(true); }
            else if (e.key === "Delete") { e.preventDefault(); onDelete(); }
          }}
        >
          <span className="flex w-3.5 shrink-0 justify-center" aria-hidden="true">
            {c.busy ? <span className="spin" role="img" aria-label="working" /> : unread ? <span className="dot" role="img" aria-label="new activity" /> : <span className="size-[7px] rounded-full border border-muted-foreground/70" />}
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-px leading-tight">
            <span className="truncate">{c.title}</span>
            <span className="truncate text-[11px] text-muted-foreground">{c.model || "auto"} · {c.userMessages} messages</span>
          </span>
          <span className="shrink-0 self-start pt-px text-[11px] text-muted-foreground">{relTime(c.updatedAt)}</span>
        </button>
      )}
      {!editing && (
        <button className="absolute right-1 top-1/2 -translate-y-1/2 rounded border-0 bg-transparent px-1 text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100 focus:opacity-100 [li:hover_&]:opacity-100 [li:focus-within_&]:opacity-100" tabIndex={-1} aria-label={`Actions for ${c.title}`} aria-haspopup="menu" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ x: r.left, y: r.bottom + 4 }); }}>⋯</button>
      )}
      {menu && <Menu x={menu.x} y={menu.y} items={items} onClose={() => setMenu(null)} />}
    </li>
  );
}

/** A project folder row and its sessions: the first few, then "Show all N sessions". */
function ProjectSection({ g, shown, expanded, onExpand, renderRow }: {
  g: ProjectGroup; shown: ChatRow[]; expanded: boolean; onExpand: () => void;
  renderRow: (c: ChatRow) => ReactNode;
}) {
  const Icon = g.dir ? IconFolder : IconHome;
  return (
    <section className="mt-1" aria-label={g.label}>
      <h2 className="flex items-center gap-2 px-1 py-1 text-[12.5px] font-normal text-foreground/90">
        <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="truncate" title={g.dir || "Home"}>{g.label}</span>
      </h2>
      <ul className="flex flex-col gap-px pl-1">
        {shown.map((c) => renderRow(c))}
      </ul>
      {g.chats.length > PROJECT_PREVIEW && (
        <button className="flex items-center gap-2 border-0 bg-transparent px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground" aria-expanded={expanded} onClick={onExpand}>
          {expanded ? "Show fewer sessions" : `Show all ${g.chats.length} sessions`}
        </button>
      )}
    </section>
  );
}

export function Sidebar(props: {
  chats: ChatRow[];
  activeId: string | null;
  view: View;
  unread: Set<string>;
  searchRef: RefObject<HTMLInputElement | null>;
  onNew: () => void;
  onToggleSidebar: () => void;
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
  const [openProjects, setOpenProjects] = useState<Set<string>>(new Set());
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
  // Pinned chats live in their own section; everything else is grouped by project folder.
  const pinned = useMemo(() => (showArchived ? [] : rows.filter((c) => c.pinned)), [rows, showArchived]);
  const projects = useMemo(() => groupByProject(rows.filter((c) => !(c.pinned && !showArchived))), [rows, showArchived]);
  // Chats whose title already matched are not listed twice.
  const extraHits: SearchHit[] = needle.length >= 2 && !showArchived ? msgHits.filter((h) => !rows.some((r) => r.id === h.id)) : [];
  useEffect(() => setLimit(ROW_LIMIT), [needle, showArchived]);

  // Row budget: the first ROW_LIMIT rows that are on screen (pinned count first), so a huge list stays fast.
  let budget = limit - pinned.length;
  const projectsShown = projects.map((g) => {
    const open = openProjects.has(g.dir) || !!needle;
    const avail = open ? g.chats : g.chats.slice(0, PROJECT_PREVIEW);
    const chats = avail.slice(0, Math.max(0, budget));
    budget -= chats.length;
    return { g, open, chats };
  });
  const hiddenRows = projectsShown.reduce((n, p) => n + (p.open ? p.g.chats.length - p.chats.length : 0), 0);

  // Roving tab stop: the open chat, else the first row, so Tab skips the rest of the list.
  const allShown = [...pinned, ...projects.flatMap((g) => g.chats)];
  const tabStopId = (allShown.find((c) => c.id === props.activeId && props.view === "chat") ?? allShown[0])?.id;

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

  const renderRow = (c: ChatRow) => (
    <Item
      key={c.id}
      c={c}
      active={c.id === props.activeId && props.view === "chat"}
      unread={props.unread.has(c.id)}
      tabStop={c.id === tabStopId}
      onOpen={(shift) => { if (shift) props.onPin(c); else props.onOpen(c.id); }}
      onRename={(t) => props.onRename(c, t)}
      onPin={() => props.onPin(c)}
      onArchive={() => props.onArchive(c)}
      onDelete={() => props.onDelete(c)}
      onExport={() => props.onExport(c)}
    />
  );

  const navItem = "flex h-7 w-full items-center gap-2 rounded-md border-0 bg-transparent px-2 text-left text-[12.5px] text-foreground/90 hover:bg-foreground/[0.06]";
  const pages: [View, string, string][] = [["skills", "Capabilities", "skills"], ["memory", "Memory", "memory"], ["prompts", "Prompts", "prompts"], ["jobs", "Scheduled jobs", "jobs"], ["settings", "Settings", "settings"]];
  const tabBtn = (on: boolean) => `border-x-0 border-t-0 bg-transparent px-2 py-1.5 text-[11px] font-medium uppercase tracking-[0.08em] border-b-2 ${on ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`;

  return (
    <aside className="sidebar flex h-full min-h-0 w-full flex-col gap-1 overflow-hidden bg-sidebar px-2.5 pb-2 pt-1 text-sidebar-foreground" aria-label="Sidebar">
      <div className="flex h-7 items-center justify-between">
        <span className="flex items-center gap-1.5 text-[12px] font-semibold text-foreground/80">
          <img src="/icon.svg" alt="" width={16} height={16} />
          Pheme
        </span>
        <button className="icon-btn rounded border-0 bg-transparent p-1 text-muted-foreground hover:text-foreground" aria-label="Hide sidebar" title="Hide sidebar" onClick={props.onToggleSidebar}>
          <IconLayoutSidebarLeftCollapse className="size-4" aria-hidden="true" />
        </button>
      </div>
      <div className="flex gap-1 border-b border-border/60" role="tablist" aria-label="Rail">
        <button role="tab" aria-selected={rail === "sessions"} aria-pressed={rail === "sessions"} className={tabBtn(rail === "sessions")} onClick={() => setRail("sessions")}>Sessions</button>
        <button role="tab" aria-selected={rail === "agents"} aria-pressed={rail === "agents"} className={tabBtn(rail === "agents")} onClick={() => setRail("agents")}>Agents</button>
      </div>
      {rail === "agents" ? (
        <nav className="chat-list min-h-0 flex-1 overflow-y-auto" aria-label="Agents">
          <SectionLabel>Agents</SectionLabel>
          <ul className="flex flex-col gap-px">
            {agents.map((a) => (
              <li key={a.name}>
                <button className={ROW} onClick={() => props.onView("agents")}>
                  <span className="flex min-w-0 flex-1 flex-col leading-tight">
                    <span className="truncate">{a.name}</span>
                    <span className="truncate text-[11px] text-muted-foreground">{a.description || "Saved agent"}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {agents.length === 0 && <p className="px-2 py-2 text-[11px] text-muted-foreground">No agents yet.</p>}
          <button className="border-0 bg-transparent px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground" onClick={() => props.onView("agents")}>Open the agents page</button>
        </nav>
      ) : (
      <>
      <nav className="flex flex-col gap-px" aria-label="Pages">
        <button className={`${navItem} justify-between`} onClick={props.onNew} title={`New session (${formatCombo(keys.new)})`}>
          <span className="flex items-center gap-2"><NavIcon name="new" />New session</span>
          <kbd className="font-mono text-[10px] text-muted-foreground">{formatCombo(keys.new)}</kbd>
        </button>
        {pages.map(([v, label, icon]) => (
          <button key={v} className={`${navItem} ${props.view === v ? "outline outline-1 -outline-offset-1 outline-primary/70" : ""}`} aria-current={props.view === v ? "page" : undefined} onClick={() => props.onView(v)}>
            <NavIcon name={icon} />{label}
          </button>
        ))}
      </nav>
      <label className="flex h-7 items-center gap-2 px-2 text-muted-foreground focus-within:text-foreground">
        <IconSearch className="size-3.5 shrink-0" aria-hidden="true" />
        <input
          ref={props.searchRef}
          className="min-w-0 flex-1 bg-transparent text-[12px] text-foreground placeholder:text-muted-foreground/70 outline-none"
          type="search"
          placeholder="Search sessions…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") { setQ(""); (e.target as HTMLInputElement).blur(); } else if (e.key === "ArrowDown") { e.preventDefault(); (document.querySelector("[data-testid='session-button']") as HTMLElement | null)?.focus(); } }}
          aria-label="Search chats"
        />
      </label>
      <nav className="chat-list min-h-0 flex-1 overflow-y-auto overscroll-contain pb-1" aria-label="Chats">
        {(pinned.length > 0 || !showArchived) && (
          <section className="mt-1">
            <SectionLabel>Pinned</SectionLabel>
            {pinned.length === 0 ? (
              <p className="flex items-center gap-2 px-2 py-1 text-[11.5px] text-muted-foreground"><IconPin className="size-3.5" aria-hidden="true" />Shift-click a chat to pin</p>
            ) : (
              <ul className="flex flex-col gap-px">{pinned.map((c) => renderRow(c))}</ul>
            )}
          </section>
        )}
        <section className="mt-3">
          <div className="flex items-center justify-between pr-1">
            <SectionLabel>{showArchived ? "Archived" : "Projects"}</SectionLabel>
            <button className="rounded border-0 bg-transparent p-0.5 text-muted-foreground hover:text-foreground" aria-label={showArchived ? "Back to sessions" : "Show archived"} title={showArchived ? "Back to sessions" : "Show archived"} onClick={() => setShowArchived(!showArchived)}>
              <IconFilter className="size-3.5" aria-hidden="true" />
            </button>
          </div>
          {projectsShown.map(({ g, open, chats }) => (
            <ProjectSection key={g.dir || "__home"} g={g} shown={chats} expanded={open} onExpand={() => setOpenProjects((s) => { const n = new Set(s); if (n.has(g.dir)) n.delete(g.dir); else n.add(g.dir); return n; })} renderRow={renderRow} />
          ))}
        </section>
        {needle.length >= 2 && !showArchived && msgState === "loading" && <p className="px-2 py-1 text-[11px] text-muted-foreground" role="status">Searching messages…</p>}
        {needle.length >= 2 && !showArchived && msgState === "error" && <p className="px-2 py-1 text-[11px] text-muted-foreground">Could not search messages right now.</p>}
        {extraHits.length > 0 && (
          <section className="mt-2">
            <SectionLabel>In messages</SectionLabel>
            <ul className="flex flex-col gap-px">
              {extraHits.slice(0, 10).map((h) => (
                <li key={h.id}>
                  <button className={`${ROW} border-transparent hover:bg-foreground/[0.05]`} onClick={() => props.onOpen(h.id)} title={h.title}>
                    <span className="flex min-w-0 flex-1 flex-col leading-tight">
                      <span className="truncate">{h.title}</span>
                      <span className="truncate text-[11px] text-muted-foreground">{h.role === "you" ? "You: " : ""}{h.snippet}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {extraHits.length > 10 && <p className="px-2 py-1 text-[11px] text-muted-foreground">…and {extraHits.length - 10} more. Type more to narrow it down.</p>}
          </section>
        )}
        {rows.length === 0 && extraHits.length === 0 && <div className="px-2 py-2 text-[11px] text-muted-foreground">{needle ? "No chats match." : showArchived ? "No archived chats." : "No chats yet."}</div>}
      </nav>
      {hiddenRows > 0 && <button className="border-0 bg-transparent px-2 text-left text-[11px] text-muted-foreground hover:text-foreground" onClick={() => setLimit((n) => n + ROW_LIMIT)}>Show {Math.min(ROW_LIMIT, hiddenRows)} more ({hiddenRows} hidden; search finds them all)</button>}
      </>
      )}
    </aside>
  );
}
