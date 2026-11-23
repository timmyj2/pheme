import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AttachmentStore, checkAttachment, cleanName, sniffImage } from "../src/attachments.ts";
import { startServer, type RunningServer } from "../src/server.ts";
import { makeApp, tmpDir } from "./helpers.ts";

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 1)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 2)]);
const GIF = Buffer.concat([Buffer.from("GIF89a"), Buffer.alloc(30, 3)]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(20)]);
const status = (fn: () => unknown) => { try { fn(); return 0; } catch (e) { return (e as { status?: number }).status ?? -1; } };

describe("cleanName", () => {
  it("drops folders, control characters, leading/trailing dots and odd characters; keeps the extension when shortening", () => {
    expect(cleanName("../../etc/passwd")).toBe("passwd");
    expect(cleanName("C:\\Users\\me\\report.pdf.txt")).toBe("report.pdf.txt");
    expect(cleanName("  ..hidden.txt. ")).toBe("hidden.txt");
    expect(cleanName("a\u0000b\nc.txt")).toBe("abc.txt");
    expect(cleanName('we<ir>d:"name"?.md')).toBe("we_ir_d__name__.md");
    expect(cleanName("")).toBe("file");
    expect(cleanName("...")).toBe("file");
    const long = cleanName("x".repeat(400) + ".json");
    expect(long.length).toBe(100);
    expect(long.endsWith(".json")).toBe(true);
  });
});

describe("checkAttachment", () => {
  it("accepts real images by their bytes and reports the true type", () => {
    expect(sniffImage(PNG)).toBe("png"); expect(sniffImage(JPG)).toBe("jpg"); expect(sniffImage(GIF)).toBe("gif"); expect(sniffImage(WEBP)).toBe("webp");
    expect(checkAttachment("shot.PNG", PNG)).toMatchObject({ kind: "image", mime: "image/png", ext: ".png" });
    expect(checkAttachment("photo.jpeg", JPG)).toMatchObject({ mime: "image/jpeg", ext: ".jpg" });
    expect(checkAttachment("noext", PNG)).toMatchObject({ kind: "image", mime: "image/png" }); // pasted images have no real name
  });
  it("refuses images that lie about themselves, SVG, and fake images", () => {
    expect(status(() => checkAttachment("a.png", JPG))).toBe(415);
    expect(status(() => checkAttachment("a.png", Buffer.from("not an image at all")))).toBe(415);
    expect(status(() => checkAttachment("evil.svg", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')))).toBe(415);
    expect(status(() => checkAttachment("x.html.png", Buffer.from("<script>alert(1)</script>")))).toBe(415);
  });
  it("accepts plain text and code, with or without an extension for well-known names", () => {
    expect(checkAttachment("notes.md", Buffer.from("# hi ✓"))).toMatchObject({ kind: "text", mime: "text/plain", ext: ".md" });
    expect(checkAttachment("main.PY", Buffer.from("print(1)\n"))).toMatchObject({ kind: "text", ext: ".py" });
    expect(checkAttachment("Dockerfile", Buffer.from("FROM node\n"))).toMatchObject({ kind: "text", ext: "" });
  });
  it("refuses secrets, binaries pretending to be text, unknown types, empty and oversize files", () => {
    for (const n of [".env", "prod.env", "id_rsa", "server.pem", "credentials.json", ".npmrc", "service-account-prod.json"]) expect(status(() => checkAttachment(n, Buffer.from("x"))), n).toBe(422);
    expect(status(() => checkAttachment("a.txt", Buffer.from([0x68, 0x00, 0x69])))).toBe(415); // NUL byte
    expect(status(() => checkAttachment("a.txt", Buffer.from([0xff, 0xfe, 0xfd, 0xc3])))).toBe(415); // not UTF-8
    for (const n of ["a.exe", "a.zip", "a.pdf", "a.docx", "a.dll", "a.bin", "noextension", "a."]) expect(status(() => checkAttachment(n, Buffer.from("text"))), n).toBe(415);
    expect(status(() => checkAttachment("a.txt", Buffer.alloc(0)))).toBe(400);
    expect(status(() => checkAttachment("big.txt", Buffer.alloc(512 * 1024 + 1, 97)))).toBe(413);
    expect(status(() => checkAttachment("ok.txt", Buffer.alloc(512 * 1024, 97)))).toBe(0);
    expect(status(() => checkAttachment("big.png", Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)])))).toBe(413);
  });
});

