import { useEffect, useState } from "react";
import { AgentCard } from "./AgentCard.tsx";
import { api, type AgentProfile, type AgentRun } from "./api.ts";

const BLANK: AgentProfile = { name: "", description: "", instructions: "", tools: [] };

export function AgentsPage({ onOpenChat }: { onOpenChat: (id: string) => void }) {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [edit, setEdit] = useState<AgentProfile | null>(null);
  const [tools, setTools] = useState("");
  const [msg, setMsg] = useState("");
  const load = () => {
    api.agentRuns().then(setRuns).catch(() => {});
    api.agentProfiles().then(setProfiles).catch(() => {});
  };
  useEffect(() => { load(); const t = setInterval(() => api.agentRuns().then(setRuns).catch(() => {}), 2000); return () => clearInterval(t); }, []);

  const save = async () => {
    if (!edit) return;
    try {
      await api.saveAgentProfile({ ...edit, tools: tools.split(",").map((t) => t.trim()).filter(Boolean) });
      setEdit(null); setMsg(""); load();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  const running = runs.filter((r) => r.status === "running");

  return (
    <section className="page wide">
      <header className="page-head">
        <h1>Agents</h1>
        <p className="muted">Sub-agents work in their own sessions. In a chat, ask Pheme to split work up (for example: "research A and B in parallel"), or save an agent below and Copilot can hand it tasks. Saved agents apply to new chats.</p>
      </header>
      <div className="panel">
        <h2>Running now ({running.length})</h2>
        {running.length === 0 && <p className="muted small">Nothing running.</p>}
        {running.map((r) => <AgentCard key={r.id} run={r} onOpenChat={onOpenChat} />)}
      </div>
      <div className="panel">
        <h2>Saved agents</h2>
        <div className="row"><button className="btn" onClick={() => { setEdit({ ...BLANK }); setTools(""); setMsg(""); }}>New agent</button></div>
        {profiles.length === 0 && !edit && <p className="muted small">No saved agents yet.</p>}
        {profiles.map((p) => (
          <div key={p.name} className="job">
            <div className="job-main"><strong>{p.name}</strong><div className="muted small">{p.description}</div></div>
            <div className="row">
              <button className="btn" onClick={() => { setEdit(p); setTools(p.tools.join(", ")); setMsg(""); }}>Edit</button>
              <button className="btn danger" onClick={() => void api.archiveAgentProfile(p.name).then(load)}>Archive</button>
            </div>
          </div>
        ))}
        {edit && (
          <div className="panel">
            <label className="field">Name (lowercase, - or _)<input value={edit.name} disabled={profiles.some((p) => p.name === edit.name)} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
            <label className="field">When should it be used?<input value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></label>
            <label className="field">Instructions<textarea className="area" rows={6} value={edit.instructions} onChange={(e) => setEdit({ ...edit, instructions: e.target.value })} /></label>
            <label className="field">Allowed Copilot tools (comma-separated; empty = all)<input value={tools} onChange={(e) => setTools(e.target.value)} /></label>
            <div className="row">
              <button className="btn primary" onClick={() => void save()}>Save</button>
              <button className="btn" onClick={() => setEdit(null)}>Cancel</button>
              {msg && <span className="over">{msg}</span>}
            </div>
          </div>
        )}
      </div>
      <div className="panel">
        <h2>History</h2>
        {runs.filter((r) => r.status !== "running").length === 0 && <p className="muted small">No finished runs yet.</p>}
        {runs.filter((r) => r.status !== "running").slice(0, 50).map((r) => <AgentCard key={r.id} run={r} onOpenChat={onOpenChat} />)}
      </div>
    </section>
  );
}
