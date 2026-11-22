import http from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { startServer, type RunningServer } from "../src/server.ts";
import { makeApp } from "./helpers.ts";

let srv: RunningServer | undefined;
afterEach(async () => {
  await srv?.close();
  srv = undefined;
});

async function boot() {
  const ctx = makeApp();
  srv = await startServer({ app: ctx.app, fake: true, version: "t", token: "secret-token", assets: { "/index.html": { type: "text/html", data: Buffer.from("<h1>hi</h1>").toString("base64") } } });
  const base = `http://127.0.0.1:${srv.port}`;
  const call = (p: string, init: RequestInit = {}) =>
    fetch(base + p, { ...init, headers: { "x-pheme-token": "secret-token", "content-type": "application/json", ...(init.headers ?? {}) } });
  return { ...ctx, base, call };
}

describe("server", () => {
  it("serves the UI without a token but protects the API", async () => {
    const { base } = await boot();
    expect(await (await fetch(base + "/")).text()).toContain("hi");
    expect((await fetch(base + "/api/state")).status).toBe(401);
    expect((await fetch(base + "/api/state", { headers: { "x-pheme-token": "wrong-token" } })).status).toBe(401);
  });

  it("rejects non-loopback Host and foreign Origin", async () => {
    const { base, call } = await boot();
    const status = await new Promise<number>((resolve, reject) => {
      http.get(base + "/api/state", { headers: { "x-pheme-token": "secret-token", host: "evil.example.com" } }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      }).on("error", reject);
    });
    expect(status).toBe(403);
    expect((await call("/api/state", { headers: { origin: "https://evil.example.com" } })).status).toBe(403);
  });

  it("creates a chat, streams events over SSE and supports pin/archive/search data", async () => {
    const { call, base } = await boot();
    const chat = await (await call("/api/chats", { method: "POST", body: "{}" })).json();
    const es = await fetch(`${base}/api/chats/${chat.id}/events?token=secret-token`);
    const reader = es.body!.getReader();
    const r = await call(`/api/chats/${chat.id}/messages`, { method: "POST", body: JSON.stringify({ text: "hello" }) });
    expect(r.status).toBe(202);
    let text = "";
    const dec = new TextDecoder();
    while (!text.includes('"type":"idle"')) {
      const { value, done } = await reader.read();
      if (done) break;
      text += dec.decode(value);
    }
    await reader.cancel();
    expect(text).toContain('"type":"user"');
    expect(text).toContain('"type":"message"');

    await call(`/api/chats/${chat.id}`, { method: "PATCH", body: JSON.stringify({ pinned: true, archived: true }) });
    const list = await (await call("/api/chats")).json();
    expect(list[0]).toMatchObject({ id: chat.id, pinned: true, archived: true });
    const full = await (await call(`/api/chats/${chat.id}`)).json();
    expect(full.events.some((e: { type: string }) => e.type === "message")).toBe(true);
  });

  it("answers approvals over HTTP", async () => {
    const { call, app } = await boot();
    const chat = await (await call("/api/chats", { method: "POST", body: "{}" })).json();
    await call(`/api/chats/${chat.id}/messages`, { method: "POST", body: JSON.stringify({ text: "run ls" }) });
    for (let i = 0; i < 200 && !app.pendingApprovals(chat.id).length; i++) await new Promise((r) => setTimeout(r, 5));
    const id = app.pendingApprovals(chat.id)[0];
    expect((await call(`/api/chats/${chat.id}/approvals/${id}`, { method: "POST", body: JSON.stringify({ decision: "once" }) })).status).toBe(200);
    await app.drain();
    expect(app.store.events(chat.id).some((e) => e.type === "tool_end" && e.ok)).toBe(true);
  });

  it("settings, memory and skills endpoints", async () => {
    const { call } = await boot();
    expect((await (await call("/api/settings", { method: "PUT", body: JSON.stringify({ autoApproveAll: true, bogus: 1 }) })).json()).autoApproveAll).toBe(true);
    const mem = await (await call("/api/memory", { method: "PUT", body: JSON.stringify({ store: "user", entries: ["a", "b"] }) })).json();
    expect(mem.user).toEqual(["a", "b"]);
    expect((await call("/api/memory", { method: "PUT", body: JSON.stringify({ store: "user", entries: ["x".repeat(2000)] }) })).status).toBe(400);
    const content = "---\nname: s1\ndescription: Use when testing.\n---\nbody";
    await call("/api/skills/s1", { method: "PUT", body: JSON.stringify({ content }) });
    expect(await (await call("/api/skills")).json()).toEqual([{ name: "s1", description: "Use when testing." }]);
    expect((await (await call("/api/skills/s1")).json()).content).toBe(content);
    await call("/api/skills/s1", { method: "DELETE" });
    expect(await (await call("/api/skills")).json()).toEqual([]);
  });
});
