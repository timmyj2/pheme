import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { applyBackup, backupFileName, createBackup, previewBackup, readBackup, safeArchivePath } from "../src/backup.ts";
import { gitDiff, gitStatus } from "../src/git.ts";
import { startServer, type RunningServer } from "../src/server.ts";
import { makeApp } from "./helpers.ts";

const dirs: string[] = [];
const tmp = () => { const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "pheme-bk-"))); dirs.push(d); return d; };
let srv: RunningServer | undefined;
afterEach(async () => { await srv?.close(); srv = undefined; for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });
const w = (d: string, f: string, c: string | Buffer) => { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), c); };
const r = (d: string, f: string) => fs.readFileSync(path.join(d, f), "utf8");
const forge = (obj: unknown) => zlib.gzipSync(Buffer.from(JSON.stringify(obj)));
const archive = (files: { path: string; b64?: string }[], over: object = {}) => forge({ format: "pheme-backup", version: 1, createdAt: 1, files: files.map((f) => ({ b64: Buffer.from("x").toString("base64"), ...f })), ...over });

function seed(d: string) {
  w(d, "sessions/aaaa.meta.json", '{"id":"aaaa","title":"One"}'); w(d, "sessions/aaaa.jsonl", '{"type":"user","text":"hi"}\n');
  w(d, "sessions/bbbb.meta.json", '{"id":"bbbb","title":"Two"}');
  w(d, "skills/my-skill/SKILL.md", "---\nname: my-skill\n---\nbody"); w(d, "skills/.archive/old-1/SKILL.md", "old");
  w(d, "agents/poet.md", "poet"); w(d, "memory/MEMORY.md", "likes tea"); w(d, "settings.json", '{"theme":"dark"}');
  w(d, "pheme.lock", "123"); w(d, "backups/x.pheme-backup", "must not be included"); w(d, "sessions/half.jsonl.99.tmp", "tmp"); w(d, "notes.txt", "unknown top-level");
}

describe("safeArchivePath", () => {
  it("accepts normal names and rejects everything that could escape or confuse a file system", () => {
    for (const ok of ["sessions/a.jsonl", "skills/my skill/SKILL.md", "settings.json", "memory/USER.md"]) expect(safeArchivePath(ok)).toBe(ok);
    for (const bad of ["../x", "sessions/../../x", "/etc/passwd", "sessions//a", "sessions/./a", "C:/x", "sessions\\a", "sessions/a:b", "sessions/a\0b", "sessions/trailing.", "sessions/trailing ", "", "x".repeat(400), "notes.txt", "backups/a", "pheme.lock", ".git/config", 5 as never, null as never])
      expect(() => safeArchivePath(bad), String(bad)).toThrow();
  });
});

describe("createBackup / readBackup", () => {
  it("round-trips the data folder, leaving out the lock file, backups, temp files and unknown names", () => {
    const d = tmp(); seed(d);
    const a = readBackup(createBackup(d, "9.9", 1_700_000_000_000));
    const names = a.files.map((f) => f.path);
    expect(names).toContain("sessions/aaaa.jsonl");
    expect(names).toContain("skills/.archive/old-1/SKILL.md");
    for (const never of ["pheme.lock", "backups/x.pheme-backup", "sessions/half.jsonl.99.tmp", "notes.txt"]) expect(names).not.toContain(never);
    expect(a).toMatchObject({ format: "pheme-backup", version: 1, appVersion: "9.9", createdAt: 1_700_000_000_000 });
  });
  it("names the file with a sortable UTC timestamp", () => {
    expect(backupFileName(Date.UTC(2026, 10, 23, 7, 5))).toBe("pheme-backup-20261123-0705.pheme-backup");
  });
  it("does not follow symlinks out of the data folder", () => {
    if (process.platform === "win32") return;
    const d = tmp(), outside = tmp(); w(outside, "secret.txt", "TOP SECRET");
    fs.mkdirSync(path.join(d, "skills")); fs.symlinkSync(outside, path.join(d, "skills", "link")); fs.symlinkSync(path.join(outside, "secret.txt"), path.join(d, "settings.json"));
    const names = readBackup(createBackup(d)).files.map((f) => f.path);
    expect(names.join()).not.toContain("secret");
    expect(names).toEqual([]);
  });
});