describe("AttachmentStore", () => {
  it("saves under the chat, never trusts the client's name for the path, and reads back", () => {
    const dir = tmpDir(); const s = new AttachmentStore(dir);
    const ref = s.save("chat-1", "../../../../evil/../notes.md", Buffer.from("hello"));
    expect(ref).toMatchObject({ name: "notes.md", kind: "text", size: 5 });
    const f = s.open("chat-1", ref.id)!;
    expect(f.path.startsWith(path.join(dir, "attachments", "chat-1") + path.sep)).toBe(true);
    expect(path.basename(f.path)).toBe(`${ref.id}.md`);
    expect(fs.readFileSync(f.path, "utf8")).toBe("hello");
    expect(s.open("chat-2", ref.id)).toBeNull(); // another chat cannot read it
    expect(s.open("chat-1", "../../x")).toBeNull();
    expect(status(() => s.save("../escape", "a.txt", Buffer.from("x")))).toBe(400);
    expect(status(() => s.save("a/b", "a.txt", Buffer.from("x")))).toBe(400);
  });
  it("resolve: checks ids, limits the count, rejects other chats' files, and drops duplicates", () => {
    const s = new AttachmentStore(tmpDir());
    const a = s.save("c", "a.txt", Buffer.from("a")), b = s.save("d", "b.txt", Buffer.from("b"));
    expect(s.resolve("c", undefined)).toEqual([]);
    expect(s.resolve("c", [a.id, a.id])).toHaveLength(1);
    expect(status(() => s.resolve("c", [b.id]))).toBe(404);
    expect(status(() => s.resolve("c", ["nope"]))).toBe(400);
    expect(status(() => s.resolve("c", "x"))).toBe(400);
    expect(status(() => s.resolve("c", Array.from({ length: 6 }, () => a.id)))).toBe(400);
    expect(status(() => s.resolve("c", [{}]))).toBe(400);
  });
  it("sweeps unsent files after a day, keeps sent ones, and removes a whole chat", () => {
    const dir = tmpDir(); const s = new AttachmentStore(dir);
    const keep = s.save("c", "keep.txt", Buffer.from("k")), drop = s.save("c", "drop.txt", Buffer.from("d")), fresh = s.save("c", "fresh.txt", Buffer.from("f"));
    s.markSent("c", [keep.id]);
    expect(s.sweep("c", Date.now() + 2 * 3600_000)).toBe(0);
    expect(s.sweep("c", Date.now() + 25 * 3600_000)).toBe(2);
    expect(s.open("c", keep.id)).not.toBeNull();
    expect(s.open("c", drop.id)).toBeNull();
    expect(s.open("c", fresh.id)).toBeNull();
    s.removeChat("c");
    expect(fs.existsSync(path.join(dir, "attachments", "c"))).toBe(false);
    s.removeChat("never-existed"); s.removeChat("../bad"); // quietly nothing
  });
  it("survives a damaged or hand-edited metadata file", () => {
    const dir = tmpDir(); const s = new AttachmentStore(dir);
    const a = s.save("c", "a.txt", Buffer.from("a"));
    const metaPath = path.join(dir, "attachments", "c", `${a.id}.json`);
    fs.writeFileSync(metaPath, "{not json"); expect(s.open("c", a.id)).toBeNull();
    fs.writeFileSync(metaPath, JSON.stringify({ id: a.id, name: "x", kind: "text", mime: "text/plain", size: 1, file: "../../../etc/passwd", createdAt: 0, sent: false }));
    expect(s.open("c", a.id)).toBeNull(); // a file name that is not this id is refused
    expect(() => s.sweepAll()).not.toThrow();
  });
});

