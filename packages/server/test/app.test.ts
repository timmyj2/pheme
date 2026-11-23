import { describe, expect, it } from "vitest";
import { makeApp } from "./helpers.ts";

const types = (app: ReturnType<typeof makeApp>["app"], id: string) => app.store.events(id).map((e) => e.type);

describe("App turns", () => {
  it("runs a turn and stores the transcript", async () => {
    const { app } = makeApp();
    const chat = app.store.create();
    app.send(chat.id, "hello there");
    await app.drain();
    expect(types(app, chat.id)).toEqual(["user", "turn_start", "message", "usage", "idle"]);
    expect(app.store.get(chat.id)?.title).toBe("hello there");
    expect(app.settings.usage().turns).toBe(1);
  });

  it("refuses a second message while busy", async () => {
    const { app } = makeApp();
    const chat = app.store.create();
    app.send(chat.id, "run ls");
    expect(() => app.send(chat.id, "again")).toThrow(/still working/);
    app.stop(chat.id);
    await app.drain();
  });

  it("asks before running a shell command and honours Deny", async () => {
    const { app } = makeApp();
    const chat = app.store.create();
    app.send(chat.id, "run rm -rf /tmp/x");
    await waitFor(() => app.pendingApprovals(chat.id).length === 1);
    const [id] = app.pendingApprovals(chat.id);
    expect(app.resolveApproval(chat.id, id, "deny")).toBe(true);
    await app.drain();
    const ev = app.store.events(chat.id);
    expect(ev.find((e) => e.type === "approval_request")).toMatchObject({ kind: "shell", detail: "rm -rf /tmp/x" });
    expect(ev.find((e) => e.type === "tool_end")).toMatchObject({ ok: false, result: "Denied by user" });
  });

  it("Allow for this chat skips later prompts of the same kind", async () => {
    const { app } = makeApp();
    const chat = app.store.create();
    app.send(chat.id, "run one");
    await waitFor(() => app.pendingApprovals(chat.id).length === 1);
    app.resolveApproval(chat.id, app.pendingApprovals(chat.id)[0], "chat");
    await app.drain();
    app.send(chat.id, "run two");
    await app.drain();
    expect(app.store.events(chat.id).filter((e) => e.type === "approval_request")).toHaveLength(1);
    expect(app.store.events(chat.id).filter((e) => e.type === "tool_end" && e.ok)).toHaveLength(2);
  });

  it("Auto-approve all skips the card; reads never prompt", async () => {
    const { app } = makeApp();
    app.settings.update({ autoApproveAll: true });
    const chat = app.store.create();
    app.send(chat.id, "edit a.txt");
    await app.drain();
    expect(app.store.events(chat.id).some((e) => e.type === "approval_request")).toBe(false);
    const c2 = app.store.create();
    app.settings.update({ autoApproveAll: false });
    app.send(c2.id, "steps 3");
    await app.drain();
    expect(app.store.events(c2.id).some((e) => e.type === "approval_request")).toBe(false);
  });

  it("injects memory and the skills index into the system message of a new session", async () => {
    const { app, engine } = makeApp();
    app.memory.apply({ action: "add", store: "user", content: "prefers short answers" });
    app.skills.manage({ action: "create", name: "demo", content: "---\nname: demo\ndescription: Use when demoing.\n---\nbody" });
    const chat = app.store.create();
    app.send(chat.id, "hi");
    await app.drain();
    const sys = engine.sessions[0].systemMessage;
    expect(sys).toContain("prefers short answers");
    expect(sys).toContain("- demo: Use when demoing.");
  });

  it("the memory tool writes through a chat", async () => {
    const { app } = makeApp();
    const chat = app.store.create();
    app.send(chat.id, "remember I like tea");
    await app.drain();
    expect(app.memory.read("user")).toEqual(["I like tea"]);
  });
});

async function waitFor(fn: () => boolean, ms = 2000) {
  const t = Date.now();
  while (!fn()) {
    if (Date.now() - t > ms) throw new Error("timeout");
    await new Promise((r) => setTimeout(r, 5));
  }
}
