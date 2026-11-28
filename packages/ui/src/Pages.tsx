import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { OverlayView } from "./components/overlay/overlay-view.tsx";
import { OverlayBreadcrumb, OverlayMain, OverlayNav, OverlaySplitLayout, type NavGroup } from "./components/overlay/overlay-split-layout.tsx";
import { SettingRow, SettingSelect, SettingsHeading, SettingsPanel, SwitchRow } from "./components/overlay/settings-rows.tsx";
import { formatCombo, matches } from "./keybindings.ts";
import { useBindings } from "./useBindings.ts";
import { IconBell, IconBrain, IconCloudUpload, IconCube, IconKeyboard, IconLock, IconMessage, IconPalette, IconSearch } from "./lib/icons.ts";
import { BackupSetting } from "./BackupSetting.tsx";
import { KeybindingSettings } from "./KeybindingSettings.tsx";
import { NotificationSetting } from "./NotificationSetting.tsx";
import { useUnsaved } from "./unsaved.ts";
import { ConfirmDialog } from "./Dialog.tsx";
import { THEMES, parseTheme, themeValue, type Mode } from "./themes/presets.ts";
import { api, type BootstrapState, type CuratorState, type MemoryState, type ModelOption, type Settings, type SkillSummary } from "./api.ts";
import { useToast } from "./toast.tsx";
import { TID } from "./testids.ts";

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

// Adapted from hermes-agent (MIT, Copyright (c) 2025 Nous Research), apps/desktop/src/app/settings/index.tsx (layout, search pill, breadcrumb) @ 5688461d
export function NumberField({ label, value, range, onCommit }: { label: string; value: number; range: [number, number]; onCommit: (n: number) => Promise<void> | void }) {
  const [text, setText] = useState(String(value));
  const [err, setErr] = useState("");
  const id = useId();
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
    <SettingRow
      control={
        <input
          aria-invalid={!!err}
          className="settings-number"
          id={id}
          inputMode="numeric"
          onBlur={() => void commit()}
          onChange={(e) => { setText(e.target.value); setErr(""); }}
          onKeyDown={(e) => { if (e.key === "Enter") void commit(); else if (e.key === "Escape") { setText(String(value)); setErr(""); } }}
          value={text}
        />
      }
      id={id}
      title={label}
      below={err ? <span className="over small" role="alert">{err}</span> : undefined}
    />
  );
}

/** The left rail. Each leaf is a settings page; a group with children expands to its sub-pages. */
const NAV: NavGroup[] = [
  { id: "model", label: "Model", icon: IconCube, children: [{ id: "model-main", label: "Main model" }, { id: "model-review", label: "Review model" }] },
  { id: "chat", label: "Chat", icon: IconMessage },
  { id: "appearance", label: "Appearance", icon: IconPalette },
  { id: "notifications", label: "Notifications", icon: IconBell },
  { id: "shortcuts", label: "Keyboard shortcuts", icon: IconKeyboard },
  { id: "backup", label: "Backup & transfer", icon: IconCloudUpload },
  { id: "safety", label: "Safety", icon: IconLock },
  { id: "loops", label: "Learning loops", icon: IconBrain },
];

function crumbs(page: string): { group?: string; leaf: string } {
  for (const g of NAV) {
    if (g.id === page) return { leaf: g.label };
    const child = g.children?.find((c) => c.id === page);
    if (child) return { group: g.label, leaf: child.label };
  }
  return { leaf: "Settings" };
}

