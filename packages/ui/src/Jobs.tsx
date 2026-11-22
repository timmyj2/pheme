import { useEffect, useState } from "react";
import { api, type Job, type JobSchedule } from "./api.ts";

const describe = (s: JobSchedule) =>
  s.kind === "interval" ? `every ${s.everyMinutes} min` : s.kind === "daily" ? `daily at ${s.time}` : `once, ${new Date(s.at).toLocaleString()}`;

export function JobsPage({ onOpenChat }: { onOpenChat: (id: string) => void }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [kind, setKind] = useState<"interval" | "daily" | "once">("daily");
  const [minutes, setMinutes] = useState(60);
  const [time, setTime] = useState("09:00");
  const [at, setAt] = useState("");
  const [allow, setAllow] = useState(false);
  const [msg, setMsg] = useState("");
  const load = () => { api.jobs().then(setJobs).catch(() => {}); };
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, []);

  const create = async () => {
    try {
      const schedule: JobSchedule = kind === "interval" ? { kind, everyMinutes: minutes } : kind === "daily" ? { kind, time } : { kind, at: new Date(at).getTime() };
      await api.createJob({ name, prompt, schedule, allowActions: allow });
      setName(""); setPrompt(""); setAllow(false); setMsg("");
      load();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  return (
    <section className="page wide">
      <header className="page-head">
        <h1>Scheduled jobs</h1>
        <p className="muted">Jobs run only while Pheme is open. A job missed while Pheme was closed runs once when it starts.</p>
      </header>
      <div className="panel">
        <h2>New job</h2>
        <label className="field">Name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="field">What should it do?<textarea className="area" rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} /></label>
        <div className="row">
          <label className="field">Repeat
            <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              <option value="daily">Daily</option><option value="interval">Every N minutes</option><option value="once">Once</option>
            </select>
          </label>
          {kind === "interval" && <label className="field">Minutes<input type="number" min={1} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} /></label>}
          {kind === "daily" && <label className="field">Time<input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>}
          {kind === "once" && <label className="field">When<input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} /></label>}
        </div>
        <label className="check">
          <input type="checkbox" checked={allow} onChange={(e) => setAllow(e.target.checked)} />
          Allow this job to run shell commands and edit files (cannot be changed later)
        </label>
        <div className="row">
          <button className="btn primary" disabled={!name.trim() || !prompt.trim()} onClick={() => void create()}>Create job</button>
          {msg && <span className="over">{msg}</span>}
        </div>
      </div>
      <div className="panel">
        <h2>Jobs</h2>
        {jobs.length === 0 && <p className="muted small">No jobs yet.</p>}
        {jobs.map((j) => (
          <div key={j.id} className="job">
            <div className="job-main">
              <strong>{j.name}</strong> <span className="muted small">{describe(j.schedule)} · {j.allowActions ? "can act" : "read-only"}</span>
              <div className="muted small">
                Next: {j.enabled && j.nextRunAt ? new Date(j.nextRunAt).toLocaleString() : "off"}
                {j.lastRunAt ? ` · Last: ${new Date(j.lastRunAt).toLocaleString()} (${j.lastStatus ?? "running"})` : ""}
              </div>
            </div>
            <div className="row">
              <button className="btn" onClick={() => void api.runJob(j.id).then(() => setTimeout(load, 600))}>Run now</button>
              {j.lastChatId && <button className="btn" onClick={() => onOpenChat(j.lastChatId!)}>Open last run</button>}
              <button className="btn" onClick={() => void api.updateJob(j.id, { enabled: !j.enabled }).then(load)}>{j.enabled ? "Pause" : "Resume"}</button>
              <button className="btn danger" onClick={() => void api.deleteJob(j.id).then(load)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