describe("attachments over HTTP", () => {
  let srv: RunningServer | undefined;
  afterEach(async () => { await srv?.close(); srv = undefined; });
  async function setup() {
    const ctx = makeApp();
    srv = await startServer({ app: ctx.app, fake: true, version: "t", token: "tok", assets: {} });
    const base = `http://127.0.0.1:${srv.port}`;
    const h = { "x-pheme-token": "tok" };
    const chat = ctx.app.store.create({ title: "t" });
    const upload = (name: string, body: Buffer | string, id = chat.id, token = "tok") => fetch(`${base}/api/chats/${id}/attachments?name=${encodeURIComponent(name)}`, { method: "POST", headers: { "x-pheme-token": token, "content-type": "application/octet-stream" }, body });
    const send = (text: string, attachments?: unknown, id = chat.id) => fetch(`${base}/api/chats/${id}/messages`, { method: "POST", headers: { ...h, "content-type": "application/json" }, body: JSON.stringify({ text, attachments }) });
    return { ctx, base, h, chat, upload, send };
  }
  const idle = async (ctx: ReturnType<typeof makeApp>, id: string) => { for (let i = 0; i < 100 && ctx.app.isBusy(id); i++) await new Promise((r) => setTimeout(r, 20)); };

  it("upload, send, the engine receives them, the transcript records them, and they download safely", async () => {
    const { ctx, base, h, chat, upload, send } = await setup();
    const img = (await (await upload("shot.png", PNG)).json()) as { id: string; kind: string };
    const txt = (await (await upload("notes.md", "# Notes\nhello")).json()) as { id: string };
    expect(img.kind).toBe("image");
    expect((await send("look at these", [img.id, txt.id])).status).toBe(202);
    await idle(ctx, chat.id);
    const got = ctx.engine.prompts[0];
    expect(got.prompt).toBe("look at these");
    expect(got.attachments).toHaveLength(2);
    expect(got.attachments![0]).toMatchObject({ kind: "image", name: "shot.png", mime: "image/png", data: PNG.toString("base64") });
    expect(got.attachments![1]).toMatchObject({ kind: "file", name: "notes.md" });
    expect(fs.readFileSync((got.attachments![1] as { path: string }).path, "utf8")).toBe("# Notes\nhello");
    const user = ctx.app.store.events(chat.id).find((e) => e.type === "user") as { attachments?: { id: string; name: string }[] };
    expect(user.attachments!.map((a) => a.name)).toEqual(["shot.png", "notes.md"]);
    const dl = await fetch(`${base}/api/chats/${chat.id}/attachments/${img.id}`, { headers: h });
    expect(dl.status).toBe(200);
    expect(dl.headers.get("content-type")).toBe("image/png");
    expect(dl.headers.get("x-content-type-options")).toBe("nosniff");
    expect(dl.headers.get("content-security-policy")).toContain("sandbox");
    expect(Buffer.from(await dl.arrayBuffer()).equals(PNG)).toBe(true);
    const dlt = await fetch(`${base}/api/chats/${chat.id}/attachments/${txt.id}`, { headers: h });
    expect(dlt.headers.get("content-type")).toBe("text/plain; charset=utf-8");
  });
  it("a message may be only attachments (gets a default sentence); empty message with none is refused", async () => {
    const { ctx, chat, upload, send } = await setup();
    const a = (await (await upload("a.txt", "x")).json()) as { id: string };
    expect((await send("", [a.id])).status).toBe(202);
    await idle(ctx, chat.id);
    expect(ctx.engine.prompts[0].prompt).toBe("Please take a look at the attached file.");
    expect((await send("   ")).status).toBe(400);
    expect((await send("", [])).status).toBe(400);
  });
  it("refuses bad uploads with the reason, and bad tokens, unknown chats and other chats' files", async () => {
    const { ctx, base, h, chat, upload, send } = await setup();
    const other = ctx.app.store.create({ title: "other" });
    const r = await upload(".env", "SECRET=1");
    expect(r.status).toBe(422);
    expect(((await r.json()) as { error: string }).error).toMatch(/secret/);
    expect((await upload("a.exe", "MZ")).status).toBe(415);
    expect((await upload("a.txt", "x", chat.id, "bad")).status).toBe(401);
    expect((await upload("a.txt", "x", "no-such-chat")).status).toBe(404);
    const ok = (await (await upload("a.txt", "x")).json()) as { id: string };
    expect((await send("hi", [ok.id], other.id)).status).toBe(404); // belongs to the first chat
    expect((await fetch(`${base}/api/chats/${other.id}/attachments/${ok.id}`, { headers: h })).status).toBe(404);
    expect((await fetch(`${base}/api/chats/${chat.id}/attachments/${ok.id}`, { headers: { "x-pheme-token": "bad" } })).status).toBe(401);
    expect((await fetch(`${base}/api/chats/${chat.id}/attachments/${ok.id}`, { method: "DELETE", headers: h })).status).toBe(405);
    expect((await send("hi", ["../../etc/passwd"])).status).toBe(400);
    expect((await send("hi", { a: 1 })).status).toBe(400);
  });
  it("huge uploads are cut off, and deleting the chat removes its files", async () => {
    const { ctx, chat, upload } = await setup();
    const big = await upload("big.png", Buffer.concat([PNG, Buffer.alloc(6 * 1024 * 1024)])).then((r) => r.status).catch(() => 413);
    expect(big).toBe(413);
    await upload("a.txt", "x");
    expect(fs.existsSync(path.join(ctx.dir, "attachments", chat.id))).toBe(true);
    await ctx.app.removeChat(chat.id);
    expect(fs.existsSync(path.join(ctx.dir, "attachments", chat.id))).toBe(false);
  });
});
