import { describe, expect, it } from "vitest";
import { summarizeRun } from "../src/components/tool/run-summary.tsx";
import { diffFromEdit, diffStats, unifiedDiff } from "../src/lib/diff.ts";
import { toolView } from "../src/lib/tool-map.ts";

const done = (name: string, args: unknown) => ({ name, args, ok: true });

describe("summarizeRun", () => {
  it("folds calls by category in a fixed order, later clauses lowercased", () => {
    const items = [
      done("view", { path: "a.ts" }), done("view", { path: "b.ts" }), done("view", { path: "c.ts" }),
      done("bash", { command: "ls" }), done("bash", { command: "pwd" }), done("bash", { command: "date" }), done("bash", { command: "uname" }), done("bash", { command: "id" }),
    ];
    expect(summarizeRun(items)).toBe("Explored 3 files, ran 5 commands");
  });
  it("a single call names its target, and a search is quoted", () => {
    expect(summarizeRun([done("view", { path: "wiring.tsx" })])).toBe("Explored wiring.tsx");
    expect(summarizeRun([done("grep", { pattern: "tool" })])).toBe("Searched “tool”");
  });
  it("speaks in the present tense for a category that is still running", () => {
    expect(summarizeRun([done("view", { path: "a" }), done("view", { path: "b" }), { name: "bash", args: { command: "x" } }])).toBe("Explored 2 files, running x");
    expect(summarizeRun([{ name: "bash", args: {} }, { name: "bash", args: {} }])).toBe("Running 2 commands");
  });
  it("unknown tools count as tools", () => {
    expect(summarizeRun([done("mystery", {}), done("other_thing", {})])).toBe("Used 2 tools");
  });
});

describe("toolView", () => {
  it("maps Copilot built-ins to verb phrases, and falls back to 'Used tool'", () => {
    expect(toolView("bash", { command: "npm test" }, false)).toEqual({ category: "run", title: "Ran command", target: "npm test" });
    expect(toolView("bash", {}, true).title).toBe("Running command");
    expect(toolView("edit", { path: "a.ts" }, false).title).toBe("Edited file");
    expect(toolView("web_fetch", { url: "https://x.test" }, false).title).toBe("Read webpage");
    expect(toolView("who_knows", {}, false)).toEqual({ category: "other", title: "Used tool", target: "" });
    expect(toolView("who_knows", {}, true).title).toBe("Using tool");
  });
});

describe("diffs", () => {
  it("changes one line and reports the stats", () => {
    const diff = diffFromEdit({ path: "a.txt", old_str: "one\ntwo\nthree", new_str: "one\n2\nthree" });
    expect(diff?.split("\n")).toEqual(["--- a.txt", "+++ a.txt", " one", "-two", "+2", " three"]);
    expect(diffStats(diff ?? "")).toEqual({ added: 1, removed: 1 });
  });
  it("a new file is all additions; a call with no text has no diff", () => {
    expect(diffStats(diffFromEdit({ path: "n.md", content: "a\nb" }) ?? "")).toEqual({ added: 2, removed: 0 });
    expect(diffFromEdit({ path: "x" })).toBeUndefined();
    expect(diffFromEdit("nope")).toBeUndefined();
  });
  it("leaves out unchanged lines far from a change and marks the gap", () => {
    const old = Array.from({ length: 20 }, (_, i) => `line ${i}`);
    const neu = old.slice();
    neu[2] = "changed";
    neu[15] = "changed too";
    const lines = unifiedDiff("f", old.join("\n"), neu.join("\n")).split("\n");
    expect(lines.filter((l) => l === "@@")).toHaveLength(1);
    expect(lines).not.toContain(" line 8");
    expect(lines).toContain(" line 13");
  });
});
