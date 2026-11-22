import { describe, expect, it } from "vitest";
import { makeApp } from "./helpers.ts";

// Step 9 of the v1 plan: a chat with 10+ tool steps triggers a skill review that saves a skill;
// a new chat lists and uses that skill. Fake engine, real app, real files.
describe("end to end: skill learning loop", () => {
  it("learns a skill from a long chat and uses it in a new chat", async () => {
    const { app, engine } = makeApp();

    const first = app.store.create();
    app.send(first.id, "steps 12 to tidy the report");
    await app.drain();

    expect(app.store.events(first.id).filter((e) => e.type === "tool_start")).toHaveLength(12);
    const skills = app.skills.list();
    expect(skills).toHaveLength(1);
    const learned = skills[0].name;
    expect(app.skills.view(learned)).toContain("## Procedure");

    const second = app.store.create();
    app.send(second.id, "please use the skill");
    await app.drain();

    const session = engine.sessions.find((s) => s.id === second.id)!;
    expect(session.systemMessage).toContain(`- ${learned}:`);
    const used = app.store.events(second.id).find((e) => e.type === "tool_start" && e.name === "skill_view");
    expect(used).toMatchObject({ args: { name: learned } });
    const end = app.store.events(second.id).find((e) => e.type === "tool_end" && e.name === "skill_view");
    expect(end).toMatchObject({ ok: true });
    expect((end as { result: string }).result).toContain("## Procedure");
  });
});
