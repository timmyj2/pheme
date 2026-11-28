// One-off generator: converts the MIT-licensed hermes-agent preset table into Pheme's palette file.
// Adapted from hermes-agent (MIT, Copyright (c) 2025 Nous Research): apps/shared/src/theme-presets.ts, apps/shared/src/color.ts,
// apps/desktop/src/themes/skin.ts and apps/desktop/src/themes/presets.ts (the "classic" gold-on-navy skin) @ 5688461d.
// Usage: node scripts/gen-themes.mjs <path to apps/shared/src/theme-presets.ts>
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { transformSync } from "esbuild";

const src = process.argv[2];
const here = path.dirname(fileURLToPath(import.meta.url));
const js = transformSync(fs.readFileSync(src, "utf8"), { loader: "ts", format: "esm" }).code;
const tmp = path.join(here, ".presets.tmp.mjs");
fs.writeFileSync(tmp, js);
const { THEME_PRESET_PALETTES } = await import(tmp);
fs.rmSync(tmp);

const RENAME = { nous: "pheme", "nous-alt": "pheme-alt" };
const LABEL = { "pheme-gold": "Pheme Gold", pheme: "Pheme", "pheme-alt": "Pheme Alt", github: "GitHub", catppuccin: "Catppuccin", everforest: "Everforest", solarized: "Solarized", midnight: "Midnight", ember: "Ember", mono: "Mono", cyberpunk: "Cyberpunk", slate: "Slate" };
const pal = (c) => ({
  background: c.background, foreground: c.foreground, card: c.card, cardForeground: c.cardForeground, muted: c.muted, mutedForeground: c.mutedForeground,
  popover: c.popover, primary: c.primary, primaryForeground: c.primaryForeground, secondary: c.secondary, accent: c.accent, border: c.border, input: c.input,
  ring: c.midground ?? c.ring, destructive: c.destructive, destructiveForeground: c.destructiveForeground,
  sidebar: c.sidebarBackground ?? c.card, sidebarBorder: c.sidebarBorder ?? c.border, userBubble: c.userBubble ?? c.accent, userBubbleBorder: c.userBubbleBorder ?? c.border,
  // The rest of the seed set (applyTheme writes each one as a --theme-* seed or a direct --dt-* token).
  popoverForeground: c.popoverForeground ?? c.cardForeground, secondaryForeground: c.secondaryForeground ?? c.foreground, accentForeground: c.accentForeground ?? c.foreground,
  midground: c.midground ?? c.ring, composerRing: c.composerRing ?? c.midground ?? c.ring,
});

