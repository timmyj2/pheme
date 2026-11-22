import { describe, expect, it } from "vitest";
import { THEMES, parseTheme } from "../src/themes/presets.ts";

describe("theme parsing", () => {
  it("understands name-mode, bare modes and unknown values", () => {
    expect(parseTheme("github-light")).toMatchObject({ mode: "light", theme: { name: "github" } });
    expect(parseTheme("dark")).toMatchObject({ mode: "dark", theme: { name: "pheme" } });
    expect(parseTheme("system").mode).toBe("system");
    expect(parseTheme("nonsense-dark").theme.name).toBe(THEMES[0].name);
  });
  it("no theme carries upstream branding", () => {
    expect(JSON.stringify(THEMES).toLowerCase()).not.toMatch(/nous|hermes/);
  });
});
