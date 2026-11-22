import { describe, expect, it } from "vitest";
import { titleFrom } from "../src/app.ts";

describe("titleFrom", () => {
  it("uses the first real line and strips markdown", () => {
    expect(titleFrom("# Heading\n\nSome **bold** text")).toBe("Heading");
    expect(titleFrom("\n\n   > quoted line\nmore")).toBe("quoted line");
    expect(titleFrom("- [a link](http://x.y) here")).toBe("a link here");
    expect(titleFrom("```js\nconst x = 1\n```")).toBe("const x = 1");
    expect(titleFrom("1. first step")).toBe("first step");
  });
  it("cuts long text on a word with an ellipsis", () => {
    const t = titleFrom("word ".repeat(40));
    expect(t.length).toBeLessThanOrEqual(61);
    expect(t.endsWith("…")).toBe(true);
    expect(titleFrom("x".repeat(200)).length).toBeLessThanOrEqual(61);
  });
  it("falls back for empty or symbol-only text and keeps non-Latin scripts", () => {
    expect(titleFrom("")).toBe("New chat");
    expect(titleFrom("*** --- ###")).toBe("New chat");
    expect(titleFrom("日本語のメッセージ")).toBe("日本語のメッセージ");
    expect(titleFrom("<img src=x onerror=alert(1)>")).toContain("img");
  });
});
