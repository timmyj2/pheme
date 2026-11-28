import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// tokens.css is plain CSS on purpose. jsdom cannot resolve var() or color-mix(), so this reads the declarations the browser will
// compute from; e2e/tokens.spec.ts checks the real computed values in Chromium.
const css = fs.readFileSync(path.join(__dirname, "../src/tokens.css"), "utf8");
const decl = (selector: RegExp, prop: string) => new RegExp(`${selector.source}[^{]*\\{[^}]*?${prop}:\\s*([^;]+);`).exec(css)?.[1].trim();

describe("type metrics and tokens", () => {
  it("body is 13px with a 1.5 line height on a 16px root", () => {
    expect(decl(/:root/, "--dt-base-size")).toBe("1rem");
    expect(decl(/\n {2}html/, "font-size")).toContain("--dt-base-size");
    expect(decl(/\n {2}body/, "font-size")).toBe("0.8125rem"); // 0.8125 * 16 = 13px
    expect(decl(/:root/, "--dt-line-height")).toBe("1.5");
    expect(decl(/\n {2}body/, "line-height")).toContain("--dt-line-height");
    expect(decl(/\n {2}body/, "-webkit-font-smoothing")).toBe("antialiased");
  });
  it("radius scalar is 0.2 and chat text defaults to 110%", () => {
    expect(decl(/:root/, "--radius-scalar")).toBe("0.2");
    expect(decl(/:root/, "--chat-text-scale")).toBe("1.1");
  });
  it("mono font leads with the bundled JetBrains Mono", () => {
    expect(decl(/:root/, "--dt-font-mono")).toMatch(/^"JetBrains Mono"/);
    expect([...css.matchAll(/url\("\.\/fonts\/(JetBrainsMono-\w+\.woff2)"\)/g)].map((m) => m[1]).sort()).toEqual(["JetBrainsMono-Bold.woff2", "JetBrainsMono-Regular.woff2"]);
    for (const f of ["Regular", "Bold"]) expect(fs.statSync(path.join(__dirname, `../src/fonts/JetBrainsMono-${f}.woff2`)).size).toBeGreaterThan(50_000);
    expect(css).not.toMatch(/https?:\/\//);
  });
  it("keeps reduced-motion and reduced-transparency rules", () => {
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain("prefers-reduced-transparency: reduce");
  });
});
