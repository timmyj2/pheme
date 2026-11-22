import { useCallback, useEffect, useMemo, useState } from "react";
import { ChatView } from "./Chat.tsx";
import { AgentsPage } from "./Agents.tsx";
import { JobsPage } from "./Jobs.tsx";
import { MemoryPage, SettingsPage, SkillsPage } from "./Pages.tsx";
import { Palette, type Command } from "./Palette.tsx";
import { Sidebar, type View } from "./Sidebar.tsx";
import { api, type BootstrapState, type ChatRow } from "./api.ts";
import { THEMES, applyTheme, parseTheme, themeValue } from "./themes/presets.ts";

export function App() {
  const [state, setState] = useState<BootstrapState | null>(null);
  const [chats, setChats] = useState<ChatRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [view, setView] = useState<View>("chat");
  const [palette, setPalette] = useState(false);
  const [openSkill, setOpenSkill] = useState<string | null>(null);
  const [skillNames, setSkillNames] = useState<string[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (palette) api.skills().then((l) => setSkillNames(l.map((x) => x.name))).catch(() => {});
  }, [palette]);

  const refresh = useCallback(() => {
    api.chats().then(setChats).catch(() => {});
    api.state().then(setState).catch(() => {});
  }, []);

  useEffect(() => {
    api.state().then(setState).catch((e: Error) => setError(e.message));
    api.chats().then((c) => {
      setChats(c);
      const first = c.find((x) => !x.archived);
      if (first) setActiveId(first.id);
    }).catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!state) return;
    applyTheme(state.settings.theme);
    if (state.settings.theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const f = () => applyTheme("system");
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, [state?.settings.theme]);

  const newChat = useCallback(async () => {
    const active = chats.find((c) => c.id === activeId);
    if (active && active.title === "New chat" && !active.busy) return setView("chat");
    const c = await api.newChat();
    setChats((prev) => [{ ...c }, ...prev]);
    setActiveId(c.id);
    setView("chat");
  }, [chats, activeId]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const commands = useMemo<Command[]>(() => {
    const go = (v: View) => () => setView(v);
    const active = chats.find((c) => c.id === activeId);
    const setSetting = (patch: Partial<BootstrapState["settings"]>) => {
      if (state) void api.settings(patch).then((settings) => setState({ ...state, settings }));
    };
    const cur = state ? parseTheme(state.settings.theme) : null;
    const base: Command[] = [
      { id: "new", label: "New chat", run: () => void newChat() },
      { id: "skills", label: "Go to Skills", run: go("skills") },
      { id: "memory", label: "Go to Memory", run: go("memory") },
      { id: "agents", label: "Go to Agents", run: go("agents") },
      { id: "jobs", label: "Go to Scheduled jobs", run: go("jobs") },
      { id: "settings", label: "Go to Settings", run: go("settings") },
      { id: "mode", label: "Toggle light/dark mode", run: () => {
        if (!cur) return;
        const dark = document.documentElement.classList.contains("dark");
        setSetting({ theme: themeValue(cur.theme.name, dark ? "light" : "dark") });
      } },
      { id: "auto", label: state?.settings.autoApproveAll ? "Turn off Auto-approve all" : "Turn on Auto-approve all", run: () => setSetting({ autoApproveAll: !state?.settings.autoApproveAll }) },
      { id: "loops", label: state?.settings.loopsEnabled ? "Turn off learning loops" : "Turn on learning loops", run: () => setSetting({ loopsEnabled: !state?.settings.loopsEnabled }) },
    ];
    if (active) {
      base.push(
        { id: "stop", label: "Stop current chat", run: () => void api.stop(active.id) },
        { id: "pin", label: active.pinned ? "Unpin this chat" : "Pin this chat", run: () => void api.patchChat(active.id, { pinned: !active.pinned }).then(refresh) },
        { id: "archive", label: active.archived ? "Unarchive this chat" : "Archive this chat", run: () => void api.patchChat(active.id, { archived: !active.archived }).then(refresh) },
      );
    }
    const themeCmds = THEMES.map((t) => ({ id: `theme-${t.name}`, label: `Theme: ${t.label}`, hint: "appearance", run: () => cur && setSetting({ theme: themeValue(t.name, cur.mode) }) }));
    const skillCmds = skillNames.map((n) => ({ id: `skill-${n}`, label: `Open skill: ${n}`, hint: "skill", run: () => { setOpenSkill(n); setView("skills"); } }));
    const chatCmds = chats.map((c) => ({ id: c.id, label: c.title, hint: c.archived ? "archived chat" : "chat", run: () => { setActiveId(c.id); setView("chat"); } }));
    return [...base, ...themeCmds, ...skillCmds, ...chatCmds];
  }, [chats, state, newChat, activeId, skillNames, refresh]);

  if (error) return <div className="fatal"><h1>Pheme</h1><p>{error}</p><p className="muted">Open Pheme from the link printed in the terminal; it contains a one-time token.</p></div>;
  if (!state) return <div className="fatal muted">Loading…</div>;

  const active = chats.find((c) => c.id === activeId);
  const patch = async (c: ChatRow, p: Partial<Pick<ChatRow, "pinned" | "archived">>) => {
    await api.patchChat(c.id, p);
    refresh();
  };
  return (
    <div className="shell">
      <Sidebar
        chats={chats}
        activeId={activeId}
        view={view}
        onNew={() => void newChat()}
        onOpen={(id) => { setActiveId(id); setView("chat"); }}
        onView={setView}
        onPin={(c) => void patch(c, { pinned: !c.pinned })}
        onArchive={(c) => void patch(c, { archived: !c.archived })}
      />
      <main className="main">
        {view === "chat" && (active ? <ChatView key={active.id} chatId={active.id} title={active.title} onTurnEnd={refresh} /> : (
          <div className="fatal muted"><button className="btn primary" onClick={() => void newChat()}>Start a chat</button></div>
        ))}
        {view === "skills" && <SkillsPage key={openSkill ?? "none"} initial={openSkill} />}
        {view === "memory" && <MemoryPage />}
        {view === "agents" && <AgentsPage onOpenChat={(id) => { refresh(); setActiveId(id); setView("chat"); }} />}
        {view === "jobs" && <JobsPage onOpenChat={(id) => { refresh(); setActiveId(id); setView("chat"); }} />}
        {view === "settings" && <SettingsPage state={state} onChange={(settings) => setState({ ...state, settings })} />}
      </main>
      {palette && <Palette commands={commands} onClose={() => setPalette(false)} />}
    </div>
  );
}
