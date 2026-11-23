import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MAX_NAME, MAX_PROMPTS, MAX_TEXT, normalizeDir, PromptStore } from "../src/prompts.ts";
import { startServer, type RunningServer } from "../src/server.ts";
import { makeApp, tmpDir } from "./helpers.ts";

const status = (fn: () => unknown) => { try { fn(); return 0; } catch (e) { return (e as { status?: number }).status ?? -1; } };

describe("normalizeDir", () => {
  it("trims, drops trailing slashes (keeping a bare root), and treats empty as 'all chats'", () => {
    expect(normalizeDir("  /home/me/proj/  ")).toBe("/home/me/proj");
    expect(normalizeDir("C:\\Users\\me\\proj\\\\")).toBe("C:\\Users\\me\\proj");
    expect(normalizeDir("/")).toBe("/");
    expect(normalizeDir("C:\\")).toBe("C:\\");
    expect(normalizeDir("   ")).toBeUndefined();
    expect(normalizeDir(undefined)).toBeUndefined();
    expect(normalizeDir(null)).toBeUndefined();
    expect(status(() => normalizeDir(5))).toBe(400);
    expect(status(() => normalizeDir("a\u0000b"))).toBe(400);
    expect(status(() => normalizeDir("x".repeat(501)))).toBe(400);
  });
});

describe("PromptStore", () => {
  it("creates, lists alphabetically (ignoring case), updates and deletes; survives a restart", () => {
    const dir = tmpDir(); const s = new PromptStore(dir);
    const b = s.create({ name: "beta", text: "B" }), a = s.create({ name: "Alpha", text: "A\r\nline2" });
    expect(s.list().map((p) => p.name)).toEqual(["Alpha", "beta"]);
    expect(a.text).toBe("A\nline2"); // Windows line endings are normalised
    const u = s.update(b.id, { text: "B2" }, 999);
    expect(u).toMatchObject({ name: "beta", text: "B2", updatedAt: 999, createdAt: b.createdAt });
    expect(new PromptStore(dir).list().find((p) => p.id === b.id)?.text).toBe("B2");
    s.remove(a.id);
    expect(s.list().map((p) => p.name)).toEqual(["beta"]);
    expect(status(() => s.remove(a.id))).toBe(404);
    expect(status(() => s.update("nope", { text: "x" }))).toBe(404);
  });
  it("validates names and text, and keeps names unique within a scope (case-insensitive) but not across scopes", () => {
    const s = new PromptStore(tmpDir());
    for (const bad of [{ name: "", text: "x" }, { name: "   ", text: "x" }, { name: "n", text: "" }, { name: "n", text: "  \n " }, { name: 5, text: "x" }, { name: "n", text: {} }, { name: "x".repeat(MAX_NAME + 1), text: "x" }, { name: "n", text: "x".repeat(MAX_TEXT + 1) }, { name: "n", text: "a\u0000b" }]) expect(status(() => s.create(bad as never)), JSON.stringify(bad).slice(0, 40)).toBe(400);
    expect(s.create({ name: "  Multi\n  line\tname ", text: "x" }).name).toBe("Multi line name");
    s.create({ name: "Review", text: "r" });
    expect(status(() => s.create({ name: "review", text: "again" }))).toBe(409);
    expect(s.create({ name: "Review", text: "for the project", projectDir: "/p/one/" }).projectDir).toBe("/p/one");
    expect(status(() => s.create({ name: "REVIEW", text: "dup", projectDir: "/p/one" }))).toBe(409);
    expect(s.create({ name: "Review", text: "other project", projectDir: "/p/two" })).toBeTruthy();
    const x = s.create({ name: "Other", text: "o" });
    expect(status(() => s.update(x.id, { name: "review" }))).toBe(409);
    expect(s.update(x.id, { name: "OTHER" }).name).toBe("OTHER"); // renaming to itself (case change) is fine
  });
  it("update can move a prompt to a project or back to all chats", () => {
    const s = new PromptStore(tmpDir());
    const p = s.create({ name: "n", text: "t" });
    expect(s.update(p.id, { projectDir: "/proj/" }).projectDir).toBe("/proj");
    expect(s.update(p.id, { text: "t2" }).projectDir).toBe("/proj"); // untouched when not mentioned
    expect(s.update(p.id, { projectDir: "" }).projectDir).toBeUndefined();
  });
  it("caps the number of prompts", () => {
    const s = new PromptStore(tmpDir());
    const file = path.join((s as unknown as { file: string }).file);
    fs.writeFileSync(file, JSON.stringify(Array.from({ length: MAX_PROMPTS }, (_, i) => ({ id: `i${i}`, name: `n${i}`, text: "t", createdAt: 1, updatedAt: 1 }))));
    expect(status(() => s.create({ name: "one more", text: "x" }))).toBe(409);
  });
  it("ignores damaged or hand-edited files instead of failing", () => {
    const dir = tmpDir(); const file = path.join(dir, "prompts.json"); const s = new PromptStore(dir);
    fs.writeFileSync(file, "{not json"); expect(s.list()).toEqual([]);
    fs.writeFileSync(file, JSON.stringify({ not: "a list" })); expect(s.list()).toEqual([]);
    fs.writeFileSync(file, JSON.stringify([null, 5, "x", { id: 1 }, { id: "a", name: "", text: "t" }, { id: "b", name: "ok", text: "fine", projectDir: 7 }]));
    expect(s.list()).toEqual([{ id: "b", name: "ok", text: "fine", createdAt: 0, updatedAt: 0 }]);
    expect(s.create({ name: "new", text: "x" }).name).toBe("new"); // and it can write again
  });
});

describe("prompts over HTTP", () => {
  let srv: RunningServer | undefined;
  afterEach(async () => { await srv?.close(); srv = undefined; });
  it("CRUD with auth, and the right error codes", async () => {
    const ctx = makeApp();
    srv = await startServer({ app: ctx.app, fake: true, version: "t", token: "tok", assets: {} });
    const base = `http://127.0.0.1:${srv.port}/api/prompts`;
    const call = (p: string, method = "GET", body?: unknown, token = "tok") => fetch(base + p, { method, headers: { "x-pheme-token": token, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    expect((await call("", "GET", undefined, "bad")).status).toBe(401);
    const made = await call("", "POST", { name: "Explain", text: "Explain {{this}} simply", projectDir: "/p" });
    expect(made.status).toBe(201);
    const p = (await made.json()) as { id: string };
    expect(((await (await call("")).json()) as unknown[]).length).toBe(1);
    expect((await call("", "POST", { name: "explain", text: "x", projectDir: "/p/" })).status).toBe(409);
    expect((await call("", "POST", { name: "", text: "x" })).status).toBe(400);
    expect((await call(`/${p.id}`, "PUT", { text: "new" })).status).toBe(200);
    expect((await call("/nope", "PUT", { text: "x" })).status).toBe(404);
    expect((await call(`/${p.id}`, "DELETE")).status).toBe(200);
    expect((await call(`/${p.id}`, "DELETE")).status).toBe(404);
    expect((await call(`/${p.id}`, "PATCH", {})).status).toBe(405);
  });
});
