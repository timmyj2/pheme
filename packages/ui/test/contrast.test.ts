import { describe, expect, it, vi } from "vitest";
import { adjustPalette, contrastRatio, ensureContrast, parseColor, toHex } from "../src/themes/contrast.ts";
import { THEMES, applyTheme, type Palette } from "../src/themes/presets.ts";

const rgb = (css: string, over?: { r: number; g: number; b: number }) => {
  const c = parseColor(css, over);
  if (!c) throw new Error(`unparseable: ${css}`);
  return c;
};

const modes = THEMES.flatMap((t) =>
  (["light", "dark"] as const).filter((m) => t[m]).map((m) => ({ id: `${t.name}-${m}`, theme: t.name, mode: m, raw: t[m]! })),
);

describe("parseColor", () => {
  it("parses hex, rgb, hsl and transparent", () => {
    expect(parseColor("#fff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseColor("#0053FD")).toEqual({ r: 0, g: 83, b: 253 });
    expect(parseColor("#00000080", { r: 255, g: 255, b: 255 })).toEqual({ r: 127, g: 127, b: 127 });
    expect(parseColor("rgb(10, 20, 30)")).toEqual({ r: 10, g: 20, b: 30 });
    expect(parseColor("rgba(0 0 0 / 50%)", { r: 255, g: 255, b: 255 })).toEqual({ r: 128, g: 128, b: 128 });
    expect(parseColor("hsl(0, 100%, 50%)")).toEqual({ r: 255, g: 0, b: 0 });
    expect(parseColor("transparent", { r: 1, g: 2, b: 3 })).toEqual({ r: 1, g: 2, b: 3 });
    expect(parseColor("nonsense")).toBeNull();
  });
  it("parses color-mix, including transparency and nesting", () => {
    expect(parseColor("color-mix(in srgb, #ffffff 50%, #000000)")).toEqual({ r: 128, g: 128, b: 128 });
    expect(parseColor("color-mix(in srgb, #ffffff, #000000 25%)")).toEqual({ r: 191, g: 191, b: 191 });
    expect(parseColor("color-mix(in srgb, #0053FD 5%, #FFFFFF)")).toEqual({ r: 242, g: 246, b: 255 });
    // 22% of blue over a white page
    expect(parseColor("color-mix(in srgb, #0053FD 22%, transparent)", { r: 255, g: 255, b: 255 })).toEqual({ r: 199, g: 217, b: 255 });
    // over default black it is a dark tint
    expect(parseColor("color-mix(in srgb, #0053FD 22%, transparent)")).toEqual({ r: 0, g: 18, b: 56 });
    expect(parseColor("color-mix(in srgb, color-mix(in srgb, #fff, #000) 50%, #000)")).toEqual({ r: 64, g: 64, b: 64 });
  });
});

describe("contrastRatio / ensureContrast", () => {
  const white = { r: 255, g: 255, b: 255 }, black = { r: 0, g: 0, b: 0 };
  it("matches WCAG reference values", () => {
    expect(contrastRatio(black, white)).toBeCloseTo(21, 5);
    expect(contrastRatio(white, white)).toBeCloseTo(1, 5);
    expect(contrastRatio(rgb("#777"), white)).toBeCloseTo(4.48, 2);
  });
  it("leaves compliant colors untouched", () => {
    const c = rgb("#595959");
    expect(ensureContrast(c, white, 4.5)).toBe(c);
  });
  it("nudges minimally, keeps hue direction, and reaches the target", () => {
    const fg = rgb("#777");
    const out = ensureContrast(fg, white, 4.5);
    expect(contrastRatio(out, white)).toBeGreaterThanOrEqual(4.5);
    expect(out.g).toBeLessThan(fg.g); // went darker on a light background
    expect(contrastRatio(out, white)).toBeLessThan(4.7); // ...but only a little
    const blue = ensureContrast(rgb("#3366ff"), rgb("#0d1117"), 7);
    expect(contrastRatio(blue, rgb("#0d1117"))).toBeGreaterThanOrEqual(7);
    expect(blue.b).toBeGreaterThan(blue.r); // still blue
  });
  it("goes the other way when only that direction can reach the target", () => {
    const out = ensureContrast(rgb("#808080"), rgb("#777777"), 4.5);
    expect(contrastRatio(out, rgb("#777777"))).toBeGreaterThanOrEqual(4.5);
  });
  it("falls back to black or white when unreachable otherwise", () => {
    expect(ensureContrast(rgb("#888"), rgb("#888"), 21)).toEqual(black); // black beats white against mid-gray
    expect(toHex({ r: 1, g: 2, b: 255 })).toBe("#0102ff");
  });
});

describe("adjustPalette", () => {
  it("covers every theme and mode", () => {
    expect(modes.length).toBeGreaterThanOrEqual(THEMES.length);
  });

  describe.each(modes)("$id", ({ raw }) => {
    const p = adjustPalette(raw);
    const bg = rgb(p.background);
    const c = (k: keyof Palette) => rgb(p[k]!, bg);
    const ratio = (a: keyof Palette, b: keyof Palette) => contrastRatio(c(a), c(b));

    it("secondary text >= 4.5 on background, sidebar, muted", () => {
      for (const s of ["background", "sidebar", "muted"] as const) expect(ratio("mutedForeground", s)).toBeGreaterThanOrEqual(4.5);
    });
    it("foreground >= 4.5 on background, sidebar, muted, accent, userBubble", () => {
      for (const s of ["background", "sidebar", "muted", "accent", "userBubble"] as const) expect(ratio("foreground", s)).toBeGreaterThanOrEqual(4.5);
    });
    it("primary button text >= 4.5", () => expect(ratio("primaryForeground", "primary")).toBeGreaterThanOrEqual(4.5));
    it("destructiveText and primaryText >= 4.5 on background, as hex", () => {
      expect(ratio("destructiveText", "background")).toBeGreaterThanOrEqual(4.5);
      expect(ratio("primaryText", "background")).toBeGreaterThanOrEqual(4.5);
      expect(p.destructiveText).toMatch(/^#[0-9a-f]{6}$/);
      expect(p.primaryText).toMatch(/^#[0-9a-f]{6}$/);
    });
    it("focus ring >= 3 on background", () => expect(ratio("ring", "background")).toBeGreaterThanOrEqual(3));
    it("borders >= 1.3 against background", () => {
      expect(ratio("border", "background")).toBeGreaterThanOrEqual(1.3);
      expect(ratio("sidebarBorder", "background")).toBeGreaterThanOrEqual(1.3);
    });
    it("keeps the fill colors unchanged", () => {
      for (const k of ["destructive", "primary", "background", "muted", "accent", "sidebar", "userBubble"] as const) expect(p[k]).toBe(raw[k]);
    });
    it("does not mutate its input and is idempotent", () => {
      const snapshot = JSON.stringify(raw);
      const once = adjustPalette(raw);
      expect(JSON.stringify(raw)).toBe(snapshot);
      expect(once).not.toBe(raw);
      expect(adjustPalette(once)).toEqual(once);
    });
    it("changes a reasonable number of tokens", () => {
      const changed = (Object.keys(raw) as (keyof Palette)[]).filter((k) => p[k] !== raw[k]);
      expect(changed.length).toBeLessThanOrEqual(7);
    });
  });

  it("leaves the pheme theme alone apart from the two new tokens", () => {
    const pheme = THEMES.find((t) => t.name === "pheme")!;
    const split = (raw: Palette) => {
      const { destructiveText, primaryText, ...rest } = adjustPalette(raw);
      expect(destructiveText).toBeDefined();
      expect(primaryText).toBeDefined();
      return rest;
    };
    expect(split(pheme.light!)).toEqual(pheme.light);
    // pheme-dark's secondary text is 4.49:1 on the muted block (just under AA), so exactly that one token moves by a hair.
    const dark = split(pheme.dark!);
    expect({ ...dark, mutedForeground: pheme.dark!.mutedForeground }).toEqual(pheme.dark);
    expect(contrastRatio(rgb(dark.mutedForeground), rgb(pheme.dark!.mutedForeground))).toBeLessThan(1.05);
  });
});

describe("applyTheme", () => {
  it("writes adjusted tokens, keeps THEMES raw, and persists the boot colors", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
    const before = JSON.stringify(THEMES);
    applyTheme("solarized-dark");
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--dt-destructive-text")).toMatch(/^#[0-9a-f]{6}$/);
    expect(root.style.getPropertyValue("--dt-primary-text")).toMatch(/^#[0-9a-f]{6}$/);
    expect(root.classList.contains("dark")).toBe(true);
    const boot = JSON.parse(localStorage.getItem("pheme-theme-boot")!);
    expect(boot).toEqual({ bg: root.style.getPropertyValue("--dt-background"), fg: root.style.getPropertyValue("--dt-foreground"), dark: true });
    expect(JSON.stringify(THEMES)).toBe(before);
    vi.unstubAllGlobals();
  });
  it("survives a throwing localStorage", () => {
    vi.stubGlobal("localStorage", { setItem: () => { throw new Error("denied"); } });
    expect(() => applyTheme("github-light")).not.toThrow();
    vi.unstubAllGlobals();
  });
});
