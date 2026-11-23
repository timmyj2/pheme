import { describe, expect, it } from "vitest";
import { CopilotEngine } from "../src/copilot.ts";
import type { EngineEvent, SessionOptions } from "../src/engine.ts";

type Handler = (ev: { type: string; data?: Record<string, unknown> }) => void;

/** A stand-in for the Copilot SDK: lets a test decide which events a turn produces, and records what was sent. */
function stubEngine(script: (emit: Handler, sent: { prompt: string; attachments?: unknown[] }) => void) {
  const sentLog: { prompt: string; attachments?: unknown[] }[] = [];
  const session = {
    handler: undefined as Handler | undefined,
    on(h: Handler) { this.handler = h; return () => { this.handler = undefined; }; },
    async send(msg: { prompt: string; attachments?: unknown[] }) {
      sentLog.push(msg);
      queueMicrotask(() => script((ev) => this.handler?.(ev), msg));
    },
    async abort() {}, async disconnect() {},
  };
  const engine = new CopilotEngine("/nonexistent");
  const priv = engine as unknown as { client: unknown; sdk: unknown };
  priv.sdk = { defineTool: (_n: string, cfg: unknown) => cfg };
  priv.client = { createSession: async () => session, resumeSession: async () => session, stop: async () => {} };
  return { engine, sentLog };
}
const opts: SessionOptions = { id: "x", resume: false, model: "auto", systemMessage: "", tools: [], onPermission: async () => "allow" };
async function run(script: Parameters<typeof stubEngine>[0], prompt = "hi") {
  const { engine, sentLog } = stubEngine(script);
  const s = await engine.createSession(opts);
  const events: EngineEvent[] = [];
  await s.send(prompt, (e) => events.push(e));
  return { events, sentLog };
}

describe("Copilot event mapping", () => {
  it("turns deltas, messages, tools and errors into Pheme events", async () => {
    const { events } = await run((emit) => {
      emit({ type: "assistant.message_delta", data: { deltaContent: "Hel" } });
      emit({ type: "assistant.message", data: { content: "Hello" } });
      emit({ type: "tool.execution_start", data: { toolCallId: "1", toolName: "bash", arguments: { command: "ls" } } });
      emit({ type: "tool.execution_complete", data: { toolCallId: "1", success: true, result: { content: "ok" } } });
      emit({ type: "session.error", data: { message: "boom" } });
      emit({ type: "session.idle" });
    });
    expect(events.map((e) => e.type)).toEqual(["delta", "message", "tool_start", "tool_end", "error"]);
  });

  it("reports context usage once per turn, using the latest figures", async () => {
    const { events } = await run((emit) => {
      emit({ type: "session.usage_info", data: { currentTokens: 1000, tokenLimit: 128000 } });
      emit({ type: "assistant.message", data: { content: "a" } });
      emit({ type: "session.usage_info", data: { currentTokens: 4321.4, tokenLimit: 128000 } });
      emit({ type: "session.idle" });
    });
    expect(events.filter((e) => e.type === "usage")).toEqual([{ type: "usage", used: 4321, limit: 128000 }]);
    expect(events[events.length - 1].type).toBe("usage"); // comes after the reply content
  });

  it("ignores nonsense usage (missing, negative, zero limit, text, NaN) and sends nothing", async () => {
    for (const data of [{}, { currentTokens: -5, tokenLimit: 100 }, { currentTokens: 5, tokenLimit: 0 }, { currentTokens: "many", tokenLimit: 100 }, { currentTokens: NaN, tokenLimit: 100 }, { currentTokens: 5 }]) {
      const { events } = await run((emit) => { emit({ type: "session.usage_info", data }); emit({ type: "session.idle" }); });
      expect(events.filter((e) => e.type === "usage"), JSON.stringify(data)).toEqual([]);
    }
  });

  it("a turn with no usage event emits none, and a second turn starts clean", async () => {
    const { engine } = stubEngine((emit, sent) => {
      if (sent.prompt === "one") emit({ type: "session.usage_info", data: { currentTokens: 10, tokenLimit: 100 } });
      emit({ type: "session.idle" });
    });
    const s = await engine.createSession(opts);
    const a: EngineEvent[] = [], b: EngineEvent[] = [];
    await s.send("one", (e) => a.push(e));
    await s.send("two", (e) => b.push(e));
    expect(a.filter((e) => e.type === "usage")).toHaveLength(1);
    expect(b.filter((e) => e.type === "usage")).toHaveLength(0);
  });

  it("hands attachments to the SDK as blobs (images) and files (text), and sends none when there are none", async () => {
    const { engine, sentLog } = stubEngine((emit) => emit({ type: "session.idle" }));
    const s = await engine.createSession(opts);
    await s.send("plain", () => {});
    await s.send("with", () => {}, undefined, [{ kind: "image", name: "a.png", mime: "image/png", data: "QUJD" }, { kind: "file", name: "n.md", path: "/data/x.md" }]);
    expect(sentLog[0]).toEqual({ prompt: "plain" });
    expect(sentLog[1]).toEqual({ prompt: "with", attachments: [{ type: "blob", data: "QUJD", mimeType: "image/png", displayName: "a.png" }, { type: "file", path: "/data/x.md", displayName: "n.md" }] });
  });
});
