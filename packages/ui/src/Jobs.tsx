import { useEffect, useState } from "react";
import { ConfirmDialog } from "./Dialog.tsx";
import { api, type Job, type JobSchedule } from "./api.ts";
import { LoadError } from "./Pages.tsx";
import { useToast } from "./toast.tsx";

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
  const toast = useToast();
  const [loadError, setLoadError] = useState("");
  const [confirm, setConfirm] = useState<Job | null>(null);
  const load = () => { api.jobs().then((j) => { setJobs(j); setLoadError(""); }).catch((e: Error) => setLoadError(e.message)); };
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, []);

  const create = async () => {
    try {
      if (kind === "once" && !at) { toast.error("Pick a date and time."); return; }
      const schedule: JobSchedule = kind === "interval" ? { kind, everyMinutes: minutes } : kind === "daily" ? { kind, time } : { kind, at: new Date(at).getTime() };
      await api.createJob({ name, prompt, schedule, allowActions: allow });
      setName(""); setPrompt(""); setAllow(false);
      toast.info("Job created");
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <section className="page wide">
      <header className="page-head">
        <h2 className="page-title">Scheduled jobs</h2>
        <p className="muted">Jobs run only while Pheme is open. A job missed while Pheme was closed runs once when it starts.</p>
      </header>
      <div className="panel">
        <h3>New job</h3>
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
        </div>
      </div>
      <div className="panel">
        <h3>Jobs</h3>
        {loadError && jobs.length === 0 && <LoadError error={loadError} onRetry={load} />}
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
              <button className="btn" onClick={() => void api.runJob(j.id).then(() => { toast.info(`Started "${j.name}"`); setTimeout(load, 600); }).catch((e: Error) => toast.error(e.message))}>Run now</button>
              {j.lastChatId && <button className="btn" onClick={() => onOpenChat(j.lastChatId!)}>Open last run</button>}
              <button className="btn" onClick={() => void api.updateJob(j.id, { enabled: !j.enabled }).then(load).catch((e: Error) => toast.error(e.message))}>{j.enabled ? "Pause" : "Resume"}</button>
              <button className="btn danger" onClick={() => setConfirm(j)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
      {confirm && <ConfirmDialog title={`Delete "${confirm.name}"?`} body="The job stops running. Its past chats stay in your chat list." confirmLabel="Delete" danger onConfirm={() => { api.deleteJob(confirm.id).then(load).catch((e: Error) => toast.error(e.message)); }} onClose={() => setConfirm(null)} />}
    </section>
  );
}
