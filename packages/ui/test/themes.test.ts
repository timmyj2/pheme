import { describe, expect, it } from "vitest";
import { adjustPalette } from "../src/themes/contrast.ts";
import { BOOT_KEY, DEFAULT_THEME, applyTheme, THEMES, parseTheme, pickPalette, themeValue } from "../src/themes/presets.ts";

describe("themes", () => {
  it("ships the full Hermes set under Pheme names", () => {
    expect(THEMES.map((t) => t.name).sort()).toEqual(["catppuccin", "cyberpunk", "ember", "everforest", "github", "midnight", "mono", "pheme", "pheme-alt", "pheme-gold", "slate", "solarized"]);
    expect(THEMES[0].name).toBe("pheme-gold");
    expect(DEFAULT_THEME.name).toBe("pheme-gold");
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
    expect(parseTheme("dark")).toMatchObject({ mode: "dark", theme: { name: "pheme-gold" } });
    expect(parseTheme("light")).toMatchObject({ mode: "light", theme: { name: "pheme-gold" } });
    expect(parseTheme("system")).toMatchObject({ mode: "system", theme: { name: "pheme-gold" } });
    expect(parseTheme("pheme-dark")).toMatchObject({ mode: "dark", theme: { name: "pheme" } });
    expect(parseTheme("pheme-gold-dark")).toMatchObject({ mode: "dark", theme: { name: "pheme-gold" } });
    expect(parseTheme("nonsense-dark").theme.name).toBe("pheme-gold");
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
  it("pheme-gold is gold on navy", () => {
    const d = THEMES.find((t) => t.name === "pheme-gold")!.dark!;
    expect(d.background.toLowerCase()).toBe("#1a1a2e");
    expect(d.primary.toLowerCase()).toBe("#ffbf00");
  });
  it("applyTheme writes the full seed chain and the old component tokens", () => {
    applyTheme("pheme-gold-dark");
    const root = document.documentElement;
    for (const k of ["--theme-foreground", "--theme-primary", "--theme-background-seed", "--theme-sidebar-seed", "--theme-card-seed", "--theme-elevated-seed", "--theme-bubble-seed", "--theme-midground", "--theme-mix-chrome", "--dt-border", "--dt-primary-text", "--dt-destructive-text", "--dt-primary-solid"]) {
      expect(root.style.getPropertyValue(k), k).not.toBe("");
    }
    expect(root.classList.contains("dark")).toBe(true);
    expect(root.style.getPropertyValue("--theme-background-seed")).toBe("#1a1a2e");
    const boot = JSON.parse(localStorage.getItem(BOOT_KEY)!);
    expect(boot.dark).toBe(true);
    expect(boot.vars["--theme-primary"]).toBe("#FFBF00");
    // Every theme applies without throwing, in each mode it has.
    for (const t of THEMES) for (const m of ["light", "dark"] as const) if (t[m]) expect(() => applyTheme(`${t.name}-${m}`)).not.toThrow();
  });
});
