import { useEffect, useState } from "react";
import { api, type BootstrapState, type MemoryState, type ModelOption, type Settings, type SkillSummary } from "./api.ts";

function Head({ title, sub }: { title: string; sub?: string }) {
  return (
    <header className="page-head">
      <h1>{title}</h1>
      {sub && <p className="muted">{sub}</p>}
    </header>
  );
}

function MemoryList({ label, store, entries, limit, onSaved }: { label: string; store: "memory" | "user"; entries: string[]; limit: number; onSaved: (m: MemoryState) => void }) {
  const [text, setText] = useState(entries.join("\n§\n"));
  const [msg, setMsg] = useState("");
  useEffect(() => { setText(entries.join("\n§\n")); }, [entries]);
  const parsed = text.split("§").map((s) => s.trim()).filter(Boolean);
  const used = parsed.join("\n§\n").length;
  const save = async () => {
    try {
      onSaved(await api.saveMemory(store, parsed));
      setMsg("Saved");
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  return (
    <section className="panel">
      <h2>{label}</h2>
      <p className="muted small">Separate entries with a line containing only §.</p>
      <textarea className="area" rows={10} value={text} onChange={(e) => { setText(e.target.value); setMsg(""); }} aria-label={label} />
      <div className="row">
        <span className={used > limit ? "over" : "muted"}>{used} / {limit} characters</span>
        <button className="btn primary" disabled={used > limit} onClick={() => void save()}>Save</button>
        {msg && <span className="muted">{msg}</span>}
      </div>
    </section>
  );
}

export function MemoryPage() {
  const [m, setM] = useState<MemoryState | null>(null);
  useEffect(() => { api.memory().then(setM); }, []);
  if (!m) return <section className="page"><Head title="Memory" /></section>;
  return (
    <section className="page">
      <Head title="Memory" sub="Facts Pheme loads into every new chat. The agent can edit these too." />
      <MemoryList label="User profile" store="user" entries={m.user} limit={m.userLimit} onSaved={setM} />
      <MemoryList label="Environment and conventions" store="memory" entries={m.memory} limit={m.memoryLimit} onSaved={setM} />
    </section>
  );
}

export function SkillsPage() {
  const [list, setList] = useState<SkillSummary[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [msg, setMsg] = useState("");
  const load = () => api.skills().then(setList);
  useEffect(() => { load(); }, []);
  const view = async (name: string) => {
    const s = await api.skill(name);
    setOpen(name);
    setContent(s.content);
    setFiles(s.files);
    setMsg("");
  };
  const NEW = "---\nname: my-skill\ndescription: Use when ...\n---\n\n## Procedure\n1. \n";
  return (
    <section className="page wide">
      <Head title="Skills" sub="Reusable procedures. Pheme writes these after long tasks; you can edit them." />
      <div className="split">
        <div className="panel list">
          <button className="btn" onClick={() => { setOpen("(new)"); setContent(NEW); setFiles([]); setMsg(""); }}>New skill</button>
          <ul>
            {list.map((s) => (
              <li key={s.name} className={open === s.name ? "active" : ""}>
                <button onClick={() => void view(s.name)}><strong>{s.name}</strong><span className="muted small">{s.description}</span></button>
              </li>
            ))}
          </ul>
          {list.length === 0 && <p className="muted small">No skills yet.</p>}
        </div>
        <div className="panel grow">
          {open ? (
            <>
              <textarea className="area tall" value={content} onChange={(e) => setContent(e.target.value)} aria-label="Skill content" />
              {files.length > 1 && <p className="muted small">Files: {files.join(", ")}</p>}
              <div className="row">
                <button className="btn primary" onClick={async () => {
                  const name = open === "(new)" ? /^name:\s*(\S+)/m.exec(content)?.[1] ?? "" : open;
                  try {
                    await api.saveSkill(name, content);
                    setMsg("Saved");
                    await load();
                    setOpen(name);
                  } catch (e) {
                    setMsg((e as Error).message);
                  }
                }}>Save</button>
                {open !== "(new)" && (
                  <button className="btn danger" onClick={async () => { await api.archiveSkill(open); setOpen(null); await load(); }}>Archive</button>
                )}
                {msg && <span className="muted">{msg}</span>}
              </div>
            </>
          ) : (
            <p className="muted">Pick a skill to read or edit it.</p>
          )}
        </div>
      </div>
    </section>
  );
}

const THEME_CHOICES = [
  ["pheme-dark", "Pheme dark"], ["pheme-light", "Pheme light"], ["github-dark", "GitHub dark"], ["github-light", "GitHub light"], ["system", "Match system"],
];

export function SettingsPage({ state, onChange }: { state: BootstrapState; onChange: (s: Settings) => void }) {
  const [models, setModels] = useState<ModelOption[]>([]);
  useEffect(() => { api.models().then(setModels); }, []);
  const s = state.settings;
  const set = async (patch: Partial<Settings>) => onChange(await api.settings(patch));
  const num = (k: keyof Settings, label: string) => (
    <label className="field">{label}
      <input type="number" min={1} value={s[k] as number} onChange={(e) => void set({ [k]: Math.max(1, Number(e.target.value) || 1) })} />
    </label>
  );
  return (
    <section className="page">
      <Head title="Settings" sub={`Pheme ${state.version} · engine: ${state.engine}${state.fake ? " (fake mode)" : ""}`} />
      <div className="panel">
        <h2>Model</h2>
        <label className="field">Chat model
          <select value={s.model} onChange={(e) => void set({ model: e.target.value })}>
            {[{ id: "auto", name: "Auto" }, ...models.filter((m) => m.id !== "auto")].map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
        <label className="field">Background review model
          <select value={s.reviewModel} onChange={(e) => void set({ reviewModel: e.target.value })}>
            <option value="">Cheapest available</option>
            {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
        <p className="muted small">Usage so far: {state.usage.turns} chat turns, {state.usage.reviews} background reviews, {state.usage.toolSteps} tool steps.</p>
      </div>
      <div className="panel">
        <h2>Appearance</h2>
        <label className="field">Theme
          <select value={s.theme} onChange={(e) => void set({ theme: e.target.value })}>
            {THEME_CHOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
      </div>
      <div className="panel">
        <h2>Permissions</h2>
        <label className="check">
          <input type="checkbox" checked={s.autoApproveAll} onChange={(e) => void set({ autoApproveAll: e.target.checked })} />
          Auto-approve all (shell commands and file edits run without asking)
        </label>
        {s.autoApproveAll && <p className="over small">Pheme will run commands and edit files without showing an approval card.</p>}
      </div>
      <div className="panel">
        <h2>Learning loops</h2>
        <label className="check">
          <input type="checkbox" checked={s.loopsEnabled} onChange={(e) => void set({ loopsEnabled: e.target.checked })} />
          Review chats in the background to improve skills and memory (uses extra Copilot requests)
        </label>
        {num("skillReviewMinToolSteps", "Skill review after a turn with at least this many tool steps")}
        {num("memoryReviewEveryUserMessages", "Memory review every this many user messages")}
        {num("memoryLimit", "Memory limit (characters)")}
        {num("userLimit", "User profile limit (characters)")}
      </div>
    </section>
  );
}
