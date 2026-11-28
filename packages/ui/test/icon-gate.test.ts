// Grep gate: UI components draw icons with Codicons or Tabler, never with emoji or symbol characters.
// Keyboard key labels (⌘ ⌥ ⇧ ↑) and text arrows (→) are not icons and stay allowed.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// npm test runs from the repository root.
const SRC = resolve(process.cwd(), "packages/ui/src");

// Emoji and pictographs, dingbats (✓ ✗ ✕ ⚠), geometric shapes (● ▴ ▾ ▸), keyboard (⌨), branch (⎇), menu (☰), refresh (↻).
const ICON_GLYPH = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{25A0}-\u{25FF}\u{2328}\u{2387}\u{21BB}]/u;

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsxFiles(path);
    return name.endsWith(".tsx") ? [path] : [];
  });
}

describe("icon gate", () => {
  it("recognises the glyphs it bans and not the key labels it allows", () => {
    expect(ICON_GLYPH.test("📁")).toBe(true);
    expect(ICON_GLYPH.test("✓")).toBe(true);
    expect(ICON_GLYPH.test("⌘⌥⇧↑→")).toBe(false);
  });

  it("no emoji or symbol icon characters in packages/ui/src/**/*.tsx", () => {
    const offenders: string[] = [];
    for (const file of tsxFiles(SRC)) {
      readFileSync(file, "utf8").split("\n").forEach((line, i) => {
        const hit = ICON_GLYPH.exec(line);
        if (hit) offenders.push(`${relative(SRC, file)}:${i + 1} uses U+${hit[0].codePointAt(0)!.toString(16).toUpperCase()}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