export function SettingsPage({ state, onChange, onClose }: { state: BootstrapState; onChange: (s: Settings) => void; onClose: () => void }) {
  const toast = useToast();
  const keys = useBindings();
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

  const [page, setPage] = useState("model-main");
  // Search: any word typed shows every group whose text contains all the words (across pages). An empty box shows the open page.
  const [find, setFind] = useState("");
  const [shown, setShown] = useState(-1);
  const body = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const query = find.trim();
  useLayoutEffect(() => {
    const words = find.toLowerCase().split(/\s+/).filter(Boolean);
    let visible = 0;
    body.current?.querySelectorAll<HTMLElement>(`[data-testid="${TID.settingsPanel}"]`).forEach((el) => {
      const hit = words.length > 0 ? words.every((w) => (el.textContent ?? "").toLowerCase().includes(w)) : el.dataset.page === page;
      el.hidden = !hit;
      if (hit) visible++;
    });
    setShown((n) => (n === visible ? n : visible));
  });
  // The palette combo (Ctrl/Cmd+K) focuses this search box while settings is open, instead of opening the palette over it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!matches(e, keys.palette)) return;
      e.preventDefault();
      e.stopPropagation();
      search.current?.focus();
      search.current?.select();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [keys]);

  const searchPill = (
    <label className="settings-overlay flex h-7 items-center gap-1.5 rounded-full border border-(--ui-stroke-secondary) bg-(--ui-chat-surface-background) px-2.5 text-(--ui-text-tertiary) shadow-sm transition-colors focus-within:text-foreground">
      <IconSearch aria-hidden="true" className="size-3" />
      <input
        aria-label="Search settings"
        className="settings-search w-24 bg-transparent text-xs text-foreground outline-none placeholder:text-(--ui-text-tertiary)"
        onChange={(e) => setFind(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Escape" && find) { e.preventDefault(); setFind(""); } }}
        placeholder="Search"
        ref={search}
        type="search"
        value={find}
      />
      <kbd className="rounded border border-(--ui-stroke-secondary) px-1 font-mono text-[0.625rem] leading-4">{formatCombo(keys.palette)}</kbd>
    </label>
  );
  const crumb = query ? { leaf: "Search results" } : crumbs(page);

  return (
    <OverlayView edgeBadge={searchPill} label="Settings" onClose={onClose} closeLabel="Close settings">
      <OverlaySplitLayout>
        <OverlayNav
          groups={NAV}
          label="Settings sections"
          onSelect={(id) => { setPage(id); setFind(""); }}
          selected={page}
        />
        <OverlayMain>
          <OverlayBreadcrumb group={crumb.group} leaf={crumb.leaf} root="Settings" />
          {query && shown === 0 && <p className="mb-3 text-xs text-(--ui-text-tertiary)" role="status">No settings match “{query}”.</p>}
          <div className="flex flex-col" ref={body}>
            <SettingsPanel page="model-main">
              <SettingRow
                control={<SettingSelect id="chat-model" label="Chat model" onChange={(v) => void set({ model: v })} value={s.model}>
                  {[{ id: "auto", name: "Auto" }, ...list.filter((m) => m.id !== "auto")].map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </SettingSelect>}
                description="Used for new chats. Use the model picker in the composer to change one chat."
                id="chat-model"
                title="Chat model"
              />
              <p className="text-xs text-(--ui-text-tertiary)">Usage so far: {state.usage.turns} chat turns, {state.usage.reviews} background reviews, {state.usage.toolSteps} tool steps.</p>
            </SettingsPanel>
            <SettingsPanel page="model-review">
              <SettingsHeading>Review model</SettingsHeading>
              <SettingRow
                control={<SettingSelect id="review-model" label="Background review model" onChange={(v) => void set({ reviewModel: v })} value={s.reviewModel}>
                  <option value="">Cheapest available</option>
                  {list.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </SettingSelect>}
                description="Runs skill and memory reviews in the background."
                id="review-model"
                title="Background review model"
              />
            </SettingsPanel>
            <SettingsPanel page="chat">
              <SettingsHeading>Chat</SettingsHeading>
              <SettingRow
                control={<SettingSelect id="text-size" label="Text size" onChange={(v) => { const n = Number(v); try { localStorage.setItem("pheme-text-scale", String(n)); } catch { /* private mode */ } document.documentElement.style.setProperty("--chat-text-scale", String(n / 100)); }} value={typeof localStorage === "undefined" ? "110" : (localStorage.getItem("pheme-text-scale") || "110")}>
                  <option value="80">Smaller</option>
                  <option value="90">Small</option>
                  <option value="100">Normal</option>
                  <option value="110">Default</option>
                  <option value="125">Larger</option>
                </SettingSelect>}
                id="text-size"
                title="Text size"
                description="Scales the chat text."
              />
              <SwitchRow
                checked={typeof localStorage !== "undefined" && localStorage.getItem("pheme-wallpaper") === "1"}
                description="Off unless you turn it on."
                label="Soft background behind the chat"
                onChange={(on) => { try { localStorage.setItem("pheme-wallpaper", on ? "1" : "0"); } catch { /* private mode: this tab still shows it */ } document.documentElement.classList.toggle("wallpaper", on); }}
              />
            </SettingsPanel>
            <SettingsPanel page="appearance">
              <SettingsHeading>Appearance</SettingsHeading>
              <SettingRow
                control={<SettingSelect id="theme" label="Theme" onChange={(v) => void set({ theme: themeValue(v, cur.mode) })} value={theme.name}>
                  {THEMES.map((t) => <option key={t.name} value={t.name}>{t.label}</option>)}
                </SettingSelect>}
                id="theme"
                title="Theme"
              />
              <SettingRow
                control={<SettingSelect id="mode" label="Mode" onChange={(v) => void set({ theme: themeValue(theme.name, v as Mode) })} value={modes.includes(cur.mode) ? cur.mode : "system"}>
                  {modes.map((m) => <option key={m} value={m}>{m === "system" ? "Match system" : m[0]!.toUpperCase() + m.slice(1)}</option>)}
                </SettingSelect>}
                description={!theme.light || !theme.dark ? `This theme has only one ${theme.dark ? "dark" : "light"} palette.` : undefined}
                id="mode"
                title="Mode"
              />
            </SettingsPanel>
            <SettingsPanel page="notifications">
              <NotificationSetting />
            </SettingsPanel>
            <SettingsPanel page="shortcuts">
              <KeybindingSettings />
            </SettingsPanel>
            <SettingsPanel page="backup">
              <BackupSetting />
            </SettingsPanel>
            <SettingsPanel page="safety">
              <SettingsHeading>Permissions</SettingsHeading>
              <SwitchRow
                checked={s.autoApproveAll}
                below={s.autoApproveAll ? <p className="over text-xs">Pheme will run commands and edit files without showing an approval card.</p> : undefined}
                label="Auto-approve all (shell commands and file edits run without asking)"
                onChange={(on) => void set({ autoApproveAll: on })}
              />
            </SettingsPanel>
            <SettingsPanel page="loops">
              <SettingsHeading>Learning loops</SettingsHeading>
              <SwitchRow
                checked={s.loopsEnabled}
                label="Review chats in the background to improve skills and memory (uses extra Copilot requests)"
                onChange={(on) => void set({ loopsEnabled: on })}
              />
              {num("skillReviewMinToolSteps", "Skill review after a turn with at least this many tool steps")}
              {num("memoryReviewEveryUserMessages", "Memory review every this many user messages")}
              <SwitchRow
                checked={s.curatorEnabled}
                label="Skill curator: periodically merge overlapping skills and archive unused ones"
                onChange={(on) => void set({ curatorEnabled: on })}
              />
              {num("curatorEveryDays", "Curator runs every this many days")}
              {num("curatorStaleDays", "Archive skills unused for this many days")}
              {num("memoryLimit", "Memory limit (characters)")}
              {num("userLimit", "User profile limit (characters)")}
            </SettingsPanel>
          </div>
        </OverlayMain>
      </OverlaySplitLayout>
    </OverlayView>
  );
}
