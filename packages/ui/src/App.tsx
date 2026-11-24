import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgentsPage } from "./Agents.tsx";
import { ChatView } from "./Chat.tsx";
import type { ComposerHandle } from "./Composer.tsx";
import { ConfirmDialog } from "./Dialog.tsx";
import { clearUnsaved, hasUnsaved } from "./unsaved.ts";
import { NOTIFY_CHANGED, notifyEnabled, useNotifications } from "./notify.ts";
import { ErrorBoundary } from "./ErrorBoundary.tsx";
import { PromptsPage } from "./Prompts.tsx";
import { JobsPage } from "./Jobs.tsx";
import { MemoryPage, SettingsPage, SkillsPage } from "./Pages.tsx";
import { Palette, type Command } from "./Palette.tsx";
import { ShortcutsHelp } from "./ShortcutsHelp.tsx";
import { Sidebar } from "./Sidebar.tsx";
import { api, type BootstrapState, type ChatRow } from "./api.ts";
import { useConnection } from "./connection.ts";
import { computeUnread, loadSeen, saveSeen } from "./seen.ts";
import { isTyping } from "./shortcuts.ts";
import { formatCombo, matches } from "./keybindings.ts";
import { useBindings } from "./useBindings.ts";
import { THEMES, applyTheme, parseTheme, themeValue } from "./themes/presets.ts";
import { useToast } from "./toast.tsx";
import { useRoute, type View } from "./router.ts";

const TEXT_STEPS = [80, 90, 100, 110, 125];
export function applyTextScale(percent?: number) {
  let raw = percent;
  if (raw == null) {
    try { raw = Number(localStorage.getItem("pheme-text-scale") || "100"); } catch { raw = 100; }
  }
  const n = TEXT_STEPS.includes(raw) ? raw : 100;
  document.documentElement.style.setProperty("--chat-text-scale", String(n / 100));
}
export function bumpTextScale(dir: -1 | 1) {
  let cur = 100;
  try { cur = Number(localStorage.getItem("pheme-text-scale") || "100"); } catch { /* blocked storage: stay at the default */ }
  const i = Math.max(0, TEXT_STEPS.indexOf(cur));
  const next = TEXT_STEPS[Math.max(0, Math.min(TEXT_STEPS.length - 1, i + dir))] ?? 100;
  try { localStorage.setItem("pheme-text-scale", String(next)); } catch { /* private mode: this tab still changes */ }
  applyTextScale(next);
}

const NARROW = "(max-width: 820px)";
const HIDE_KEY = "pheme-sidebar-hidden";

/** True in a window opened from an installed Pheme app (no address bar), as opposed to a normal browser tab. */
export const isInstalledApp = () => typeof window !== "undefined" && !!window.matchMedia?.("(display-mode: standalone)").matches;

