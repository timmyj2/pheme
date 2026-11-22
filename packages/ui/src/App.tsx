import { useCallback, useEffect, useMemo, useState } from "react";
import { ChatView } from "./Chat.tsx";
import { MemoryPage, SettingsPage, SkillsPage } from "./Pages.tsx";
import { Palette, type Command } from "./Palette.tsx";
import { Sidebar, type View } from "./Sidebar.tsx";
import { api, type BootstrapState, type ChatRow } from "./api.ts";
import { applyTheme } from "./themes/presets.ts";

export function App() {
  const [state, setState] = useState<BootstrapState | null>(null);
  const [chats, setChats] = useState<ChatRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [view, setView] = useState<View>("chat");
  const [palette, setPalette] = useState(false);
  const [error, setError] = useState("");

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
    const base: Command[] = [
      { id: "new", label: "New chat", run: () => void newChat() },
      { id: "skills", label: "Go to Skills", run: go("skills") },
      { id: "memory", label: "Go to Memory", run: go("memory") },
      { id: "settings", label: "Go to Settings", run: go("settings") },
      { id: "theme", label: "Toggle light/dark theme", run: () => {
        if (!state) return;
        const t = state.settings.theme;
        const next = t.endsWith("light") ? t.replace("light", "dark") : t.endsWith("dark") ? t.replace("dark", "light") : "pheme-dark";
        void api.settings({ theme: next }).then((settings) => setState({ ...state, settings }));
      } },
    ];
    const chatCmds = chats.map((c) => ({ id: c.id, label: c.title, hint: "chat", run: () => { setActiveId(c.id); setView("chat"); } }));
    return [...base, ...chatCmds];
  }, [chats, state, newChat]);

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
        {view === "skills" && <SkillsPage />}
        {view === "memory" && <MemoryPage />}
        {view === "settings" && <SettingsPage state={state} onChange={(settings) => setState({ ...state, settings })} />}
      </main>
      {palette && <Palette commands={commands} onClose={() => setPalette(false)} />}
    </div>
  );
}
