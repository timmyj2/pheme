import fs from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { chatToMarkdown, exportFileName, searchLimited, searchMessages } from "../src/export.ts";
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
  it("lists attachment names in a user message, without letting a name inject markdown", () => {
    const md = chatToMarkdown(meta("t"), [ev({ type: "user", text: "see files", attachments: [{ id: "i", name: "a_b.png", kind: "image", mime: "image/png", size: 1 }, { id: "j", name: "[x](http://evil)\n# H.md", kind: "text", mime: "text/plain", size: 1 }] })]);
    expect(md).toContain("_Attached: ab.png, x(http://evil) # H.md_");
    expect(md).not.toContain("[x](");
  });
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
  it("finds chats by message text, case-insensitively, one hit per chat, never hidden chats or tool output", async () => {
    const app = seed();
    const { hits } = await searchMessages(app.store, "ZEBRA", { logPath: (id) => app.store.logPath(id) });
    expect(hits.map((h) => h.title).sort()).toEqual(["Alpha", "Beta"]);
    const a = hits.find((h) => h.title === "Alpha")!;
    expect(a.role).toBe("you");
    expect(a.snippet.toLowerCase()).toContain("zebra");
    expect(hits.find((h) => h.title === "Beta")!.snippet.length).toBeLessThan(200);
  });
  it("ignores too-short or silly queries, regex characters, and unknown text", async () => {
    const app = seed();
    const s = async (q: string) => (await searchMessages(app.store, q, { logPath: (id) => app.store.logPath(id) })).hits.length;
    expect(await s("")).toBe(0); expect(await s("z")).toBe(0); expect(await s("q".repeat(300))).toBe(0);
    expect(await s(".*")).toBe(0); expect(await s("(")).toBe(0); expect(await s("nothing like this")).toBe(0);
  });
  it("copes with a corrupt log line and a missing log file", async () => {
    const app = seed();
    const c = app.store.create({ title: "Corrupt" });
    fs.appendFileSync(app.store.logPath(c.id), "{not json zebra\n");
    app.store.append(c.id, { type: "user", text: "a real zebra line" });
    const hits = (await searchMessages(app.store, "zebra", { logPath: (id) => app.store.logPath(id) })).hits;
    expect(hits.some((h) => h.title === "Corrupt")).toBe(true);
    const gone = app.store.create({ title: "NoLog" });
    fs.rmSync(app.store.logPath(gone.id), { force: true });
    await expect(searchMessages(app.store, "zebra", { logPath: (id) => app.store.logPath(id) })).resolves.toBeTruthy();
  });
  it("stops at its time budget and reports a partial result", async () => {
    const app = seed();
    const r = await searchMessages(app.store, "zebra", { budgetMs: -1, logPath: (id) => app.store.logPath(id) });
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

describe("chat list flags", () => {
  it("marks a chat as busy and waiting while a tool needs approval", async () => {
    const ctx = makeApp();
    srv = await startServer({ app: ctx.app, fake: true, version: "t", token: "secret-token", assets: {} });
    const list = async () => (await (await fetch(`http://127.0.0.1:${srv!.port}/api/chats`, { headers: { "x-pheme-token": "secret-token" } })).json()) as { id: string; busy: boolean; waiting: boolean }[];
    const chat = ctx.app.store.create();
    expect((await list())[0]).toMatchObject({ busy: false, waiting: false });
    ctx.app.send(chat.id, "run ls");
    await new Promise((r) => setTimeout(r, 300));
    expect((await list())[0]).toMatchObject({ busy: true, waiting: true });
    ctx.app.stop(chat.id); await ctx.app.drain();
    expect((await list())[0]).toMatchObject({ busy: false, waiting: false });
  });
});

describe("search under load", () => {
  const many = (n: number) => {
    const { app } = makeApp();
    for (let i = 0; i < n; i++) { const c = app.store.create({ title: `t${i}` }); app.store.append(c.id, { type: "user", text: `message ${i} about zebra` }); }
    return app;
  };
  it("answers identical queries together, and says 'busy' instead of piling up work", async () => {
    const app = many(60);
    const opts = { logPath: (id: string) => app.store.logPath(id) };
    const same = await Promise.all(Array.from({ length: 5 }, () => searchLimited(app.store, "zebra", opts)));
    expect(same.every((r) => r !== "busy")).toBe(true);
    const burst = await Promise.all(Array.from({ length: 30 }, (_, i) => searchLimited(app.store, `query${i}`, opts)));
    expect(burst.filter((r) => r === "busy").length).toBeGreaterThan(0); // 2 running + 6 waiting; the rest are refused
    expect(burst.filter((r) => r !== "busy").length).toBeGreaterThanOrEqual(8);
  });
  it("stops scanning when the page has stopped waiting", async () => {
    const app = many(60);
    let calls = 0;
    const r = await searchMessages(app.store, "zebra", { logPath: (id) => app.store.logPath(id), cancelled: () => ++calls > 1 });
    expect(r.partial).toBe(true);
  });
});
