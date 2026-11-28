import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CopilotEngine } from "../src/copilot.ts";
import { FakeEngine } from "../src/fake.ts";
import type { EngineEvent, SessionOptions } from "../src/engine.ts";
import { ChatStore } from "../src/store.ts";
import { tmpDir } from "./helpers.ts";

const opts = (): SessionOptions => ({ id: "x", resume: false, model: "auto", systemMessage: "", tools: [], onPermission: async () => "allow" });

describe("fake engine: think", () => {
  it("emits reasoning deltas, the final reasoning, intent, todos, progress and title in order", async () => {
    const engine = new FakeEngine();
    const s = await engine.createSession(opts());
    const events: EngineEvent[] = [];
    await s.send("think about the folder", (e) => events.push(e));
    const kinds = events.map((e) => e.type);
    expect(kinds.filter((k) => k === "reasoning_delta").length).toBeGreaterThan(3);
    const ids = new Set(events.filter((e): e is Extract<EngineEvent, { type: "reasoning_delta" }> => e.type === "reasoning_delta").map((e) => e.id));
    expect(ids.size).toBe(1);
    const reasoning = events.find((e) => e.type === "reasoning");
    expect(reasoning).toMatchObject({ type: "reasoning" });
    expect((reasoning as { text: string }).text).toContain("list the folder first");
    expect(typeof (reasoning as { ms?: number }).ms).toBe("number");
    expect(events).toContainEqual({ type: "intent", text: "Listing the project folder" });
    expect(events.filter((e) => e.type === "todos")).toHaveLength(2);
    expect(events).toContainEqual({ type: "progress", id: expect.any(String), text: "3 entries found" });
    expect(events).toContainEqual({ type: "title", title: "Check the project folder" });
    // The reasoning block comes before the tool it leads to, and the reply comes last.
    expect(kinds.indexOf("reasoning")).toBeLessThan(kinds.indexOf("tool_start"));
    expect(kinds.slice(-2)).toEqual(["message", "usage"]);
  }, 15_000);
});

describe("store: what is kept", () => {
  it("does not persist reasoning deltas or progress, but keeps the final reasoning and todos", () => {
    const d = tmpDir();
    const store = new ChatStore(d);
    const c = store.create();
    store.append(c.id, { type: "reasoning_delta", id: "r1", text: "Let me " });
    store.append(c.id, { type: "progress", id: "t1", text: "Reading" });
    store.append(c.id, { type: "reasoning", id: "r1", text: "Let me think.", ms: 1500 });
    store.append(c.id, { type: "todos", items: [{ id: "1", title: "Read", status: "done" }] });
    store.append(c.id, { type: "intent", text: "Reading" });
    const saved = new ChatStore(d).events(c.id).map((e) => e.type);
    expect(saved).toEqual(["reasoning", "todos", "intent"]);
    const reasoning = new ChatStore(d).events(c.id)[0] as { text: string; ms: number };
    expect(reasoning).toMatchObject({ text: "Let me think.", ms: 1500 });
    expect(fs.existsSync(path.join(d, "sessions", `${c.id}.jsonl`))).toBe(true);
  });
});

