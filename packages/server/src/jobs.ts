import path from "node:path";
import { randomUUID } from "node:crypto";
import type { App } from "./app.ts";
import type { Job, JobSchedule } from "./protocol.ts";
import { readJson, writeJson } from "./settings.ts";

const TICK_MS = 30_000;

export function validateSchedule(s: unknown): JobSchedule {
  const x = s as Partial<{ kind: string; everyMinutes: number; time: string; at: number }>;
  if (x?.kind === "interval" && Number.isFinite(x.everyMinutes) && x.everyMinutes! >= 1) return { kind: "interval", everyMinutes: Math.floor(x.everyMinutes!) };
  if (x?.kind === "daily" && /^([01]\d|2[0-3]):[0-5]\d$/.test(x.time ?? "")) return { kind: "daily", time: x.time! };
  if (x?.kind === "once" && Number.isFinite(x.at)) return { kind: "once", at: x.at! };
  throw new Error("bad schedule");
}

/** First run time strictly after `from` (null when a one-time job has passed). */
export function nextRun(s: JobSchedule, from: number): number | null {
  if (s.kind === "interval") return from + s.everyMinutes * 60_000;
  if (s.kind === "once") return s.at > from ? s.at : null;
  const [h, m] = s.time.split(":").map(Number);
  const d = new Date(from);
  d.setHours(h, m, 0, 0);
  if (d.getTime() <= from) d.setDate(d.getDate() + 1);
  return d.getTime();
}

export class JobStore {
  private file: string;
  constructor(dataDir: string) {
    this.file = path.join(dataDir, "jobs.json");
  }
  list(): Job[] {
    return readJson<Job[]>(this.file, []);
  }
  private save(jobs: Job[]) {
    writeJson(this.file, jobs);
  }
  get(id: string): Job | undefined {
    return this.list().find((j) => j.id === id);
  }
  create(input: { name: string; prompt: string; schedule: unknown; allowActions?: boolean }, now = Date.now()): Job {
    const name = String(input.name ?? "").trim();
    const prompt = String(input.prompt ?? "").trim();
    if (!name || !prompt) throw new Error("name and prompt are required");
    const schedule = validateSchedule(input.schedule);
    const job: Job = {
      id: randomUUID(), name: name.slice(0, 80), prompt, schedule,
      allowActions: input.allowActions === true, enabled: true, createdAt: now,
      nextRunAt: nextRun(schedule, now), lastRunAt: null, lastChatId: null, lastStatus: null,
    };
    this.save([...this.list(), job]);
    return job;
  }
  /** allowActions can never be changed after creation. */
  update(id: string, patch: Partial<Pick<Job, "name" | "prompt" | "enabled">> & { schedule?: unknown }, now = Date.now()): Job | undefined {
    const jobs = this.list();
    const j = jobs.find((x) => x.id === id);
    if (!j) return undefined;
    if (typeof patch.name === "string" && patch.name.trim()) j.name = patch.name.trim().slice(0, 80);
    if (typeof patch.prompt === "string" && patch.prompt.trim()) j.prompt = patch.prompt.trim();
    if (patch.schedule !== undefined) {
      j.schedule = validateSchedule(patch.schedule);
      j.nextRunAt = nextRun(j.schedule, now);
    }
    if (typeof patch.enabled === "boolean") {
      j.enabled = patch.enabled;
      if (j.enabled && j.nextRunAt === null) j.nextRunAt = nextRun(j.schedule, now);
    }
    this.save(jobs);
    return j;
  }
  patchRaw(id: string, patch: Partial<Job>) {
    const jobs = this.list();
    const j = jobs.find((x) => x.id === id);
    if (j) {
      Object.assign(j, patch);
      this.save(jobs);
    }
  }
  remove(id: string) {
    this.save(this.list().filter((j) => j.id !== id));
  }
}

/** Runs jobs only while Pheme is open. On start, each missed job runs once. */
export class Scheduler {
  private timer: NodeJS.Timeout | undefined;
  constructor(private app: App, private now: () => number = Date.now) {}

  start(): void {
    this.tick();
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.timer.unref();
  }
  stop(): void {
    clearInterval(this.timer);
  }

  /** Run every enabled job whose time has come, once each. */
  tick(): void {
    const now = this.now();
    this.app.curator.maybeRun(now);
    for (const j of this.app.jobs.list()) {
      if (j.enabled && j.nextRunAt !== null && j.nextRunAt <= now) this.app.background(this.run(j.id));
    }
  }

  async run(id: string): Promise<void> {
    const j = this.app.jobs.get(id);
    if (!j) return;
    const now = this.now();
    // Advance first so a slow run is never started twice and missed runs collapse into one.
    const next = nextRun(j.schedule, now);
    this.app.jobs.patchRaw(id, { nextRunAt: next, lastRunAt: now, enabled: j.schedule.kind === "once" ? false : j.enabled });
    const chat = this.app.store.create({ title: `Job: ${j.name}` });
    this.app.chatPolicy.set(chat.id, j.allowActions ? "allow" : "deny");
    this.app.jobs.patchRaw(id, { lastChatId: chat.id, lastStatus: null });
    try {
      this.app.send(chat.id, j.prompt);
      await this.app.waitIdle(chat.id);
      const failed = this.app.store.events(chat.id).some((e) => e.type === "error");
      this.app.jobs.patchRaw(id, { lastStatus: failed ? "error" : "ok" });
    } catch {
      this.app.jobs.patchRaw(id, { lastStatus: "error" });
    }
  }
}
