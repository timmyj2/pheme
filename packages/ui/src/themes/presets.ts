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
}

export interface Theme { name: string; label: string; light?: Palette; dark?: Palette }

const SYSTEM_SANS = '"Segoe WPC", "Segoe UI", -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"';
const SYSTEM_MONO = '"JetBrains Mono", "Cascadia Code", "Cascadia Mono", "SF Mono", ui-monospace, Menlo, Consolas, monospace';
export const FONTS = { sans: SYSTEM_SANS, mono: SYSTEM_MONO };

import { GENERATED_THEMES } from "./generated.ts";

/** Every theme has a light palette, a dark palette, or both (dark-only themes such as Midnight have just one). */
export const THEMES: Theme[] = GENERATED_THEMES;

export type Mode = "light" | "dark" | "system";

/** Settings.theme is "<name>-<mode>", "<name>" (system mode), or just a mode ("dark", "light", "system"). */
export function parseTheme(value: string): { theme: Theme; mode: Mode } {
  if (value === "dark" || value === "light" || value === "system") return { theme: THEMES[0], mode: value };
  const parts = value.split("-");
  const last = parts[parts.length - 1];
  const hasMode = last === "light" || last === "dark";
  const name = hasMode ? parts.slice(0, -1).join("-") : value;
  const theme = THEMES.find((t) => t.name === name) ?? THEMES[0];
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

export function applyTheme(value: string): void {
  const { theme, mode } = parseTheme(value);
  const { palette: p, dark } = pickPalette(theme, mode, window.matchMedia("(prefers-color-scheme: dark)").matches);
  const root = document.documentElement;
  const set = (k: string, v: string) => root.style.setProperty(`--dt-${k}`, v);
  (Object.keys(p) as (keyof Palette)[]).forEach((k) => set(k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase()), p[k]));
  root.style.setProperty("--dt-font-sans", FONTS.sans);
  root.style.setProperty("--dt-font-mono", FONTS.mono);
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
}