describe("readBackup rejects hostile or damaged files", () => {
  it("not gzip, empty, wrong format, wrong version, bad structure, bad base64, duplicate names", () => {
    expect(() => readBackup(Buffer.alloc(0))).toThrow(/empty/);
    expect(() => readBackup(Buffer.from("hello"))).toThrow(/not a Pheme backup/);
    expect(() => readBackup(zlib.gzipSync(Buffer.from("{broken")))).toThrow(/damaged/);
    expect(() => readBackup(forge({ format: "zip", version: 1, files: [] }))).toThrow(/not a Pheme backup/);
    expect(() => readBackup(forge({ format: "pheme-backup", version: 2, files: [] }))).toThrow(/newer version/);
    expect(() => readBackup(forge({ format: "pheme-backup", version: 1 }))).toThrow(/no file list/);
    expect(() => readBackup(archive([{ path: "sessions/a.jsonl", b64: "not base64!!" }]))).toThrow(/bad data/);
    expect(() => readBackup(archive([{ path: "sessions/a.jsonl" }, { path: "sessions/A.JSONL" }]))).toThrow(/twice/);
  });
  it("path traversal, absolute paths and unknown folders — and nothing is written when any entry is bad", () => {
    const d = tmp(); w(d, "settings.json", "KEEP");
    for (const bad of ["../escape.txt", "sessions/../../escape.txt", "/tmp/abs", "evil/x", "settings.json/../../x"]) {
      expect(() => applyBackup(archive([{ path: "sessions/good.jsonl" }, { path: bad }]), d, { overwrite: true }), bad).toThrow();
    }
    expect(fs.existsSync(path.join(d, "sessions", "good.jsonl"))).toBe(false); // the good entry before the bad one was not written
    expect(r(d, "settings.json")).toBe("KEEP");
    expect(fs.existsSync(path.join(path.dirname(d), "escape.txt"))).toBe(false);
  });
  it("a small file that expands enormously is refused, not expanded", () => {
    const bomb = zlib.gzipSync(Buffer.alloc(600_000_000, 0x20)); // 600 MB of spaces compresses to a few hundred KB
    expect(bomb.length).toBeLessThan(2_000_000);
    expect(() => readBackup(bomb)).toThrow(/too large/);
  });
});

describe("previewBackup / applyBackup", () => {
  it("summarises what is inside and what already exists", () => {
    const src = tmp(); seed(src);
    const dst = tmp(); w(dst, "sessions/aaaa.meta.json", "already here"); w(dst, "settings.json", "mine");
    const p = previewBackup(createBackup(src), dst);
    expect(p).toMatchObject({ chats: 2, skills: 1, agents: 1, hasMemory: true, hasSettings: true, existingChats: 1, existingFiles: 2 });
    expect(p.newFiles).toBe(p.files - 2);
  });
  it("by default only adds what is missing; with overwrite it replaces; either way a safety backup is saved first", () => {
    const src = tmp(); seed(src);
    const archiveBuf = createBackup(src);
    const dst = tmp(); w(dst, "settings.json", "MINE"); w(dst, "sessions/aaaa.meta.json", "MINE TOO");
    const a = applyBackup(archiveBuf, dst, { overwrite: false, now: 1_700_000_000_000 });
    expect(a.skipped).toBe(2);
    expect(r(dst, "settings.json")).toBe("MINE");
    expect(r(dst, "sessions/bbbb.meta.json")).toContain("Two");
    expect(r(dst, "skills/my-skill/SKILL.md")).toContain("body");
    expect(a.safetyBackup).toMatch(/^before-restore-pheme-backup-/);
    const safety = readBackup(fs.readFileSync(path.join(dst, "backups", a.safetyBackup!)));
    expect(safety.files.map((f) => f.path)).toContain("settings.json"); // the pre-restore state is recoverable
    const b = applyBackup(archiveBuf, dst, { overwrite: true, now: 1_700_000_100_000 });
    expect(b.skipped).toBe(0);
    expect(r(dst, "settings.json")).toBe('{"theme":"dark"}');
    expect(fs.readdirSync(dst).includes("pheme.lock")).toBe(false);
  });
  it("restoring into an empty folder makes no safety backup, and old safety backups are pruned to five", () => {
    const src = tmp(); seed(src);
    const buf = createBackup(src);
    const empty = tmp();
    expect(applyBackup(buf, empty, { overwrite: false }).safetyBackup).toBeUndefined();
    expect(fs.existsSync(path.join(empty, "backups"))).toBe(false);
    for (let i = 0; i < 8; i++) applyBackup(buf, empty, { overwrite: true, now: 1_700_000_000_000 + i * 120_000 });
    expect(fs.readdirSync(path.join(empty, "backups")).length).toBe(5);
  });
  it("handles non-ASCII names and binary content exactly", () => {
    const src = tmp(); const bytes = Buffer.from([0, 255, 1, 254, 10, 13, 0]);
    w(src, "skills/café-日本/SKILL.md", "ünï"); w(src, "sessions/bin.jsonl", bytes);
    const dst = tmp(); applyBackup(createBackup(src), dst, { overwrite: false });
    expect(r(dst, "skills/café-日本/SKILL.md")).toBe("ünï");
    expect(fs.readFileSync(path.join(dst, "sessions/bin.jsonl")).equals(bytes)).toBe(true);
  });
});

