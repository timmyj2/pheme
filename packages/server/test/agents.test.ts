import { describe, expect, it } from "vitest";
import { AgentStore } from "../src/agents.ts";
import { defaultScript, type FakeScript } from "../src/fake.ts";
import { makeApp, tmpDir } from "./helpers.ts";

async function waitFor(fn: () => boolean, ms = 2000) {
  const t = Date.now();
  while (!fn()) {
    if (Date.now() - t > ms) throw new Error("timeout");
    await new Promise((r) => setTimeout(r, 5));
  }
}

describe("agent profiles", () => {
  it("saves, lists, reads back and archives", () => {
    const s = new AgentStore(tmpDir());
    s.saveProfile({ name: "researcher", description: "Use when digging for facts.", instructions: "Be thorough.\nCite sources.", tools: ["view", "grep"] });
    expect(s.listProfiles()).toEqual([{ name: "researcher", description: "Use when digging for facts.", instructions: "Be thorough.\nCite sources.", tools: ["view", "grep"] }]);
    s.archiveProfile("researcher");
    expect(s.listProfiles()).toEqual([]);
  });
  it("validates names and required fields", () => {
    const s = new AgentStore(tmpDir());
    expect(() => s.saveProfile({ name: "../x", description: "d", instructions: "i", tools: [] })).toThrow();
    expect(() => s.saveProfile({ name: "ok", description: "", instructions: "i", tools: [] })).toThrow(/description/);
    expect(() => s.saveProfile({ name: "ok", description: "d", instructions: " ", tools: [] })).toThrow(/instructions/);
  });
});

describe("agent tool (parallel Pheme sessions)", () => {
  it("runs a task in its own hidden session and returns the answer to the parent", async () => {
    const { app, engine } = makeApp();
    const chat = app.store.create();
    app.send(chat.id, "agent summarise the report");
    await app.drain();
    const run = app.agents.listRuns()[0];
    expect(run).toMatchObject({ status: "done", source: "session", name: "agent", parentChatId: chat.id });
    expect(run.result).toContain("Fake reply to: summarise the report");
    const child = engine.sessions.find((s) => s.id === run.childChatId)!;
    expect(child.tools.map((t) => t.name)).toEqual(["skill_view"]); // no agent tool: no recursion, no memory writes
    expect(app.store.list().some((c) => c.id === run.childChatId)).toBe(false); // hidden from the sidebar
    expect(app.store.events(run.childChatId!).some((e) => e.type === "message")).toBe(true);
    const end = app.store.events(chat.id).find((e) => e.type === "tool_end" && e.name === "agent");
    expect((end as { result: string }).result).toContain("summarise the report");
    expect(app.store.events(chat.id).filter((e) => e.type === "agent_update").length).toBeGreaterThanOrEqual(3);
  });

  it("applies a saved profile's instructions, and rejects unknown profiles", async () => {
    const { app, engine } = makeApp();
    app.agents.saveProfile({ name: "critic", description: "Use when reviewing.", instructions: "Find flaws only.", tools: [] });
    const chat = app.store.create();
    app.send(chat.id, "agent critic: review this plan");
    await app.drain();
    const run = app.agents.listRuns()[0];
    expect(run.name).toBe("critic");
    expect(engine.sessions.find((s) => s.id === run.childChatId)!.systemMessage).toContain("Find flaws only.");
    const c2 = app.store.create();
    app.send(c2.id, "agent nobody: x");
    await app.drain();
    const end = app.store.events(c2.id).find((e) => e.type === "tool_end" && e.name === "agent");
    expect(end).toMatchObject({ ok: false });
    expect((end as { result: string }).result).toMatch(/unknown agent profile "nobody".*critic/);
  });

  it("runs tasks in parallel, at most 3 at once", async () => {
    let active = 0;
    let peak = 0;
    const script: FakeScript = async (ctx) => {
      if (!ctx.prompt.startsWith("work-")) return defaultScript(ctx);
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 40));
      active--;
      return [{ say: `done ${ctx.prompt}` }];
    };
    const { app } = makeApp(script);
    const chat = app.store.create();
    app.send(chat.id, "parallel work-1|work-2|work-3|work-4|work-5");
    await app.drain();
    expect(peak).toBe(3);
    const runs = app.agents.listRuns();
    expect(runs).toHaveLength(5);
    expect(runs.every((r) => r.status === "done")).toBe(true);
    expect(runs.map((r) => r.result).sort()).toEqual(["done work-1", "done work-2", "done work-3", "done work-4", "done work-5"]);
  });

  it("sub-agent approvals show up as cards in the parent chat; Deny reaches the sub-agent", async () => {
    const { app } = makeApp();
    const chat = app.store.create();
    app.send(chat.id, "agent run rm -rf /tmp/x");
    await waitFor(() => app.pendingApprovals(chat.id).length === 1);
    expect(app.store.events(chat.id).find((e) => e.type === "approval_request")).toMatchObject({ kind: "shell" });
    app.resolveApproval(chat.id, app.pendingApprovals(chat.id)[0], "deny");
    await app.drain();
    const run = app.agents.listRuns()[0];
    expect(app.store.events(run.childChatId!).find((e) => e.type === "tool_end")).toMatchObject({ ok: false, result: "Denied by user" });
  });

  it("Stop cancels running sub-agents", async () => {
    const script: FakeScript = async (ctx) => (ctx.prompt.startsWith("slow") ? [{ delayMs: 5000 }, { say: "late" }] : defaultScript(ctx));
    const { app } = makeApp(script);
    const chat = app.store.create();
    app.send(chat.id, "agent slow task");
    await waitFor(() => app.agents.listRuns().some((r) => r.status === "running" && r.childChatId));
    app.stop(chat.id);
    await app.drain();
    expect(app.agents.listRuns()[0].status).toBe("cancelled");
  });
});

describe("custom agents (Copilot delegation)", () => {
  it("passes profiles to the engine and records delegated runs as cards", async () => {
    const { app, engine } = makeApp();
    app.agents.saveProfile({ name: "researcher", description: "Use when digging.", instructions: "Dig.", tools: ["view"] });
    const chat = app.store.create();
    app.send(chat.id, "delegate researcher find the answer");
    await app.drain();
    expect(engine.sessions[0].agents).toEqual([{ name: "researcher", description: "Use when digging.", prompt: "Dig.", tools: ["view"] }]);
    const run = app.agents.listRuns()[0];
    expect(run).toMatchObject({ source: "copilot", name: "researcher", status: "done", task: "find the answer" });
    expect(app.store.events(chat.id).filter((e) => e.type === "agent_update")).toHaveLength(2);
  });
  it("marks a delegation to an unknown agent as failed", async () => {
    const { app } = makeApp();
    const chat = app.store.create();
    app.send(chat.id, "delegate ghost do it");
    await app.drain();
    expect(app.agents.listRuns()[0]).toMatchObject({ status: "error", name: "ghost" });
  });
});
