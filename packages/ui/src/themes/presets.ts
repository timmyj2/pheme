/**
 * Theme palettes. The token names (--dt-*) and the "GitHub chrome + one accent" structure follow the
 * MIT-licensed hermes-agent desktop theme model (see THIRD_PARTY_NOTICES.md); the accent family
 * here is Pheme's own name for the same blue.
 */

export interface Palette {
  background: string; foreground: string; card: string; cardForeground: string; muted: string; mutedForeground: string;
  popover: string; primary: string; primaryForeground: string; secondary: string; accent: string; border: string;
  input: string; ring: string; destructive: string; destructiveForeground: string; sidebar: string; sidebarBorder: string;
  userBubble: string; userBubbleBorder: string;
  /** The rest of the Hermes seed set: popover/secondary/accent text, the brand stroke (--theme-midground) and the composer outline. */
  popoverForeground: string; secondaryForeground: string; accentForeground: string; midground: string; composerRing: string;
  /** Derived by adjustPalette (not present on raw palettes): text-safe variants of destructive / primary. */
  destructiveText?: string; primaryText?: string;
}

export interface Theme { name: string; label: string; light?: Palette; dark?: Palette }

// Font stacks live in tokens.css (--dt-font-sans / --dt-font-mono); these copies are for code that needs the strings.
const SYSTEM_SANS = '"Segoe WPC", "Segoe UI", -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"';
const SYSTEM_MONO = '"JetBrains Mono", "Cascadia Code", "Cascadia Mono", "DejaVu Sans Mono", "Liberation Mono", "Noto Sans Mono", "SF Mono", ui-monospace, Menlo, Consolas, monospace';
export const FONTS = { sans: SYSTEM_SANS, mono: SYSTEM_MONO };

import { GENERATED_THEMES } from "./generated.ts";
import { adjustPalette } from "./contrast.ts";
import { chromeBackground, mixesFor, primarySolid, readableInk } from "./color.ts";

/** Every theme has a light palette, a dark palette, or both (dark-only themes such as Midnight have just one). */
export const THEMES: Theme[] = GENERATED_THEMES;

/** The default theme: gold on navy. Bare modes ("dark", "light", "system") and unknown names resolve to it. */
export const DEFAULT_THEME = THEMES.find((t) => t.name === "pheme-gold") ?? THEMES[0];

export type Mode = "light" | "dark" | "system";

/** Settings.theme is "<name>-<mode>", "<name>" (system mode), or just a mode ("dark", "light", "system"). */
export function parseTheme(value: string): { theme: Theme; mode: Mode } {
  if (value === "dark" || value === "light" || value === "system") return { theme: DEFAULT_THEME, mode: value };
  const parts = value.split("-");
  const last = parts[parts.length - 1];
  const hasMode = last === "light" || last === "dark";
  const name = hasMode ? parts.slice(0, -1).join("-") : value;
  const theme = THEMES.find((t) => t.name === name) ?? DEFAULT_THEME;
  return { theme, mode: hasMode ? (last as Mode) : "system" };
}

/** Which palette to paint: the requested mode if the theme has it, otherwise the one it has. */
export function pickPalette(theme: Theme, mode: Mode, systemDark: boolean): { palette: Palette; dark: boolean } {
  const wantDark = mode === "dark" || (mode === "system" && systemDark);
  if (wantDark && theme.dark) return { palette: theme.dark, dark: true };
  if (!wantDark && theme.light) return { palette: theme.light, dark: false };
  return theme.dark ? { palette: theme.dark, dark: true } : { palette: theme.light!, dark: false };
}

export function themeValue(name: string, mode: Mode): string {
  return mode === "system" ? name : `${name}-${mode}`;
}

const adjustedCache = new Map<string, Palette>();

/** Contrast-adjusted palette for a (theme, mode), cached. THEMES itself stays raw. */
export function adjustedPalette(theme: Theme, dark: boolean, palette: Palette): Palette {
  const key = `${theme.name}:${dark ? "dark" : "light"}`;
  let adj = adjustedCache.get(key);
  if (!adj) { adj = adjustPalette(palette); adjustedCache.set(key, adj); }
  return adj;
}

export const BOOT_KEY = "pheme-theme-boot";

/** The seed variables (--theme-*) that feed the color-mix chain in tokens.css. */
export function seedVars(p: Palette): Record<string, string> {
  return {
    "--theme-foreground": p.foreground,
    "--theme-primary": p.primary,
    "--theme-secondary": p.secondary,
    "--theme-accent-soft": p.accent,
    "--theme-midground": p.midground,
    "--theme-warm": p.primary,
    "--theme-background-seed": p.background,
    "--theme-sidebar-seed": p.sidebar,
    "--theme-card-seed": p.card,
    "--theme-elevated-seed": p.popover,
    "--theme-bubble-seed": p.userBubble,
  };
}

/** Direct --dt-* tokens that are not derived from the seed chain. */
export function directVars(p: Palette & { destructiveText?: string; primaryText?: string }): Record<string, string> {
  return {
    "--dt-primary-foreground": p.primaryForeground,
    "--dt-secondary-foreground": p.secondaryForeground,
    "--dt-accent-foreground": p.accentForeground,
    "--dt-popover-foreground": p.popoverForeground,
    "--dt-card-foreground": p.cardForeground,
    "--dt-border": p.border,
    "--dt-input": p.input,
    "--dt-ring": p.ring,
    "--dt-muted": p.muted,
    "--dt-midground-foreground": readableInk(p.midground),
    "--dt-primary-solid": primarySolid(p.primary),
    "--dt-composer-ring": p.composerRing,
    "--dt-destructive": p.destructive,
    "--dt-destructive-foreground": p.destructiveForeground,
    "--dt-sidebar-border": p.sidebarBorder,
    "--dt-user-bubble-border": p.userBubbleBorder,
    // Old component names: contrast-checked text variants of the fills.
    "--dt-primary-text": p.primaryText ?? p.primary,
    "--dt-destructive-text": p.destructiveText ?? p.destructive,
  };
}

export function applyTheme(value: string): void {
  const { theme, mode } = parseTheme(value);
  const picked = pickPalette(theme, mode, window.matchMedia("(prefers-color-scheme: dark)").matches);
  const { dark } = picked;
  const p = adjustedPalette(theme, dark, picked.palette);
  const root = document.documentElement;
  const vars = { ...seedVars(p), ...mixesFor(dark), ...directVars(p) };
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.dataset.pheme = theme.name;
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
  try {
    // The boot script (index.html) replays these before first paint. Keep it small: seeds, mixes, the dark flag.
    const chrome = chromeBackground(p.background, dark);
    localStorage.setItem(BOOT_KEY, JSON.stringify({ dark, bg: chrome, vars: { ...seedVars(p), ...mixesFor(dark), "--dt-border": p.border, "--dt-primary-foreground": p.primaryForeground } }));
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", chrome);
  } catch { /* localStorage can throw (private mode, quota) */ }
}
