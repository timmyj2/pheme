import { useCallback, useEffect, useRef, useState } from "react";
import { BackupSetting } from "./BackupSetting.tsx";
import { KeybindingSettings } from "./KeybindingSettings.tsx";
import { NotificationSetting } from "./NotificationSetting.tsx";
import { useUnsaved } from "./unsaved.ts";
import { ConfirmDialog } from "./Dialog.tsx";
import { THEMES, parseTheme, themeValue, type Mode } from "./themes/presets.ts";
import { api, type BootstrapState, type CuratorState, type MemoryState, type ModelOption, type Settings, type SkillSummary } from "./api.ts";
import { useToast } from "./toast.tsx";

export function Head({ title, sub }: { title: string; sub?: string }) {
  return (
    <header className="page-head">
      <h2 className="page-title">{title}</h2>
      {sub && <p className="muted">{sub}</p>}
    </header>
  );
}

/** Load something once and on demand; a failed load shows a message with a retry instead of an empty page. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    try {
      setData(await fn());
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
     
  }, deps);
  useEffect(() => { void reload(); }, [reload]);
  return { data, setData, error, reload };
}

export function LoadError({ error, onRetry }: { error: string; onRetry: () => void }) {
  return <div className="panel" role="alert"><p className="over">Could not load this page: {error}</p><div className="row"><button className="btn" onClick={onRetry}>Try again</button></div></div>;
}

function MemoryList({ label, store, entries, limit, onSaved }: { label: string; store: "memory" | "user"; entries: string[]; limit: number; onSaved: (m: MemoryState) => void }) {
  const toast = useToast();
  const joined = entries.join("\n§\n");
  const [text, setText] = useState(joined);
  const [base, setBase] = useState(joined);
  const dirty = text !== base;
  useUnsaved(dirty);
  // Follow outside changes (the agent writes memory too) unless the user is mid-edit.
  useEffect(() => {
    if (!dirty) { setText(joined); setBase(joined); }
     
  }, [joined]);
  const parsed = text.split("§").map((s) => s.trim()).filter(Boolean);
  const used = parsed.join("\n§\n").length;
  const changedElsewhere = dirty && joined !== base;
  const save = async () => {
    try {
      onSaved(await api.saveMemory(store, parsed));
      toast.info("Saved");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <section className="panel">
      <h3>{label}</h3>
      <p className="muted small">Separate entries with a line containing only §.</p>
      <textarea className="area" rows={10} value={text} onChange={(e) => setText(e.target.value)} aria-label={label} />
      <div className="row">
        <span className={used > limit ? "over" : "muted"}>{used.toLocaleString()} / {limit.toLocaleString()} characters</span>
        <button className="btn primary" disabled={used > limit || !dirty} onClick={() => void save()}>Save</button>
        {dirty && <span className="muted small">Unsaved changes</span>}
        {changedElsewhere && <span className="over small">This changed elsewhere. Saving replaces it.</span>}
      </div>
    </section>
  );
}

export function MemoryPage() {
  const { data: m, setData, error, reload } = useLoad(api.memory);
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") void reload(); }, 5000);
    return () => clearInterval(t);
  }, [reload]);
  return (
    <section className="page">
      <Head title="Memory" sub="Facts Pheme loads into every new chat. The agent can edit these too." />
      {error && !m && <LoadError error={error} onRetry={() => void reload()} />}
      {m && (
        <>
          <MemoryList label="User profile" store="user" entries={m.user} limit={m.userLimit} onSaved={setData} />
          <MemoryList label="Environment and conventions" store="memory" entries={m.memory} limit={m.memoryLimit} onSaved={setData} />
        </>
      )}
    </section>
  );
}

const NEW_SKILL = "---\nname: my-skill\ndescription: Use when ...\n---\n\n## Procedure\n1. \n";

export function SkillsPage({ name, onOpen }: { name: string | null; onOpen: (name: string | null) => void }) {
  const toast = useToast();
  const { data: list, error, reload: reloadList } = useLoad<SkillSummary[]>(api.skills);
  const [curator, setCurator] = useState<CuratorState | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [content, setContent] = useState("");
  const [saved, setSaved] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [loadingSkill, setLoadingSkill] = useState(false);
  const [guard, setGuard] = useState<null | (() => void)>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const dirty = (isNew || !!name) && content !== saved;
  useUnsaved(dirty);
  const nameRef = useRef(name);
  nameRef.current = name;

  const loadCurator = useCallback(() => { api.curator().then(setCurator).catch(() => {}); }, []);
  useEffect(() => { loadCurator(); }, [loadCurator]);

  // Open the skill named in the URL.
  useEffect(() => {
    if (!name) { if (!isNew) { setContent(""); setSaved(""); setFiles([]); } return; }
    setIsNew(false);
    setLoadingSkill(true);
    api.skill(name).then((s) => {
      if (nameRef.current !== name) return;
      setContent(s.content); setSaved(s.content); setFiles(s.files);
    }).catch((e: Error) => { toast.error(`Could not open "${name}": ${e.message}`); onOpen(null); }).finally(() => setLoadingSkill(false));
     
  }, [name]);

  // Never lose edits silently: switching away with unsaved changes asks first.
  const guarded = (go: () => void) => (dirty ? setGuard(() => go) : go());
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const save = async () => {
    const target = isNew ? /^name:\s*(\S+)/m.exec(content)?.[1] ?? "" : name ?? "";
    if (!target) { toast.error("Add a name: line to the front matter first."); return; }
    try {
      await api.saveSkill(target, content);
      setSaved(content);
      setIsNew(false);
      toast.info(`Saved "${target}"`);
      await reloadList();
      if (target !== name) onOpen(target);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <section className="page wide">
      <Head title="Skills" sub="Reusable procedures. Pheme writes these after long tasks; you can edit them." />
      <div className="panel">
        <h3>Skill curator</h3>
        <p className="muted small">Every few days Pheme merges overlapping skills and archives ones that have not been used for a long time. Nothing is ever deleted; archived skills stay in the skills/.archive folder.</p>
        <div className="row">
          <button className="btn" disabled={curator?.running} onClick={() => { void api.runCurator().then(() => setTimeout(() => { loadCurator(); void reloadList(); }, 1500)).catch((e: Error) => toast.error(e.message)); }}>{curator?.running ? "Running…" : "Run curator now"}</button>
          <span className="muted small">{curator?.lastRunAt ? `Last run ${new Date(curator.lastRunAt).toLocaleString()}` : "Has not run yet"}</span>
        </div>
        {curator && curator.report.length > 0 && <ul className="small">{curator.report.map((l, i) => <li key={i}>{l}</li>)}</ul>}
      </div>
      {error && !list && <LoadError error={error} onRetry={() => void reloadList()} />}
      <div className="split">
        <div className="panel list">
          <button className="btn" onClick={() => guarded(() => { setIsNew(true); setContent(NEW_SKILL); setSaved(""); setFiles([]); onOpen(null); })}>New skill</button>
          <ul>
            {(list ?? []).map((s) => (
              <li key={s.name} className={name === s.name && !isNew ? "active" : ""}>
                <button aria-current={name === s.name && !isNew ? "true" : undefined} onClick={() => guarded(() => { setIsNew(false); onOpen(s.name); })}><strong>{s.name}</strong><span className="muted small">{s.description}</span></button>
              </li>
            ))}
          </ul>
          {list && list.length === 0 && <p className="muted small">No skills yet.</p>}
        </div>
        <div className="panel grow">
          {name || isNew ? (
            <>
              <textarea className="area tall" value={content} disabled={loadingSkill} onChange={(e) => setContent(e.target.value)} aria-label="Skill content" spellCheck={false} />
              {files.length > 1 && <p className="muted small">Files: {files.join(", ")}</p>}
              <div className="row">
                <button className="btn primary" disabled={!dirty} onClick={() => void save()}>Save</button>
                {!isNew && <button className="btn danger" onClick={() => setConfirmArchive(true)}>Archive</button>}
                {dirty && <span className="muted small">Unsaved changes</span>}
              </div>
            </>
          ) : (
            <p className="muted">Pick a skill to read or edit it.</p>
          )}
        </div>
      </div>
      {guard && <ConfirmDialog title="Discard unsaved changes?" body="You have edits to this skill that are not saved." confirmLabel="Discard" danger onConfirm={() => { const g = guard; setGuard(null); g(); setSaved(content); }} onClose={() => setGuard(null)} />}
      {confirmArchive && name && (
        <ConfirmDialog
          title={`Archive "${name}"?`}
          body="The skill moves to the archive folder and Pheme stops using it. Nothing is deleted."
          confirmLabel="Archive"
          danger
          onConfirm={() => { api.archiveSkill(name).then(() => { toast.info(`Archived "${name}"`); onOpen(null); void reloadList(); }).catch((e: Error) => toast.error(e.message)); }}
          onClose={() => setConfirmArchive(false)}
        />
      )}
    </section>
  );
}

/** Limits the server enforces; the field explains them instead of silently snapping back. */
export const SETTING_RANGES: Partial<Record<keyof Settings, [number, number]>> = {
  skillReviewMinToolSteps: [1, 1000],
  memoryReviewEveryUserMessages: [1, 1000],
  memoryLimit: [100, 100000],
  userLimit: [100, 100000],
  curatorEveryDays: [1, 3650],
  curatorStaleDays: [1, 3650],
};

