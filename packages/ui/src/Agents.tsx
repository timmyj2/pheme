import { useEffect, useState } from "react";
import { AgentCard } from "./AgentCard.tsx";
import { ConfirmDialog } from "./Dialog.tsx";
import { api, type AgentProfile, type AgentRun } from "./api.ts";
import { LoadError } from "./Pages.tsx";
import { useToast } from "./toast.tsx";
import { useUnsaved } from "./unsaved.ts";

const BLANK: AgentProfile = { name: "", description: "", instructions: "", tools: [] };

export function AgentsPage({ onOpenChat }: { onOpenChat: (id: string) => void }) {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [edit, setEdit] = useState<AgentProfile | null>(null);
  const [tools, setTools] = useState("");
  const toast = useToast();
  const [loadError, setLoadError] = useState("");
  const [confirm, setConfirm] = useState<AgentProfile | null>(null);
  const load = () => {
    api.agentRuns().then((r) => { setRuns(r); setLoadError(""); }).catch((e: Error) => setLoadError(e.message));
    api.agentProfiles().then(setProfiles).catch(() => {});
  };
  useEffect(() => { load(); const t = setInterval(() => api.agentRuns().then(setRuns).catch(() => {}), 2000); return () => clearInterval(t); }, []);

  const save = async () => {
    if (!edit) return;
    try {
      await api.saveAgentProfile({ ...edit, tools: tools.split(",").map((t) => t.trim()).filter(Boolean) });
      setEdit(null); toast.info("Saved"); load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  // The edit form counts as unsaved once it differs from what was opened.
  const [baseline, setBaseline] = useState("");
  const [existing, setExisting] = useState(false); // editing a saved agent (its name is fixed) vs creating a new one
  const snap = (p: AgentProfile | null, t: string) => JSON.stringify(p && [p.name, p.description, p.instructions, t.trim()]);
  useUnsaved(!!edit && snap(edit, tools) !== baseline);
  const open = (p: AgentProfile, t: string) => { setExisting(profiles.some((x) => x.name === p.name)); setEdit(p); setTools(t); setBaseline(snap(p, t)); };
  const running = runs.filter((r) => r.status === "running");

  return (
    <section className="page wide">
      <header className="page-head">
        <h2 className="page-title">Agents</h2>
        <p className="muted">Sub-agents work in their own sessions. In a chat, ask Pheme to split work up (for example: "research A and B in parallel"), or save an agent below and Copilot can hand it tasks. Saved agents apply to new chats.</p>
      </header>
      <div className="panel">
        <h3>Running now ({running.length})</h3>
        {loadError && runs.length === 0 && <LoadError error={loadError} onRetry={load} />}
        {running.length === 0 && <p className="muted small">Nothing running.</p>}
        {running.map((r) => <AgentCard key={r.id} run={r} onOpenChat={onOpenChat} />)}
      </div>
      <div className="panel">
        <h3>Saved agents</h3>
        <div className="row"><button className="btn" onClick={() => open({ ...BLANK }, "")}>New agent</button></div>
        {profiles.length === 0 && !edit && <p className="muted small">No saved agents yet.</p>}
        {profiles.map((p) => (
          <div key={p.name} className="job">
            <div className="job-main"><strong>{p.name}</strong><div className="muted small">{p.description}</div></div>
            <div className="row">
              <button className="btn" onClick={() => open(p, p.tools.join(", "))}>Edit</button>
              <button className="btn danger" onClick={() => setConfirm(p)}>Archive</button>
            </div>
          </div>
        ))}
        {edit && (
          <div className="panel">
            <label className="field">Name (lowercase, - or _)<input value={edit.name} disabled={existing} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
            <label className="field">When should it be used?<input value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></label>
            <label className="field">Instructions<textarea className="area" rows={6} value={edit.instructions} onChange={(e) => setEdit({ ...edit, instructions: e.target.value })} /></label>
            <label className="field">Allowed Copilot tools (comma-separated; empty = all)<input value={tools} onChange={(e) => setTools(e.target.value)} /></label>
            <div className="row">
              <button className="btn primary" onClick={() => void save()}>Save</button>
              <button className="btn" onClick={() => setEdit(null)}>Cancel</button>
            </div>
          </div>
        )}
      </div>
      <div className="panel">
        <h3>History</h3>
        {runs.filter((r) => r.status !== "running").length === 0 && <p className="muted small">No finished runs yet.</p>}
        {runs.filter((r) => r.status !== "running").slice(0, 50).map((r) => <AgentCard key={r.id} run={r} onOpenChat={onOpenChat} />)}
      </div>
      {confirm && <ConfirmDialog title={`Archive "${confirm.name}"?`} body="The agent moves to the archive folder and Pheme stops offering it. Nothing is deleted." confirmLabel="Archive" danger onConfirm={() => { api.archiveAgentProfile(confirm.name).then(load).catch((e: Error) => toast.error(e.message)); }} onClose={() => setConfirm(null)} />}
    </section>
  );
}