// ---- sRGB helpers (from apps/shared/src/color.ts) and the skin converter (from apps/desktop/src/themes/skin.ts) ----
const hexRgb = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(h.trim()); if (!m) return null; const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const toHex = (rgb) => "#" + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
const mix = (a, b, t) => { const x = hexRgb(a), y = hexRgb(b); return x && y ? toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]) : a; };
const chan = (v) => { const n = v / 255; return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4; };
const lum = (c) => { const r = hexRgb(c); return r ? 0.2126 * chan(r[0]) + 0.7152 * chan(r[1]) + 0.0722 * chan(r[2]) : null; };
const ratio = (a, b) => { const x = lum(a), y = lum(b); if (x === null || y === null) return null; return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const readableInk = (bg) => ((ratio(bg, "#161616") ?? 0) > (ratio(bg, "#ffffff") ?? 0) ? "#161616" : "#ffffff");
const ensureContrast = (color, bg, min) => {
  const r = ratio(color, bg);
  if (r === null || r >= min) return color;
  const pole = lum(bg) < 0.5 ? "#ffffff" : "#000000";
  let best = color;
  for (let t = 0.2; t <= 1.0001; t += 0.2) { best = mix(color, pole, Math.min(t, 1)); if ((ratio(best, bg) ?? 0) >= min) return best; }
  return best;
};
/** A CLI-style skin (status_bar_bg, banner_text, ui_accent ...) to a Pheme palette. Mirrors skinToDesktopTheme. */
function skinPalette(skin) {
  const background = skin.status_bar_bg, foreground = skin.banner_text;
  const naive = hexRgb(background).reduce((a, v, i) => a + (v / 255) * [0.2126, 0.7152, 0.0722][i], 0);
  const dark = naive < 0.4; // the original's naive light/dark bucket
  const sidebar = mix(background, foreground, dark ? 0.02 : 0.012);
  const accent = ensureContrast(skin.ui_accent, sidebar, 4.5);
  const border = skin.ui_border ?? mix(background, foreground, dark ? 0.16 : 0.14);
  const destructive = skin.ui_error;
  return {
    background, foreground, card: mix(background, foreground, dark ? 0.04 : 0.025), cardForeground: foreground,
    muted: mix(background, foreground, dark ? 0.06 : 0.04), mutedForeground: skin.banner_dim ?? mix(foreground, background, 0.45),
    popover: mix(background, foreground, dark ? 0.08 : 0.05), primary: accent, primaryForeground: readableInk(accent),
    secondary: mix(accent, background, dark ? 0.72 : 0.86), accent: mix(accent, background, dark ? 0.82 : 0.88), border,
    input: skin.completion_menu_bg ?? mix(background, foreground, dark ? 0.1 : 0.06), ring: accent, destructive, destructiveForeground: readableInk(destructive),
    sidebar, sidebarBorder: border, userBubble: mix(background, accent, dark ? 0.18 : 0.12), userBubbleBorder: border,
    popoverForeground: foreground, secondaryForeground: foreground, accentForeground: foreground, midground: accent, composerRing: accent,
  };
}
const isDark = (hex) => /^#[0-9a-f]{6}$/i.test(hex) && (parseInt(hex.slice(1, 3), 16) * 299 + parseInt(hex.slice(3, 5), 16) * 587 + parseInt(hex.slice(5, 7), 16) * 114) / 1000 < 128;
const out = [];
for (const [key, v] of Object.entries(THEME_PRESET_PALETTES)) {
  const name = RENAME[key] ?? key;
  const t = { name, label: LABEL[name] ?? name };
  if (v.darkColors) { t.light = pal(v.colors); t.dark = pal(v.darkColors); }
  else if (isDark(v.colors.background)) t.dark = pal(v.colors);
  else t.light = pal(v.colors);
  out.push(t);
}
// Pheme Gold: the CLI's stock gold-on-navy skin ("classic" in the upstream source), under a Pheme name. It matches the reference screenshots.
// Its border is the converter's own mix (not the skin's bronze banner border): the owner's screenshots show a quiet grey-violet hairline.
out.push({
  name: "pheme-gold", label: "Pheme Gold",
  light: skinPalette({ status_bar_bg: "#F5F5F5", banner_text: "#2B2109", ui_accent: "#D89B04", banner_dim: "#B8860B", ui_error: "#C62828", completion_menu_bg: "#F5F5F5" }),
  dark: skinPalette({ status_bar_bg: "#1a1a2e", banner_text: "#FFF8DC", ui_accent: "#FFBF00", banner_dim: "#B8860B", ui_error: "#ef5350", completion_menu_bg: "#1a1a2e" }),
});
// Pheme Gold first (the default), then Pheme, then the rest alphabetically.
const ORDER = ["pheme-gold", "pheme"];
out.sort((a, b) => { const ia = ORDER.indexOf(a.name), ib = ORDER.indexOf(b.name); return ia >= 0 || ib >= 0 ? (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) : a.label.localeCompare(b.label); });
// Desktop screenshots use a gold accent, not the blue Nous preset. Re-apply after a regen.
const pheme = out.find((t) => t.name === "pheme");
if (pheme?.dark) { pheme.dark.primary = "#f7bb2d"; pheme.dark.ring = "#f7bb2d"; pheme.dark.midground = "#f7bb2d"; pheme.dark.composerRing = "#f7bb2d"; pheme.dark.primaryForeground = "#161616"; pheme.dark.sidebar = "#1a1a24"; }
if (pheme?.light) { pheme.light.primary = "#9a6800"; pheme.light.ring = "#9a6800"; pheme.light.midground = "#9a6800"; pheme.light.composerRing = "#9a6800"; pheme.light.primaryForeground = "#ffffff"; }
const text = `// GENERATED by scripts/gen-themes.mjs from the MIT-licensed hermes-agent theme presets (see THIRD_PARTY_NOTICES.md).
// Nous-branded presets are renamed (nous -> pheme, nous-alt -> pheme-alt); pheme-gold is built from the stock gold-on-navy skin. Do not edit by hand.
import type { Theme } from "./presets.ts";

export const GENERATED_THEMES: Theme[] = ${JSON.stringify(out, null, 2)};
`;
fs.writeFileSync(path.join(here, "..", "packages/ui/src/themes/generated.ts"), text);
console.log(out.map((t) => `${t.name}:${t.light ? "L" : ""}${t.dark ? "D" : ""}`).join(" "));
