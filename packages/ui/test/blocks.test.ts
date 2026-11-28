import { describe, expect, it } from "vitest";
import type { SeqEvent } from "../src/api.ts";
import { APPROVAL_LABEL, buildBlocks, toolDuration, toolSummary } from "../src/blocks.ts";

let n = 0;
const ev = (e: object, ts = 1000) => ({ ...e, seq: ++n, ts }) as SeqEvent;

describe("buildBlocks", () => {
  it("groups consecutive tool calls and merges each result into its call", () => {
    n = 0;
    const blocks = buildBlocks([
      ev({ type: "user", text: "go" }),
      ev({ type: "tool_start", id: "a", name: "bash", args: { command: "ls" } }, 1000),
      ev({ type: "tool_start", id: "b", name: "view", args: { path: "x" } }, 1100),
      ev({ type: "tool_end", id: "b", name: "view", ok: true, result: "ok" }, 1600),
      ev({ type: "tool_end", id: "a", name: "bash", ok: false, result: "boom" }, 2500),
      ev({ type: "message", text: "done" }),
    ]);
    expect(blocks.map((b) => b.kind)).toEqual(["user", "tools", "assistant"]);
    const tools = blocks[1] as Extract<(typeof blocks)[number], { kind: "tools" }>;
    expect(tools.items.map((t) => [t.name, t.ok, t.result])).toEqual([["bash", false, "boom"], ["view", true, "ok"]]);
    expect(toolDuration(tools.items[1])).toBe("500 ms");
    expect(toolDuration(tools.items[0])).toBe("1.5 s");
  });
  it("a tool call still running has no result yet", () => {
    n = 0;
    const [b] = buildBlocks([ev({ type: "tool_start", id: "a", name: "bash", args: {} })]);
    expect((b as { items: { ok?: boolean }[] }).items[0].ok).toBeUndefined();
  });
  it("tool groups split around messages", () => {
    n = 0;
    const blocks = buildBlocks([
      ev({ type: "tool_start", id: "a", name: "t", args: {} }), ev({ type: "message", text: "x" }), ev({ type: "tool_start", id: "b", name: "t", args: {} }),
    ]);
    expect(blocks.map((b) => b.kind)).toEqual(["tools", "assistant", "tools"]);
  });
  it("approvals pick up their decision; resolved events themselves are not blocks", () => {
    n = 0;
    const blocks = buildBlocks([
      ev({ type: "approval_request", id: "p1", kind: "shell", title: "Run shell command", detail: "ls" }),
      ev({ type: "approval_resolved", id: "p1", decision: "chat" }),
      ev({ type: "approval_request", id: "p2", kind: "write", title: "Edit file", detail: "a.txt" }),
    ]);
    expect(blocks).toHaveLength(2);
    expect((blocks[0] as { decision?: string }).decision).toBe("chat");
    expect((blocks[1] as { decision?: string }).decision).toBeUndefined();
    expect(APPROVAL_LABEL.deny).toBe("Rejected");
  });
  it("shows one card per agent run, with its latest state", () => {
    n = 0;
    const run = (status: string) => ({ id: "r1", parentChatId: "c", name: "agent", task: "t", source: "session", status, startedAt: 1, endedAt: null, result: "" });
    const blocks = buildBlocks([ev({ type: "agent_update", run: run("running") }), ev({ type: "message", text: "hi" }), ev({ type: "agent_update", run: run("done") })]);
    expect(blocks.map((b) => b.kind)).toEqual(["agent", "assistant"]);
    expect((blocks[0] as { run: { status: string } }).run.status).toBe("done");
  });
  it("errors and notices become notices; deltas and idle are ignored", () => {
    n = 0;
    const blocks = buildBlocks([ev({ type: "error", message: "bad" }), ev({ type: "notice", kind: "skill", text: "saved" }), ev({ type: "idle" }), ev({ type: "turn_start" })]);
    expect(blocks.map((b) => (b.kind === "notice" ? b.tone : b.kind))).toEqual(["error", "skill"]);
  });
  it("handles 20,000 events quickly", () => {
    n = 0;
    const evs: SeqEvent[] = [];
    for (let i = 0; i < 5000; i++) evs.push(ev({ type: "user", text: "q" }), ev({ type: "tool_start", id: "t" + i, name: "x", args: {} }), ev({ type: "tool_end", id: "t" + i, name: "x", ok: true, result: "" }), ev({ type: "message", text: "a" }));
    const t = performance.now();
    expect(buildBlocks(evs).length).toBe(15000);
    expect(performance.now() - t).toBeLessThan(500);
  });
});

describe("toolSummary", () => {
  it("prefers the most descriptive argument and never throws", () => {
    expect(toolSummary("bash", { command: "ls   -la\n/tmp" })).toBe("ls -la /tmp");
    expect(toolSummary("view", { path: "a.txt" })).toBe("a.txt");
    expect(toolSummary("memory", { action: "add", store: "user" })).toBe("add user");
    expect(toolSummary("skill_view", { name: "demo" })).toBe("demo");
    expect(toolSummary("x", null)).toBe("");
    expect(toolSummary("x", "str")).toBe("");
    expect(toolSummary("bash", { command: "x".repeat(500) }).length).toBe(120);
  });
});