describe("HTTP", () => {
  async function boot() {
    const ctx = makeApp();
    srv = await startServer({ app: ctx.app, fake: true, version: "t", token: "secret-token", assets: {} });
    const base = `http://127.0.0.1:${srv.port}`;
    const call = (p: string, init: RequestInit = {}, token = "secret-token") => fetch(base + p, { ...init, headers: { "x-pheme-token": token, ...(init.headers ?? {}) } });
    return { ...ctx, call };
  }
  it("downloads a backup, previews it, restores it into another instance, and needs the token", async () => {
    const a = await boot();
    const chat = a.app.store.create({ title: "Keep me" }); a.app.store.append(chat.id, { type: "user", text: "remember this" });
    const dl = await a.call("/api/backup");
    expect(dl.status).toBe(200);
    expect(dl.headers.get("content-disposition")).toMatch(/pheme-backup-\d{8}-\d{4}\.pheme-backup/);
    const file = Buffer.from(await dl.arrayBuffer());
    expect((await a.call("/api/backup", {}, "bad-token")).status).toBe(401);
    await srv!.close(); srv = undefined;

    const b = await boot();
    const prev = await b.call("/api/restore/preview", { method: "POST", body: file });
    expect(await prev.json()).toMatchObject({ chats: 1 });
    expect(b.app.store.list()).toHaveLength(0); // preview wrote nothing
    expect((await b.call("/api/restore", { method: "POST", body: file }, "bad-token")).status).toBe(401);
    const res = await b.call("/api/restore", { method: "POST", body: file });
    expect(res.status).toBe(200);
    expect(b.app.store.list().map((c) => c.title)).toEqual(["Keep me"]);
    expect(b.app.store.events(chat.id).some((e) => e.type === "user")).toBe(true);
    expect((await b.call("/api/restore", { method: "POST", body: Buffer.from("junk") })).status).toBe(400);
  });
  it("refuses to restore while a reply is running", async () => {
    const { app, call } = await boot();
    const file = createBackup(app.dataDir);
    const chat = app.store.create(); app.send(chat.id, "run ls");
    await new Promise((r) => setTimeout(r, 200));
    const res = await call("/api/restore", { method: "POST", body: file });
    expect(res.status).toBe(409);
    app.stop(chat.id); await app.drain();
  });
});

describe("a project folder that no longer exists", () => {
  it("is reported as missing, not as 'git is not installed'", async () => {
    const gone = path.join(os.tmpdir(), "pheme-gone-" + Date.now());
    expect((await gitStatus(gone)).problem).toMatch(/no longer exists/);
    await expect(gitDiff(gone, "a.txt")).rejects.toThrow(/no longer exists/);
  });
});
