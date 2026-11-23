import fs from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { chatToMarkdown, exportFileName, searchMessages } from "../src/export.ts";
import type { ChatMeta, SeqEvent } from "../src/protocol.ts";
import { startServer, type RunningServer } from "../src/server.ts";
import { makeApp } from "./helpers.ts";

let n = 0;
const ev = (e: object): SeqEvent => ({ ...e, seq: ++n, ts: 0 }) as SeqEvent;
const meta = (title: string): ChatMeta => ({ id: "c", title, pinned: false, archived: false, createdAt: 0, updatedAt: 0, userMessages: 1, lastMemoryReviewAt: 0 });
let srv: RunningServer | undefined;
afterEach(async () => { await srv?.close(); srv = undefined; });

describe("chatToMarkdown", () => {
  it("renders messages, summarises tools and approvals, and ignores streaming duplicates", () => {
    const md = chatToMarkdown(meta("My chat"), [
      ev({ type: "user", text: "hello" }), ev({ type: "turn_start" }), ev({ type: "delta", text: "par" }), ev({ type: "delta", text: "tial" }),
      ev({ type: "tool_start", id: "t1", name: "bash", args: { command: "ls" } }), ev({ type: "tool_end", id: "t1", name: "bash", ok: false, result: "SECRET OUTPUT" }),
      ev({ type: "approval_resolved", id: "a", decision: "deny" }), ev({ type: "message", text: "final answer" }), ev({ type: "idle" }),
    ], Date.UTC(2026, 10, 22, 12, 30));
    expect(md).toContain("# My chat");
    expect(md).toContain("2026-11-22 12:30 UTC · 1 messages");
    expect(md).toContain("## You\n\nhello");
    expect(md).toContain("## Pheme\n\nfinal answer");
    expect(md).toContain("> **Tool:** `bash` ({\"command\":\"ls\"}) — failed");
    expect(md).toContain("denied");
    expect(md).not.toContain("SECRET OUTPUT"); // tool output is not dumped
    expect(md).not.toContain("partial"); // the streamed text was superseded by the final message
  });
  it("keeps an unfinished reply, and survives backticks, odd titles and empty chats", () => {
    expect(chatToMarkdown(meta("t"), [ev({ type: "user", text: "q" }), ev({ type: "delta", text: "half an ans" })])).toContain("## Pheme (unfinished)\n\nhalf an ans");
    const md = chatToMarkdown(meta("Title with `ticks`\nand newline"), [ev({ type: "message", text: "```js\ncode\n```" }), ev({ type: "tool_start", id: "x", name: "we`ird", args: "a`b" }), ev({ type: "tool_end", id: "x", name: "we`ird", ok: true, result: "" })]);
    expect(md.split("\n")[0]).toBe("# Title with `ticks` and newline");
    expect(md).toContain("```js\ncode\n```");
    expect(md).toContain("`we'ird`");
    expect(chatToMarkdown(meta(""), [])).toMatch(/^# Chat\n/);
  });
});

describe("exportFileName", () => {
  it("is safe on every platform", () => {
    expect(exportFileName("Plan: A/B <test>?")).toBe("Plan A B test.md");
    expect(exportFileName("../../etc/passwd")).toBe("etc passwd.md");
    expect(exportFileName("...hidden")).toBe("hidden.md");
    expect(exportFileName("")).toBe("chat.md");
    expect(exportFileName("日本語のタイトル")).toBe("日本語のタイトル.md");
    expect(exportFileName("x".repeat(500)).length).toBeLessThanOrEqual(83);
    expect(exportFileName("bad\u0000name\r\n")).toBe("bad name.md");
    expect(exportFileName("trailing dots...")).toBe("trailing dots.md"); // Windows drops trailing dots and spaces
  });
});

describe("searchMessages", () => {
  function seed() {
    const { app } = makeApp();
    const a = app.store.create({ title: "Alpha" }), b = app.store.create({ title: "Beta" }), h = app.store.create({ title: "Hidden", hidden: true });
    app.store.append(a.id, { type: "user", text: "How do I deploy the Zebra service to production?" });
    app.store.append(a.id, { type: "message", text: "Run the pipeline." });
    app.store.append(b.id, { type: "message", text: "The zebra crossing is ahead " + "x".repeat(500) });
    app.store.append(b.id, { type: "tool_end", id: "1", name: "bash", ok: true, result: "zebra in tool output must not match" });
    app.store.append(h.id, { type: "user", text: "zebra in a hidden chat" });
    return app;
  }
  it("finds chats by message text, case-insensitively, one hit per chat, never hidden chats or tool output", () => {
    const app = seed();
    const { hits } = searchMessages(app.store, "ZEBRA", { logPath: (id) => app.store.logPath(id) });
    expect(hits.map((h) => h.title).sort()).toEqual(["Alpha", "Beta"]);
    const a = hits.find((h) => h.title === "Alpha")!;
    expect(a.role).toBe("you");
    expect(a.snippet.toLowerCase()).toContain("zebra");
    expect(hits.find((h) => h.title === "Beta")!.snippet.length).toBeLessThan(200);
  });
  it("ignores too-short or silly queries, regex characters, and unknown text", () => {
    const app = seed();
    const s = (q: string) => searchMessages(app.store, q, { logPath: (id) => app.store.logPath(id) }).hits.length;
    expect(s("")).toBe(0); expect(s("z")).toBe(0); expect(s("q".repeat(300))).toBe(0);
    expect(s(".*")).toBe(0); expect(s("(")).toBe(0); expect(s("nothing like this")).toBe(0);
  });
  it("copes with a corrupt log line and a missing log file", () => {
    const app = seed();
    const c = app.store.create({ title: "Corrupt" });
    fs.appendFileSync(app.store.logPath(c.id), "{not json zebra\n");
    app.store.append(c.id, { type: "user", text: "a real zebra line" });
    const hits = searchMessages(app.store, "zebra", { logPath: (id) => app.store.logPath(id) }).hits;
    expect(hits.some((h) => h.title === "Corrupt")).toBe(true);
    const gone = app.store.create({ title: "NoLog" });
    fs.rmSync(app.store.logPath(gone.id), { force: true });
    expect(() => searchMessages(app.store, "zebra", { logPath: (id) => app.store.logPath(id) })).not.toThrow();
  });
  it("stops at its time budget and reports a partial result", () => {
    const app = seed();
    const r = searchMessages(app.store, "zebra", { budgetMs: -1, logPath: (id) => app.store.logPath(id) });
    expect(r).toEqual({ hits: [], partial: true });
  });
});

describe("HTTP", () => {
  it("serves the export as a download and the search results, with auth", async () => {
    const ctx = makeApp();
    srv = await startServer({ app: ctx.app, fake: true, version: "t", token: "secret-token", assets: {} });
    const base = `http://127.0.0.1:${srv.port}`;
    const get = (p: string, token = "secret-token") => fetch(base + p, { headers: { "x-pheme-token": token } });
    const chat = ctx.app.store.create({ title: "Notes / 2026" });
    ctx.app.store.append(chat.id, { type: "user", text: "find me: needle-123" });
    const r = await get(`/api/chats/${chat.id}/export`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("text/markdown");
    expect(r.headers.get("content-disposition")).toContain("filename*=UTF-8''Notes%202026.md");
    expect(await r.text()).toContain("needle-123");
    expect((await get(`/api/chats/${chat.id}/export`, "wrong-token")).status).toBe(401);
    expect((await get(`/api/chats/nope/export`)).status).toBe(404);
    const s = (await (await get(`/api/search?q=needle-123`)).json()) as { hits: { id: string }[] };
    expect(s.hits.map((h) => h.id)).toEqual([chat.id]);
    expect((await get(`/api/search?q=needle`, "wrong-token")).status).toBe(401);
    expect(((await (await get(`/api/search`)).json()) as { hits: unknown[] }).hits).toEqual([]);
  });
});
