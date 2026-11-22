import { describe, expect, it } from "vitest";
import { makeApp } from "./helpers.ts";

describe("learning loops", () => {
  it("no review below the tool-step threshold", async () => {
    const { app, engine } = makeApp();
    const chat = app.store.create();
    app.send(chat.id, "steps 9");
    await app.drain();
    expect(engine.prompts.filter((p) => p.prompt.includes("[pheme:skill-review]"))).toHaveLength(0);
  });

  it("skill review runs at 10+ tool steps, in a hidden session, and posts a notice", async () => {
    const { app, engine } = makeApp();
    const chat = app.store.create();
    app.send(chat.id, "steps 10");
    await app.drain();
    const reviews = engine.prompts.filter((p) => p.prompt.includes("[pheme:skill-review]"));
    expect(reviews).toHaveLength(1);
    expect(reviews[0].opts.id).not.toBe(chat.id);
    expect(reviews[0].opts.tools.map((t) => t.name).sort()).toEqual(["skill_manage", "skill_view"]);
    expect(reviews[0].opts.customToolsOnly).toBe(true);
    expect(await reviews[0].opts.onPermission({ kind: "shell", title: "", detail: "" })).toBe("deny");
    expect(app.skills.list()).toHaveLength(1);
    const notice = app.store.events(chat.id).find((e) => e.type === "notice");
    expect(notice).toMatchObject({ kind: "skill" });
    expect(app.store.list().every((c) => !c.hidden)).toBe(true);
    expect(app.settings.usage().reviews).toBe(1);
  });

  it("the review sees the skills index, so a second run patches instead of duplicating", async () => {
    const { app } = makeApp();
    for (let i = 0; i < 2; i++) {
      const chat = app.store.create();
      app.send(chat.id, "steps 10");
      await app.drain();
    }
    expect(app.skills.list()).toHaveLength(1);
  });

  it("memory review runs every N user messages", async () => {
    const { app, engine } = makeApp();
    app.settings.update({ memoryReviewEveryUserMessages: 3 });
    const chat = app.store.create();
    for (const t of ["hello", "remember I am a beginner", "ok"]) {
      app.send(chat.id, t);
      await app.drain();
    }
    expect(engine.prompts.filter((p) => p.prompt.includes("[pheme:memory-review]"))).toHaveLength(1);
    expect(app.memory.read("user").join(" ")).toContain("I am a beginner");
    expect(app.store.events(chat.id).some((e) => e.type === "notice" && e.kind === "memory")).toBe(true);
    app.send(chat.id, "again");
    await app.drain();
    expect(engine.prompts.filter((p) => p.prompt.includes("[pheme:memory-review]"))).toHaveLength(1);
  });

  it("the switch turns loops off", async () => {
    const { app, engine } = makeApp();
    app.settings.update({ loopsEnabled: false });
    const chat = app.store.create();
    app.send(chat.id, "steps 12");
    await app.drain();
    expect(engine.prompts.filter((p) => p.prompt.includes("[pheme:"))).toHaveLength(0);
  });
});
