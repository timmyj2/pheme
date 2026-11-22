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

export interface Theme { name: string; label: string; light: Palette; dark: Palette }

const SYSTEM_SANS = '"Segoe WPC", "Segoe UI", -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"';
const SYSTEM_MONO = '"JetBrains Mono", "Cascadia Code", "Cascadia Mono", "SF Mono", ui-monospace, Menlo, Consolas, monospace';
export const FONTS = { sans: SYSTEM_SANS, mono: SYSTEM_MONO };

const neutralLight = { background: "#ffffff", foreground: "#1f2328", card: "#f6f8fa", cardForeground: "#1f2328", muted: "#f6f6f6", mutedForeground: "#656d76", popover: "#ffffff", border: "#d0d7de", input: "#ffffff", destructive: "#cf222e", destructiveForeground: "#ffffff", sidebar: "#f6f8fa", sidebarBorder: "#d0d7de", primaryForeground: "#ffffff" };
const neutralDark = { background: "#0d1117", foreground: "#e6edf3", card: "#010409", cardForeground: "#e6edf3", muted: "#1a1e24", mutedForeground: "#7d8590", popover: "#161b22", border: "#30363d", input: "#0d1117", destructive: "#f85149", destructiveForeground: "#ffffff", sidebar: "#010409", sidebarBorder: "#30363d" };

export const THEMES: Theme[] = [
  {
    name: "pheme", label: "Pheme",
    light: { ...neutralLight, primary: "#0053fd", secondary: "#deeaff", accent: "#e3edff", ring: "#0053fd", userBubble: "#dae7fd", userBubbleBorder: "#d0d7de" },
    dark: { ...neutralDark, primary: "#4a84fe", primaryForeground: "#161616", secondary: "#1d2e4f", accent: "#17243a", ring: "#4a84fe", userBubble: "#07162c", userBubbleBorder: "#30363d" },
  },
  {
    name: "github", label: "GitHub",
    light: { ...neutralLight, primary: "#196d31", secondary: "#dfebe2", accent: "#e3ede6", ring: "#196d31", userBubble: "#dbe7e2", userBubbleBorder: "#d0d7de" },
    dark: { ...neutralDark, primary: "#4f9e5e", primaryForeground: "#ffffff", secondary: "#1f382b", accent: "#192a24", ring: "#4f9e5e", userBubble: "#0f2018", userBubbleBorder: "#30363d" },
  },
];

export type Mode = "light" | "dark" | "system";

/** Settings.theme is "<name>-<mode>", "<name>" (system mode), or just a mode. */
export function parseTheme(value: string): { theme: Theme; mode: Mode } {
  const parts = value.split("-");
  const last = parts[parts.length - 1];
  const mode: Mode = last === "light" || last === "dark" ? last : "system";
  const name = last === "light" || last === "dark" ? parts.slice(0, -1).join("-") : value;
  const theme = THEMES.find((t) => t.name === name) ?? THEMES[0];
  return { theme, mode: value === "dark" || value === "light" || value === "system" ? (value as Mode) : mode };
}

export function applyTheme(value: string): void {
  const { theme, mode } = parseTheme(value);
  const dark = mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const p = dark ? theme.dark : theme.light;
  const root = document.documentElement;
  const set = (k: string, v: string) => root.style.setProperty(`--dt-${k}`, v);
  (Object.keys(p) as (keyof Palette)[]).forEach((k) => set(k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase()), p[k]));
  root.style.setProperty("--dt-font-sans", FONTS.sans);
  root.style.setProperty("--dt-font-mono", FONTS.mono);
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
}