describe("Copilot mapping: activity events", () => {
  it("maps reasoning, intent, todos (read over RPC), progress, partial output and title", async () => {
    const handlers: ((ev: { type: string; data?: Record<string, unknown> }) => void)[] = [];
    let rpcCalls = 0;
    const session = {
      rpc: { plan: { readSqlTodosWithDependencies: async () => { rpcCalls++; return { rows: [{ id: "a", title: "Read files", status: "done" }, { id: "b", title: "", status: "pending" }], dependencies: [] }; } } },
      on(h: (ev: { type: string; data?: Record<string, unknown> }) => void) { handlers.push(h); return () => {}; },
      async send() {
        const emit = (type: string, data: Record<string, unknown> = {}) => handlers.forEach((h) => h({ type, data }));
        queueMicrotask(() => {
          emit("assistant.reasoning_delta", { reasoningId: "r9", deltaContent: "Hmm" });
          emit("assistant.reasoning", { reasoningId: "r9", content: "Hmm, ok" });
          emit("assistant.intent", { intent: "Editing the file" });
          emit("session.todos_changed", {});
          emit("tool.execution_progress", { toolCallId: "c1", progressMessage: "Searching" });
          emit("tool.execution_partial_result", { toolCallId: "c1", partialOutput: "line 1" });
          emit("session.title_changed", { title: "  Fix the parser  " });
          emit("session.idle", {});
        });
      },
      async abort() {}, async disconnect() {},
    };
    const engine = new CopilotEngine("/nonexistent");
    const priv = engine as unknown as { client: unknown; sdk: unknown };
    priv.sdk = { defineTool: (_n: string, cfg: unknown) => cfg };
    priv.client = { createSession: async () => session, resumeSession: async () => session, stop: async () => {} };
    const s = await engine.createSession(opts());
    const events: EngineEvent[] = [];
    await s.send("hi", (e) => events.push(e));
    expect(events.find((e) => e.type === "reasoning_delta")).toEqual({ type: "reasoning_delta", id: "r9", text: "Hmm" });
    const reasoning = events.find((e) => e.type === "reasoning") as { ms?: number } | undefined;
    expect(reasoning).toMatchObject({ type: "reasoning", id: "r9", text: "Hmm, ok" });
    expect(typeof reasoning?.ms).toBe("number");
    expect(events).toContainEqual({ type: "intent", text: "Editing the file" });
    // Only rows with a title are kept, and the list arrives before the turn ends.
    expect(events).toContainEqual({ type: "todos", items: [{ id: "a", title: "Read files", status: "done" }] });
    expect(rpcCalls).toBe(1);
    expect(events).toContainEqual({ type: "progress", id: "c1", text: "Searching" });
    expect(events).toContainEqual({ type: "progress", id: "c1", text: "line 1", partial: true });
    expect(events).toContainEqual({ type: "title", title: "Fix the parser" });
    expect(events.indexOf(events.find((e) => e.type === "todos")!)).toBeLessThan(events.length);
  });

  it("maps nothing when the engine sends none of these events", async () => {
    const handlers: ((ev: { type: string; data?: Record<string, unknown> }) => void)[] = [];
    const session = {
      rpc: { plan: { readSqlTodosWithDependencies: async () => ({ rows: [], dependencies: [] }) } },
      on(h: (ev: { type: string; data?: Record<string, unknown> }) => void) { handlers.push(h); return () => {}; },
      async send() { queueMicrotask(() => { handlers.forEach((h) => h({ type: "assistant.message", data: { content: "Plain" } })); handlers.forEach((h) => h({ type: "session.idle", data: {} })); }); },
      async abort() {}, async disconnect() {},
    };
    const engine = new CopilotEngine("/nonexistent");
    const priv = engine as unknown as { client: unknown; sdk: unknown };
    priv.sdk = { defineTool: (_n: string, cfg: unknown) => cfg };
    priv.client = { createSession: async () => session, resumeSession: async () => session, stop: async () => {} };
    const s = await engine.createSession(opts());
    const events: EngineEvent[] = [];
    await s.send("hi", (e) => events.push(e));
    expect(events.map((e) => e.type)).toEqual(["message"]);
  });
});

describe("Copilot mapping: todo reads are guarded", () => {
  const sessionWith = (rpc: unknown, idle: () => Promise<void> | void = () => {}) => {
    const handlers: ((ev: { type: string; data?: Record<string, unknown> }) => void)[] = [];
    return {
      rpc,
      on(h: (ev: { type: string; data?: Record<string, unknown> }) => void) { handlers.push(h); return () => {}; },
      async send() {
        queueMicrotask(async () => {
          handlers.forEach((h) => h({ type: "session.todos_changed", data: {} }));
          await idle();
          handlers.forEach((h) => h({ type: "session.idle", data: {} }));
        });
      },
      async abort() {}, async disconnect() {},
    };
  };
  const runWith = async (session: unknown) => {
    const engine = new CopilotEngine("/nonexistent");
    const priv = engine as unknown as { client: unknown; sdk: unknown };
    priv.sdk = { defineTool: (_n: string, cfg: unknown) => cfg };
    priv.client = { createSession: async () => session, resumeSession: async () => session, stop: async () => {} };
    const s = await engine.createSession(opts());
    const events: EngineEvent[] = [];
    await s.send("hi", (e) => events.push(e));
    return events;
  };

  it("ends the turn normally when the CLI has no rpc.plan", async () => {
    const events = await runWith(sessionWith({}));
    expect(events.map((e) => e.type)).toEqual([]);
  });

  it("ends the turn normally when rpc.plan.readSqlTodosWithDependencies throws synchronously", async () => {
    const events = await runWith(sessionWith({ plan: { readSqlTodosWithDependencies() { throw new Error("no rpc"); } } }));
    expect(events.map((e) => e.type)).toEqual([]);
  });

  it("stops waiting for a read that never resolves", async () => {
    const started = Date.now();
    const events = await runWith(sessionWith({ plan: { readSqlTodosWithDependencies: () => new Promise(() => {}) } }));
    expect(events.map((e) => e.type)).toEqual([]);
    expect(Date.now() - started).toBeLessThan(6000);
  }, 10_000);
});
