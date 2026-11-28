import { describe, expect, it } from "vitest";
import { makeApp } from "./helpers.ts";

describe("reasoning effort", () => {
  it("the chosen effort reaches the session it creates (fake mode)", async () => {
    const { app, engine } = makeApp();
    app.settings.update({ model: "fake-large", reasoningEffort: "high" });
    const chat = app.store.create();
    app.send(chat.id, "think hard");
    await app.drain();
    const opts = engine.sessions.at(-1)!;
    expect(opts.model).toBe("fake-large");
    expect(opts.reasoningEffort).toBe("high");
  });

  it("a change starts a new session with the new effort, and an unset effort is not sent", async () => {
    const { app, engine } = makeApp();
    app.settings.update({ model: "fake-large", reasoningEffort: "low" });
    const chat = app.store.create();
    app.send(chat.id, "one");
    await app.drain();
    app.settings.update({ reasoningEffort: "high" });
    app.send(chat.id, "two");
    await app.drain();
    expect(engine.sessions.map((s) => s.reasoningEffort)).toEqual(["low", "high"]);
    expect(engine.closed.length).toBe(1);
    app.settings.update({ reasoningEffort: "" });
    app.send(chat.id, "three");
    await app.drain();
    expect(engine.sessions.at(-1)!.reasoningEffort).toBeUndefined();
  });

  it("only the models that report levels are listed with them; the setting rejects odd values", async () => {
    const { app } = makeApp();
    const models = await app.engine.listModels();
    expect(models.find((m) => m.id === "fake-large")?.reasoningEfforts).toEqual(["low", "medium", "high"]);
    expect(models.find((m) => m.id === "fake-mini")?.reasoningEfforts).toBeUndefined();
    expect(() => app.settings.update({ reasoningEffort: "<script>" })).not.toThrow();
    expect(app.settings.get().reasoningEffort).toBe("");
  });
});