export function NumberField({ label, value, range, onCommit }: { label: string; value: number; range: [number, number]; onCommit: (n: number) => Promise<void> | void }) {
  const [text, setText] = useState(String(value));
  const [err, setErr] = useState("");
  useEffect(() => { setText(String(value)); setErr(""); }, [value]);
  const commit = async () => {
    const n = Number(text);
    if (text.trim() === "" || !Number.isInteger(n) || n < range[0] || n > range[1]) {
      setErr(`Enter a whole number from ${range[0].toLocaleString()} to ${range[1].toLocaleString()}.`);
      return;
    }
    setErr("");
    if (n !== value) await onCommit(n);
  };
  return (
    <label className="field">{label}
      <input
        inputMode="numeric"
        value={text}
        aria-invalid={!!err}
        onChange={(e) => { setText(e.target.value); setErr(""); }}
        onBlur={() => void commit()}
        onKeyDown={(e) => { if (e.key === "Enter") void commit(); else if (e.key === "Escape") { setText(String(value)); setErr(""); } }}
      />
      {err && <span className="over small" role="alert">{err}</span>}
    </label>
  );
}

export function SettingsPage({ state, onChange }: { state: BootstrapState; onChange: (s: Settings) => void }) {
  const toast = useToast();
  const { data: models } = useLoad<ModelOption[]>(api.models);
  const s = state.settings;
  const set = async (patch: Partial<Settings>) => {
    try {
      onChange(await api.settings(patch));
    } catch (e) {
      toast.error(`Could not save: ${(e as Error).message}`);
    }
  };
  const num = (k: keyof Settings, label: string) => <NumberField label={label} value={s[k] as number} range={SETTING_RANGES[k]!} onCommit={(n) => set({ [k]: n })} />;
  const cur = parseTheme(s.theme);
  const theme = cur.theme;
  const modes: Mode[] = ["system", ...(theme.light ? ["light" as const] : []), ...(theme.dark ? ["dark" as const] : [])];
  const list = models ?? [];
  // Settings search: hide the panels whose text (headings, labels, option names, help text) does not contain the words typed.
  const [find, setFind] = useState("");
  const [shown, setShown] = useState(-1);
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const words = find.toLowerCase().split(/\s+/).filter(Boolean);
    let visible = 0;
    body.current?.querySelectorAll<HTMLElement>(":scope > .panel").forEach((el) => {
      const text = (el.textContent ?? "").toLowerCase();
      const hit = words.every((w) => text.includes(w));
      el.hidden = !hit;
      if (hit) visible++;
    });
    setShown((n) => (n === visible ? n : visible));
  });
  return (
    <section className="page settings-page">
      <Head title="Settings" sub={`Pheme ${state.version} · engine: ${state.engine}${state.fake ? " (fake mode)" : ""}`} />
      <div className="settings-find">
        <input type="search" aria-label="Search settings" placeholder="Search settings (for example: theme, approve, memory)" value={find} onChange={(e) => setFind(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") setFind(""); }} />
        {find.trim() && shown === 0 && <p className="muted small" role="status">No settings match “{find.trim()}”.</p>}
      </div>
      <div className="settings-split">
        <nav className="settings-nav" aria-label="Settings sections">
          {["Model", "Appearance", "Notifications", "Keyboard shortcuts", "Backup and restore", "Permissions", "Learning loops"].map((name) => (
            <button key={name} type="button" onClick={() => {
              const hit = [...(body.current?.querySelectorAll("h3") ?? [])].find((h) => h.textContent === name);
              hit?.scrollIntoView({ block: "start" });
            }}>{name}</button>
          ))}
        </nav>
        <div className="settings-body" ref={body}>
      <div className="panel">
        <h3>Model</h3>
        <label className="field">Chat model
          <select value={s.model} onChange={(e) => void set({ model: e.target.value })}>
            {[{ id: "auto", name: "Auto" }, ...list.filter((m) => m.id !== "auto")].map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
        <label className="field">Background review model
          <select value={s.reviewModel} onChange={(e) => void set({ reviewModel: e.target.value })}>
            <option value="">Cheapest available</option>
            {list.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
        <p className="muted small">Usage so far: {state.usage.turns} chat turns, {state.usage.reviews} background reviews, {state.usage.toolSteps} tool steps.</p>
      </div>
      <div className="panel">
        <h3>Appearance</h3>
        <div className="row">
          <label className="field">Theme
            <select value={theme.name} onChange={(e) => void set({ theme: themeValue(e.target.value, cur.mode) })}>
              {THEMES.map((t) => <option key={t.name} value={t.name}>{t.label}</option>)}
            </select>
          </label>
          <label className="field">Mode
            <select value={modes.includes(cur.mode) ? cur.mode : "system"} onChange={(e) => void set({ theme: themeValue(theme.name, e.target.value as Mode) })}>
              {modes.map((m) => <option key={m} value={m}>{m === "system" ? "Match system" : m[0].toUpperCase() + m.slice(1)}</option>)}
            </select>
          </label>
        </div>
        {(!theme.light || !theme.dark) && <p className="muted small">This theme has only one {theme.dark ? "dark" : "light"} palette.</p>}
        <label className="check">
          <input type="checkbox" defaultChecked={typeof localStorage === "undefined" || localStorage.getItem("pheme-wallpaper") !== "0"} onChange={(e) => { try { localStorage.setItem("pheme-wallpaper", e.target.checked ? "1" : "0"); } catch { /* private mode: this tab still shows it */ } document.documentElement.classList.toggle("wallpaper", e.target.checked); }} />
          Soft background behind the chat (an original gradient, not a picture)
        </label>
      </div>
      <NotificationSetting />
      <KeybindingSettings />
      <BackupSetting />
      <div className="panel">
        <h3>Permissions</h3>
        <label className="check">
          <input type="checkbox" checked={s.autoApproveAll} onChange={(e) => void set({ autoApproveAll: e.target.checked })} />
          Auto-approve all (shell commands and file edits run without asking)
        </label>
        {s.autoApproveAll && <p className="over small">Pheme will run commands and edit files without showing an approval card.</p>}
      </div>
      <div className="panel">
        <h3>Learning loops</h3>
        <label className="check">
          <input type="checkbox" checked={s.loopsEnabled} onChange={(e) => void set({ loopsEnabled: e.target.checked })} />
          Review chats in the background to improve skills and memory (uses extra Copilot requests)
        </label>
        {num("skillReviewMinToolSteps", "Skill review after a turn with at least this many tool steps")}
        {num("memoryReviewEveryUserMessages", "Memory review every this many user messages")}
        <label className="check">
          <input type="checkbox" checked={s.curatorEnabled} onChange={(e) => void set({ curatorEnabled: e.target.checked })} />
          Skill curator: periodically merge overlapping skills and archive unused ones
        </label>
        {num("curatorEveryDays", "Curator runs every this many days")}
        {num("curatorStaleDays", "Archive skills unused for this many days")}
        {num("memoryLimit", "Memory limit (characters)")}
        {num("userLimit", "User profile limit (characters)")}
      </div>
        </div>
      </div>
    </section>
  );
}
