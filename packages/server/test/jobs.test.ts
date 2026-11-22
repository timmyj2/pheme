import { describe, expect, it } from "vitest";
import { Scheduler, nextRun, validateSchedule } from "../src/jobs.ts";
import { makeApp } from "./helpers.ts";

const T0 = new Date(2026, 10, 22, 10, 0, 0).getTime();

describe("schedules", () => {
  it("computes next runs", () => {
    expect(nextRun({ kind: "interval", everyMinutes: 15 }, T0)).toBe(T0 + 15 * 60000);
    expect(nextRun({ kind: "daily", time: "11:30" }, T0)).toBe(new Date(2026, 10, 22, 11, 30).getTime());
    expect(nextRun({ kind: "daily", time: "09:00" }, T0)).toBe(new Date(2026, 10, 23, 9, 0).getTime());
    expect(nextRun({ kind: "once", at: T0 - 1 }, T0)).toBeNull();
  });
  it("rejects bad schedules", () => {
    expect(() => validateSchedule({ kind: "interval", everyMinutes: 0 })).toThrow();
    expect(() => validateSchedule({ kind: "daily", time: "25:00" })).toThrow();
    expect(() => validateSchedule({ kind: "weekly" })).toThrow();
  });
});

describe("scheduler", () => {
  it("runs a due job once, in its own chat, and schedules the next run", async () => {
    const { app } = makeApp();
    const job = app.jobs.create({ name: "Nightly", prompt: "hello job", schedule: { kind: "interval", everyMinutes: 60 } }, T0);
    let now = T0 + 61 * 60000;
    const sch = new Scheduler(app, () => now);
    sch.tick();
    sch.tick(); // second tick must not start it again
    await app.drain();
    const j = app.jobs.get(job.id)!;
    expect(j.lastStatus).toBe("ok");
    expect(j.nextRunAt).toBe(now + 60 * 60000);
    expect(app.store.events(j.lastChatId!).some((e) => e.type === "message")).toBe(true);
    expect(app.store.get(j.lastChatId!)?.title).toBe("Job: Nightly");
    now += 1;
    sch.tick();
    await app.drain();
    expect(app.store.list().filter((c) => c.title === "Job: Nightly")).toHaveLength(1);
  });

  it("missed runs collapse into one on start", async () => {
    const { app } = makeApp();
    const job = app.jobs.create({ name: "Hourly", prompt: "x", schedule: { kind: "interval", everyMinutes: 60 } }, T0);
    const sch = new Scheduler(app, () => T0 + 10 * 24 * 3600_000);
    sch.tick();
    await app.drain();
    expect(app.store.list().filter((c) => c.title === "Job: Hourly")).toHaveLength(1);
    expect(app.jobs.get(job.id)!.nextRunAt).toBe(T0 + 10 * 24 * 3600_000 + 3600_000);
  });

  it("one-time jobs run once then disable", async () => {
    const { app } = makeApp();
    const job = app.jobs.create({ name: "Once", prompt: "x", schedule: { kind: "once", at: T0 + 1000 } }, T0);
    const sch = new Scheduler(app, () => T0 + 5000);
    sch.tick();
    await app.drain();
    const j = app.jobs.get(job.id)!;
    expect(j.enabled).toBe(false);
    sch.tick();
    await app.drain();
    expect(app.store.list().filter((c) => c.title === "Job: Once")).toHaveLength(1);
  });

  it("a job cannot run commands or edit files unless allowed at creation", async () => {
    const { app } = makeApp();
    const denied = app.jobs.create({ name: "NoActions", prompt: "run ls", schedule: { kind: "interval", everyMinutes: 1 } }, T0);
    const allowed = app.jobs.create({ name: "Actions", prompt: "run ls", schedule: { kind: "interval", everyMinutes: 1 }, allowActions: true }, T0);
    const sch = new Scheduler(app, () => T0 + 120000);
    sch.tick();
    await app.drain();
    const ev = (id: string) => app.store.events(app.jobs.get(id)!.lastChatId!);
    expect(ev(denied.id).find((e) => e.type === "tool_end")).toMatchObject({ ok: false, result: "Denied by user" });
    expect(ev(denied.id).some((e) => e.type === "approval_request")).toBe(false);
    expect(ev(allowed.id).find((e) => e.type === "tool_end")).toMatchObject({ ok: true });
    // allowActions cannot be changed later
    app.jobs.update(denied.id, { allowActions: true } as never);
    expect(app.jobs.get(denied.id)!.allowActions).toBe(false);
  });
});
