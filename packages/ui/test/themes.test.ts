import { describe, expect, it } from "vitest";
import { adjustPalette } from "../src/themes/contrast.ts";
import { THEMES, parseTheme, pickPalette, themeValue } from "../src/themes/presets.ts";

describe("themes", () => {
  it("ships the full Hermes set under Pheme names", () => {
    expect(THEMES.map((t) => t.name).sort()).toEqual(["catppuccin", "cyberpunk", "ember", "everforest", "github", "midnight", "mono", "pheme", "pheme-alt", "slate", "solarized"]);
    expect(THEMES[0].name).toBe("pheme");
  });
  it("every palette has every token", () => {
    const keys = Object.keys(THEMES[0].dark!).sort();
    expect(keys).not.toContain("destructiveText");
    for (const t of THEMES) for (const p of [t.light, t.dark]) if (p) {
      expect(Object.keys(p).sort()).toEqual(keys); // raw palettes: no derived tokens
      expect(Object.keys(adjustPalette(p)).sort()).toEqual([...keys, "destructiveText", "primaryText"].sort());
    }
  });
  it("no theme carries upstream branding", () => {
    expect(JSON.stringify(THEMES).toLowerCase()).not.toMatch(/nous|hermes/);
  });
  it("parses values, including hyphenated names", () => {
    expect(parseTheme("github-light")).toMatchObject({ mode: "light", theme: { name: "github" } });
    expect(parseTheme("pheme-alt-dark")).toMatchObject({ mode: "dark", theme: { name: "pheme-alt" } });
    expect(parseTheme("midnight")).toMatchObject({ mode: "system", theme: { name: "midnight" } });
    expect(parseTheme("dark")).toMatchObject({ mode: "dark", theme: { name: "pheme" } });
    expect(parseTheme("nonsense-dark").theme.name).toBe("pheme");
    expect(themeValue("slate", "system")).toBe("slate");
    expect(themeValue("github", "light")).toBe("github-light");
  });
  it("single-mode themes fall back to the palette they have", () => {
    const midnight = THEMES.find((t) => t.name === "midnight")!;
    expect(pickPalette(midnight, "light", false).dark).toBe(true);
    const github = THEMES.find((t) => t.name === "github")!;
    expect(pickPalette(github, "system", true).dark).toBe(true);
    expect(pickPalette(github, "system", false).dark).toBe(false);
  });
});
