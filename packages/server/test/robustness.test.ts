import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ChatStore } from "../src/store.ts";
import { SettingsStore, readJson, validSetting } from "../src/settings.ts";
import { MemoryStore } from "../src/memory.ts";
import { AgentStore } from "../src/agents.ts";
import { defaultScript, type FakeScript } from "../src/fake.ts";
import { makeApp, tmpDir } from "./helpers.ts";
import { DEFAULT_SETTINGS } from "../src/protocol.ts";

describe("settings validation", () => {
  it("defaults to the dark gold theme", () => {
    expect(DEFAULT_SETTINGS.theme).toBe("pheme-gold-dark");
  });
  it("accepts sane values and ignores garbage", () => {
    expect(validSetting("memoryReviewEveryUserMessages", 5)).toBe(true);
    for (const [k, v] of [["memoryReviewEveryUserMessages", 0], ["memoryReviewEveryUserMessages", 2.5], ["skillReviewMinToolSteps", -3], ["memoryLimit", 5], ["curatorEveryDays", 1e12], ["theme", "x".repeat(500)], ["autoApproveAll", "yes"]] as const) {
      expect(validSetting(k, v)).toBe(false);
    }
    const s = new SettingsStore(tmpDir());
    s.update({ memoryReviewEveryUserMessages: 0, theme: "github-dark" });
    expect(s.get().memoryReviewEveryUserMessages).toBe(10);
    expect(s.get().theme).toBe("github-dark");
  });
});

describe("corrupt files", () => {
  it("readJson falls back on the wrong shape", () => {
    const d = tmpDir();
    const f = path.join(d, "x.json");
    for (const bad of ["{broken", "null", "7", "[]", '"str"']) {
      fs.writeFileSync(f, bad);
      expect(readJson(f, { a: 1 })).toEqual({ a: 1 });
    }
    fs.writeFileSync(f, "{}");
    expect(readJson<unknown[]>(f, [])).toEqual([]);
    expect(new AgentStore(d).listRuns()).toEqual([]);
  });
  it("a torn last line does not swallow the next event", () => {
    const d = tmpDir();
    const store = new ChatStore(d);
    const c = store.create();
    const f = path.join(d, "sessions", `${c.id}.jsonl`);
    fs.writeFileSync(f, '{"type":"user","text":"one","seq":1,"ts":1}\n{"type":"message","text":"torn');
    const fresh = new ChatStore(d);
    fresh.append(c.id, { type: "user", text: "two" });
    expect(fresh.events(c.id).map((e) => (e as { text?: string }).text)).toEqual(["one", "two"]);
  });
  it("events from a deleted chat's still-running turn do not recreate its files", () => {
    const d = tmpDir();
    const store = new ChatStore(d);
    const c = store.create();
    store.append(c.id, { type: "user", text: "hi" });
    store.remove(c.id);
    store.append(c.id, { type: "idle" });
    expect(fs.readdirSync(path.join(d, "sessions")).filter((x) => x.startsWith(c.id))).toEqual([]);
  });
  it("invalid ids are simply not found", () => {
    const store = new ChatStore(tmpDir());
    for (const id of ["..", "a.b", "a/b", "", "x".repeat(100)]) expect(store.get(id)).toBeUndefined();
  });
  it("memory entries cannot contain the separator", () => {
    const m = new MemoryStore(tmpDir(), () => ({ memory: 500, user: 500 }));
    expect(() => m.write("user", ["a § b"])).toThrow(/§/);
    expect(() => m.apply({ action: "add", store: "user", content: "x\n§\ny" })).toThrow(/§/);
  });
});

describe("session management", () => {
  it("keeps at most 8 sessions open, and resumes an evicted chat", async () => {
    const { app, engine } = makeApp();
    const ids: string[] = [];
    for (let i = 0; i < 12; i++) {
      const c = app.store.create();
      ids.push(c.id);
      app.send(c.id, `hello ${i}`);
      await app.drain();
    }
    expect(app.openSessionCount()).toBeLessThanOrEqual(8);
    expect(engine.closed).toContain(ids[0]);
    app.send(ids[0], "back again");
    await app.drain();
    const last = engine.sessions.filter((s) => s.id === ids[0]).at(-1)!;
    expect(last.resume).toBe(true);
    expect(app.store.events(ids[0]).at(-3)?.type).toBe("message");
  });

  it("a failed turn drops the session so the next message starts a fresh one", async () => {
    let calls = 0;
    const script: FakeScript = (ctx) => {
      if (ctx.prompt === "boom" && ++calls === 1) throw new Error("CLI died");
      return defaultScript(ctx);
    };
    const { app, engine } = makeApp(script);
    const c = app.store.create();
    app.send(c.id, "boom");
    await app.drain();
    expect(app.store.events(c.id).some((e) => e.type === "error")).toBe(true);
    expect(engine.closed).toContain(c.id);
    app.send(c.id, "boom");
    await app.drain();
    expect(engine.sessions.filter((s) => s.id === c.id)).toHaveLength(2);
    expect(app.store.events(c.id).at(-3)?.type).toBe("message");
  });

  it("removeChat closes the session and forgets permissions", async () => {
    const { app, engine } = makeApp();
    const c = app.store.create();
    app.send(c.id, "hello");
    await app.drain();
    await app.removeChat(c.id);
    expect(engine.closed).toContain(c.id);
    expect(app.openSessionCount()).toBe(0);
    expect(app.store.get(c.id)).toBeUndefined();
  });

  it("hidden chats cannot be sent messages", async () => {
    const { app } = makeApp();
    const h = app.store.create({ hidden: true });
    expect(() => app.send(h.id, "hi")).toThrow(/no such chat/);
  });
});
