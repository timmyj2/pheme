import { describe, expect, it } from "vitest";
import { SkillStore } from "../src/skills.ts";
import { tmpDir } from "./helpers.ts";

const SKILL = "---\nname: demo\ndescription: Use when demoing. Shows things.\n---\n\n## Procedure\n1. Do it.\n";

describe("SkillStore", () => {
  it("creates, lists, views and patches", () => {
    const s = new SkillStore(tmpDir());
    s.manage({ action: "create", name: "demo", content: SKILL });
    expect(s.list()).toEqual([{ name: "demo", description: "Use when demoing. Shows things." }]);
    expect(s.view("demo")).toContain("Do it.");
    s.manage({ action: "patch", name: "demo", old_string: "Do it.", new_string: "Do it well." });
    expect(s.view("demo")).toContain("Do it well.");
    expect(s.index()).toContain("- demo: Use when demoing");
  });
  it("rejects bad names, path escapes and missing descriptions", () => {
    const s = new SkillStore(tmpDir());
    expect(() => s.manage({ action: "create", name: "../evil", content: SKILL })).toThrow();
    expect(() => s.manage({ action: "create", name: "ok", content: "no front matter" })).toThrow(/description/);
    s.manage({ action: "create", name: "demo", content: SKILL });
    expect(() => s.view("demo", "../../etc/passwd")).toThrow(/escapes/);
    expect(() => s.manage({ action: "create", name: "demo", content: SKILL })).toThrow(/exists/);
  });
  it("archives instead of deleting", () => {
    const s = new SkillStore(tmpDir());
    s.manage({ action: "create", name: "demo", content: SKILL });
    s.manage({ action: "write_file", name: "demo", file_path: "references/a.md", file_content: "x" });
    expect(s.files("demo")).toContain("references/a.md");
    s.manage({ action: "delete", name: "demo" });
    expect(s.list()).toEqual([]);
  });
});
