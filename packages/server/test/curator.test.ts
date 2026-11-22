import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { makeApp } from "./helpers.ts";

const skill = (n: string) => `---\nname: ${n}\ndescription: Use when ${n}.\n---\n\n## Procedure\n1. x\n`;
const DAY = 86_400_000;

describe("skill usage", () => {
  it("skill_view records a use; stale skills are those unused and unedited for N days", async () => {
    const { app, dir } = makeApp();
    app.skills.manage({ action: "create", name: "old", content: skill("old") });
    app.skills.manage({ action: "create", name: "used", content: skill("used") });
    const old = Date.now() - 200 * DAY;
    for (const n of ["old", "used"]) fs.utimesSync(path.join(dir, "skills", n, "SKILL.md"), old / 1000, old / 1000);
    app.skills.recordView("used");
    expect(app.skills.stale(90)).toEqual(["old"]);
    const chat = app.store.create();
    app.send(chat.id, "use the skill");
    await app.drain();
    expect(JSON.parse(fs.readFileSync(path.join(dir, "skill-usage.json"), "utf8"))).toHaveProperty("old.views", 1);
  });
});

describe("curator", () => {
  it("archives stale skills and merges overlapping ones, reporting only real changes", async () => {
    const { app, dir } = makeApp();
    for (const n of ["alpha", "beta", "gamma", "ancient"]) app.skills.manage({ action: "create", name: n, content: skill(n) });
    const old = Date.now() - 400 * DAY;
    fs.utimesSync(path.join(dir, "skills", "ancient", "SKILL.md"), old / 1000, old / 1000);
    const report = await app.curator.run();
    expect(report).toContain('Archived "ancient": not used for 90+ days.');
    expect(report.some((l) => l.startsWith('Archived "beta"'))).toBe(true);
    expect(report.some((l) => l.startsWith('Updated "alpha"'))).toBe(true);
    expect(app.skills.list().map((s) => s.name)).toEqual(["alpha", "gamma"]);
    expect(app.skills.view("alpha")).toContain("also covers: beta");
    // nothing is destroyed: archived skills are still on disk
    expect(fs.readdirSync(path.join(dir, "skills", ".archive")).length).toBe(2);
    expect(app.curator.state().report).toEqual(report);
    expect(app.store.list()).toHaveLength(0); // hidden session cleaned up
  });

  it("is quiet with a small library, and the curator session cannot use shell or other tools", async () => {
    const { app, engine } = makeApp();
    app.skills.manage({ action: "create", name: "one", content: skill("one") });
    expect(await app.curator.run()).toEqual(["No changes."]);
    expect(engine.sessions).toHaveLength(0);
    for (const n of ["two", "three"]) app.skills.manage({ action: "create", name: n, content: skill(n) });
    await app.curator.run();
    const s = engine.sessions[0];
    expect(s.customToolsOnly).toBe(true);
    expect(await s.onPermission({ kind: "shell", title: "", detail: "" })).toBe("deny");
  });

  it("runs on schedule: starts the clock first, then every N days, and can be switched off", async () => {
    const { app, engine } = makeApp();
    for (const n of ["a1", "b1", "c1"]) app.skills.manage({ action: "create", name: n, content: skill(n) });
    const t0 = Date.now();
    app.curator.maybeRun(t0);
    await app.drain();
    expect(engine.sessions).toHaveLength(0);
    expect(app.curator.state().lastRunAt).toBe(t0);
    app.curator.maybeRun(t0 + 6 * DAY);
    await app.drain();
    expect(engine.sessions).toHaveLength(0);
    app.settings.update({ curatorEnabled: false });
    app.curator.maybeRun(t0 + 30 * DAY);
    await app.drain();
    expect(engine.sessions).toHaveLength(0);
    app.settings.update({ curatorEnabled: true });
    app.curator.maybeRun(t0 + 8 * DAY);
    await app.drain();
    expect(engine.sessions).toHaveLength(1);
    expect(app.curator.state().lastRunAt).toBe(t0 + 8 * DAY);
  });
});