export function App() {
  const toast = useToast();
  const conn = useConnection();
  const state = conn.state;
  const [route, rawNavigate] = useRoute();
  const keys = useBindings();
  const [leaving, setLeaving] = useState<null | (() => void)>(null);
  // Leaving a page with unsaved edits (memory, skills) asks first; in-place replace navigations never do.
  const navigate = useCallback<typeof rawNavigate>((r, opts) => {
    if (!opts?.replace && hasUnsaved()) setLeaving(() => () => rawNavigate(r, opts));
    else rawNavigate(r, opts);
  }, [rawNavigate]);
  const [chats, setChats] = useState<ChatRow[]>([]);
  const [chatsLoaded, setChatsLoaded] = useState(false);
  const [unread, setUnread] = useState<Set<string>>(new Set());
  const [palette, setPalette] = useState(false);
  const [help, setHelp] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ChatRow | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(HIDE_KEY) === "1"; } catch { return false; } });
  const [skillNames, setSkillNames] = useState<string[]>([]);
  const [activeBusy, setActiveBusy] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.matchMedia(NARROW).matches);
  useEffect(() => {
    const mq = window.matchMedia(NARROW);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const sidebarOpen = narrow ? drawer : !hidden;
  const composerRef = useRef<ComposerHandle>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const firstMessage = useRef<{ id: string; text: string; files: File[] } | null>(null);
  const seen = useRef(loadSeen());

  const activeId = route.view === "chat" ? route.chatId : null;
  const activeChat = chats.find((c) => c.id === activeId);

  const refresh = useCallback(() => {
    api.chats().then((list) => {
      setChats(list);
      setChatsLoaded(true);
    }).catch(() => { /* the connection banner reports an unreachable server */ });
  }, []);

  useEffect(() => {
    try { document.documentElement.classList.toggle("wallpaper", localStorage.getItem("pheme-wallpaper") === "1"); } catch { /* leave it off */ }
    applyTextScale();
  }, []);

  useEffect(() => {
    refresh();
    // A hidden tab keeps polling only when notifications are on (browsers slow hidden timers to about once a minute).
    const t = setInterval(() => { if (document.visibilityState === "visible" || notifyEnabled()) refresh(); }, 4000);
    document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", refresh); };
  }, [refresh]);

  // Mark the open chat as seen and flag the others that changed since they were last viewed.
  useEffect(() => {
    const r = computeUnread(chats, seen.current, activeId);
    seen.current = r.seen;
    saveSeen(r.seen);
    setUnread(r.unread);
  }, [chats, activeId]);

  // Theme: apply now, and follow the OS when set to "Match system".
  const themeValueNow = state?.settings.theme;
  useEffect(() => {
    if (!themeValueNow) return;
    applyTheme(themeValueNow);
    if (parseTheme(themeValueNow).mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const f = () => applyTheme(themeValueNow);
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, [themeValueNow]);

  // Window title: the chat's name, with a dot while it is working.
  useEffect(() => {
    const names: Record<string, string> = { skills: "Skills", memory: "Memory", agents: "Agents", prompts: "Prompts", jobs: "Scheduled jobs", settings: "Settings" };
    const name = route.view === "chat" ? (activeChat?.title ?? "New chat") : names[route.view];
    document.title = `${activeBusy && route.view === "chat" ? "● " : ""}${name} · Pheme`;
  }, [route, activeChat?.title, activeBusy]);

  useEffect(() => { try { localStorage.setItem(HIDE_KEY, hidden ? "1" : "0"); } catch { /* ignore */ } }, [hidden]);

  const exportChat = useCallback(async (c: ChatRow) => {
    try {
      const { blob, name } = await api.exportChat(c.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast.info(`Exported “${name}”`);
    } catch (e) {
      toast.error(`Could not export: ${(e as Error).message}`);
    }
  }, [toast]);
  const closeDrawer = useCallback(() => setDrawer(false), []);
  // Mobile drawer: Esc closes it, focus moves into it on open and back to the menu button on close.
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !e.defaultPrevented) setDrawer(false); };
    window.addEventListener("keydown", onKey);
    const t = setTimeout(() => (document.querySelector(".sidebar-wrap .chat-row, .sidebar-wrap input, .sidebar-wrap button") as HTMLElement | null)?.focus(), 0);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(t);
      if (!document.activeElement || document.activeElement === document.body || document.querySelector(".sidebar-wrap")?.contains(document.activeElement)) (document.querySelector(".menu-btn") as HTMLElement | null)?.focus();
    };
  }, [drawer]);
  const go = useCallback((r: Parameters<typeof navigate>[0]) => { navigate(r); setDrawer(false); }, [navigate]);
  const newChat = useCallback(() => {
    go({ view: "chat", chatId: null });
    setTimeout(() => composerRef.current?.focus(), 0);
  }, [go]);
  const openChat = useCallback((id: string) => (id ? go({ view: "chat", chatId: id }) : newChat()), [go, newChat]);
  const [notifyOn, setNotifyOn] = useState(notifyEnabled);
  useEffect(() => {
    const sync = () => setNotifyOn(notifyEnabled());
    window.addEventListener(NOTIFY_CHANGED, sync);
    window.addEventListener("storage", sync); // another tab changed it
    return () => { window.removeEventListener(NOTIFY_CHANGED, sync); window.removeEventListener("storage", sync); };
  }, []);
  useNotifications(chats, chatsLoaded, activeId, notifyOn, openChat);

  const createAndSend = useCallback(async (text: string, files: File[] = []) => {
    try {
      const c = await api.newChat();
      firstMessage.current = { id: c.id, text, files };
      setChats((prev) => [{ ...c }, ...prev]);
      navigate({ view: "chat", chatId: c.id });
    } catch (e) {
      toast.error((e as Error).message);
      composerRef.current?.insert(text);
      composerRef.current?.addFiles(files);
    }
  }, [navigate, toast]);

  const patchChat = useCallback(async (c: ChatRow, p: Partial<Pick<ChatRow, "pinned" | "archived" | "title">>) => {
    setChats((prev) => prev.map((x) => (x.id === c.id ? { ...x, ...p } : x))); // update first, reconcile after
    try {
      await api.patchChat(c.id, p);
    } catch (e) {
      toast.error(`Could not update the chat: ${(e as Error).message}`);
    }
    refresh();
  }, [refresh, toast]);

  const deleteChat = useCallback(async (c: ChatRow) => {
    try {
      await api.deleteChat(c.id);
      setChats((prev) => prev.filter((x) => x.id !== c.id));
      if (c.id === activeId) navigate({ view: "chat", chatId: null }, { replace: true });
      try { localStorage.removeItem("pheme-draft:" + c.id); } catch { /* ignore */ }
      toast.info("Chat deleted");
    } catch (e) {
      toast.error(`Could not delete the chat: ${(e as Error).message}`);
    }
    refresh();
  }, [activeId, navigate, refresh, toast]);

  const setSetting = useCallback(async (patch: Partial<BootstrapState["settings"]>) => {
    try {
      const settings = await api.settings(patch);
      conn.setState((s) => (s ? { ...s, settings } : s));
    } catch (e) {
      toast.error(`Could not save the setting: ${(e as Error).message}`);
    }
  }, [conn, toast]);

  // Recent (non-archived) chats in sidebar order, for Alt+1..9 and Alt+Up/Down.
  const recent = useMemo(() => [...chats].filter((c) => !c.archived).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt), [chats]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (matches(e, keys.palette)) { e.preventDefault(); setPalette((p) => !p); return; }
      if (palette || help || confirmDelete || document.querySelector(".overlay")) return;
      if (matches(e, keys.sidebar)) { e.preventDefault(); if (window.matchMedia(NARROW).matches) setDrawer((d) => !d); else setHidden((h) => !h); return; }
      if (matches(e, keys.new)) { e.preventDefault(); newChat(); return; }
      if (matches(e, keys.search)) {
        e.preventDefault();
        setHidden(false);
        if (window.matchMedia(NARROW).matches) setDrawer(true);
        window.dispatchEvent(new Event("pheme-show-sessions"));
        const focusSearch = (left: number) => {
          const el = searchRef.current;
          if (el) { el.focus(); return; }
          if (left > 0) setTimeout(() => focusSearch(left - 1), 40);
        };
        setTimeout(() => focusSearch(12), 0);
        return;
      }
      if (matches(e, keys.prev) || matches(e, keys.next)) {
        e.preventDefault();
        const down = matches(e, keys.next);
        const i = recent.findIndex((c) => c.id === activeId);
        const next = recent[down ? i + 1 : i < 0 ? 0 : i - 1];
        if (next) openChat(next.id);
        return;
      }
      if (e.altKey && !mod) {
        const slot = /^Digit([1-9])$/.exec(e.code);
        if (slot) { const c = recent[Number(slot[1]) - 1]; if (c) { e.preventDefault(); openChat(c.id); } return; }
      }
      if (isTyping(e.target) || mod || e.altKey) return;
      if (e.key === "/") { e.preventDefault(); composerRef.current?.focus(); }
      else if (e.key === "?") { e.preventDefault(); setHelp(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [palette, help, confirmDelete, recent, activeId, newChat, openChat, keys]);

  useEffect(() => { if (palette) api.skills().then((l) => setSkillNames(l.map((x) => x.name))).catch(() => {}); }, [palette]);

  const commands = useMemo<Command[]>(() => {
    const cur = state ? parseTheme(state.settings.theme) : null;
    const pageCmds: Command[] = [
      { id: "new", label: "New chat", hint: formatCombo(keys.new), run: newChat },
      { id: "skills", label: "Go to Skills", run: () => go({ view: "skills", name: null }) },
      { id: "memory", label: "Go to Memory", run: () => go({ view: "memory" }) },
      { id: "agents", label: "Go to Agents", run: () => go({ view: "agents" }) },
      { id: "prompts", label: "Go to Prompts", run: () => go({ view: "prompts" }) },
      { id: "jobs", label: "Go to Scheduled jobs", run: () => go({ view: "jobs" }) },
      { id: "settings", label: "Go to Settings", run: () => go({ view: "settings" }) },
      { id: "help", label: "Keyboard shortcuts", hint: "?", run: () => setHelp(true) },
      { id: "sidebar", label: hidden ? "Show sidebar" : "Hide sidebar", hint: formatCombo(keys.sidebar), run: () => setHidden((h) => !h) },
      { id: "mode", label: "Toggle light/dark mode", run: () => { if (cur) void setSetting({ theme: themeValue(cur.theme.name, document.documentElement.classList.contains("dark") ? "light" : "dark") }); } },
      { id: "auto", label: state?.settings.autoApproveAll ? "Turn off Auto-approve all" : "Turn on Auto-approve all", run: () => void setSetting({ autoApproveAll: !state?.settings.autoApproveAll }) },
      { id: "loops", label: state?.settings.loopsEnabled ? "Turn off learning loops" : "Turn on learning loops", run: () => void setSetting({ loopsEnabled: !state?.settings.loopsEnabled }) },
    ];
    if (activeChat) {
      pageCmds.push(
        { id: "stop", label: "Stop current chat", hint: "Esc", run: () => void api.stop(activeChat.id) },
        { id: "pin", label: activeChat.pinned ? "Unpin this chat" : "Pin this chat", run: () => void patchChat(activeChat, { pinned: !activeChat.pinned }) },
        { id: "archive", label: activeChat.archived ? "Unarchive this chat" : "Archive this chat", run: () => void patchChat(activeChat, { archived: !activeChat.archived }) },
        { id: "delete", label: "Delete this chat…", run: () => setConfirmDelete(activeChat) },
      );
    }
    const themeCmds = THEMES.map((t) => ({ id: `theme-${t.name}`, label: `Theme: ${t.label}`, hint: "appearance", run: () => { if (cur) void setSetting({ theme: themeValue(t.name, cur.mode) }); } }));
    const skillCmds = skillNames.map((n) => ({ id: `skill-${n}`, label: `Open skill: ${n}`, hint: "skill", run: () => go({ view: "skills", name: n }) }));
    const chatCmds = chats.map((c) => ({ id: c.id, label: c.title, hint: c.archived ? "archived chat" : "chat", run: () => openChat(c.id) }));
    return [...pageCmds, ...themeCmds, ...skillCmds, ...chatCmds];
  }, [chats, state, activeChat, skillNames, hidden, go, newChat, openChat, patchChat, setSetting]);

  if (conn.status === "unauthorized" || (!state && conn.error)) {
    return (
      <div className="fatal">
        <h1>Pheme</h1>
        <p>{conn.status === "unauthorized" ? (isInstalledApp() ? "This app window's access key is out of date." : "This tab's access key is no longer valid.") : conn.error}</p>
        <p className="muted">{isInstalledApp()
          ? "Pheme makes a new key each time it starts. Start Pheme again (start-pheme, or the terminal command you used). It opens a browser tab that refreshes the key, then press Try again here."
          : "Open Pheme from the link printed in the terminal window (it contains a one-time key), or restart Pheme and use the new link."}</p>
        <button className="btn" onClick={() => void conn.retry()}>Try again</button>
      </div>
    );
  }
  if (!state) return <div className="fatal muted" role="status">Loading…</div>;

  const view: View = route.view;
  const offline = conn.status === "offline";
  const pageTitle = view === "chat" ? (activeChat?.title ?? "New chat") : { skills: "Skills", memory: "Memory", agents: "Agents", prompts: "Prompts", jobs: "Scheduled jobs", settings: "Settings" }[view];
  const shellClass = `shell${hidden ? " sidebar-hidden" : ""}${drawer ? " drawer-open" : ""}`;
  const tabs = [...chats].filter((c) => !c.archived && !c.hidden).sort((a, b) => (a.tabOrder ?? 1e9) - (b.tabOrder ?? 1e9) || b.updatedAt - a.updatedAt).slice(0, 6);
  if (activeChat && !tabs.some((c) => c.id === activeChat.id)) tabs.unshift(activeChat);
  const dropTab = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const ids = tabs.map((t) => t.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(from, 1);
    ids.splice(to, 0, dragId);
    setChats((prev) => prev.map((c) => { const i = ids.indexOf(c.id); return i < 0 ? c : { ...c, tabOrder: i }; }));
    setDragId(null);
    void api.reorderChats(ids).then(refresh).catch((e: Error) => toast.error(e.message));
  };

  return (
    <div className={shellClass}>
      <a className="skip-link" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById("main")?.focus(); }}>Skip to content</a>
      <div className="workspace">
      <div className="sidebar-wrap">
        <Sidebar
          chats={chats}
          activeId={activeId}
          view={view}
          unread={unread}
          searchRef={searchRef}
          onNew={newChat}
          onOpen={openChat}
          onView={(v) => go(v === "skills" ? { view: "skills", name: null } : ({ view: v } as never))}
          onRename={(c, title) => void patchChat(c, { title })}
          onPin={(c) => void patchChat(c, { pinned: !c.pinned })}
          onArchive={(c) => void patchChat(c, { archived: !c.archived })}
          onDelete={setConfirmDelete}
          onExport={(c) => void exportChat(c)}
        />
      </div>
      {drawer && <div className="backdrop" onClick={closeDrawer} aria-hidden />}
      <main className="main" id="main" tabIndex={-1}>
        <header className="topbar">
          <button className="icon-btn menu-btn" aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"} aria-expanded={sidebarOpen} title={`Toggle sidebar (${formatCombo(keys.sidebar)})`} onClick={() => { if (narrow) setDrawer((d) => !d); else setHidden((h) => !h); }}>☰</button>
          <div id="top-folder" className="top-folder" />
          <h1 className="sr-only">{pageTitle}</h1>
          <div className="tab-strip" role="tablist" aria-label="Open chats">
            {view === "chat" && tabs.length > 0 ? tabs.map((c) => (
              <button key={c.id} role="tab" aria-selected={c.id === activeId} draggable className={`tab${c.id === activeId ? " active" : ""}`} title={c.title} onClick={() => openChat(c.id)} onDragStart={() => setDragId(c.id)} onDragOver={(e) => e.preventDefault()} onDrop={() => dropTab(c.id)}>
                {(c.busy || c.id === activeId && activeBusy) && <span className="tab-dot" aria-hidden="true" />}
                <span className="tab-title">{c.title}</span>
              </button>
            )) : <span className="tab active" role="tab" aria-selected="true">{pageTitle}</span>}
          </div>
          {state.fake && <span className="pill" title="Using the built-in fake engine">fake</span>}
          <button className="icon-btn" aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)" onClick={() => setHelp(true)}>⌨</button>
        </header>
        {offline && (
          <div className="banner warn" role="alert">
            Can't reach Pheme. It may have been stopped. Retrying…
            <button className="link" onClick={() => void conn.retry()}>Retry now</button>
          </div>
        )}
        <ErrorBoundary key={view === "chat" ? `chat-${activeId ?? "new"}` : view} label={pageTitle}>
          {view === "chat" && (
            <ChatView
              key={activeId ?? "new"}
              chatId={activeId}
              projectDir={chats.find((c) => c.id === activeId)?.projectDir}
              model={chats.find((c) => c.id === activeId)?.model}
              defaultModel={state.settings.model}
              offline={offline}
              folderInTop={!sidebarOpen}
              composerRef={composerRef}
              autoSend={firstMessage.current?.id === activeId ? firstMessage.current?.text : undefined}
              autoFiles={firstMessage.current?.id === activeId ? firstMessage.current?.files : undefined}
              onAutoSent={() => { firstMessage.current = null; }}
              onCreate={(t, f) => void createAndSend(t, f)}
              onChanged={refresh}
              onOpenChat={openChat}
              onBusy={setActiveBusy}
            />
          )}
          {view === "skills" && <SkillsPage name={route.view === "skills" ? route.name : null} onOpen={(name) => navigate({ view: "skills", name }, { replace: true })} />}
          {view === "memory" && <MemoryPage />}
          {view === "agents" && <AgentsPage onOpenChat={openChat} />}
          {view === "prompts" && <PromptsPage />}
          {view === "jobs" && <JobsPage onOpenChat={openChat} />}
          {view === "settings" && <SettingsPage state={state} onChange={(settings) => conn.setState({ ...state, settings })} />}
        </ErrorBoundary>
      </main>
      </div>
      <footer className="status-bar">
        <span className={offline ? "over" : ""}>{offline ? "Can't reach Pheme" : "Ready"}</span>
        <span className="spacer" />
        <span>{state.fake ? "Fake engine" : state.engine}</span>
        <span className="text-size">
          <button type="button" aria-label="Smaller text" title="Smaller text" onClick={() => bumpTextScale(-1)}>A−</button>
          <button type="button" aria-label="Larger text" title="Larger text" onClick={() => bumpTextScale(1)}>A+</button>
        </span>
        <span>v{state.version}</span>
      </footer>
      {palette && <Palette commands={commands} onClose={() => setPalette(false)} />}
      {help && <ShortcutsHelp onClose={() => setHelp(false)} />}
      {leaving && <ConfirmDialog title="Discard unsaved changes?" body="You have edits that are not saved. Leaving this page will discard them." confirmLabel="Discard" danger onConfirm={() => { const go = leaving; setLeaving(null); clearUnsaved(); go(); }} onClose={() => setLeaving(null)} />}
      {confirmDelete && (
        <ConfirmDialog
          title="Delete this chat?"
          body={`"${confirmDelete.title}" and its transcript will be permanently deleted. This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={() => void deleteChat(confirmDelete)}
          onClose={() => setConfirmDelete(null)}
        />
      )}
      {!chatsLoaded && <span className="sr-only" role="status">Loading chats</span>}
    </div>
  );
}
