// Adapted from hermes-agent (MIT, Copyright (c) 2025 Nous Research), apps/desktop/src/themes/context.tsx and apps/shared/src/color.ts @ 5688461d
// (the per-mode mix knobs, the chrome background used for the boot paint, readableInk). The OKLCH, VS Code and skin
// helpers are not ported: Pheme has no backend skins or imported themes. The skin converter runs at build time in scripts/gen-themes.mjs.
import { contrastRatio, ensureContrast, parseColor, toHex, type RGB } from "./contrast.ts";

const NEUTRAL_CHROME = { light: "#f3f3f3", dark: "#0d0d0e" } as const;
/** The one foreground --dt-primary-solid is built to carry. */
export const PRIMARY_SOLID_FOREGROUND = "#fcfcfc";

/** sRGB lerp a -> b by t. Unparseable input returns `a` unchanged. */
export function mix(a: string, b: string, t: number): string {
  const x = parseColor(a), y = parseColor(b);
  if (!x || !y) return a;
  return toHex({ r: x.r + (y.r - x.r) * t, g: x.g + (y.g - x.g) * t, b: x.b + (y.b - x.b) * t });
}

/** The page colour behind everything, as --ui-bg-chrome computes it. Used for the boot paint and meta theme-color. */
export const chromeBackground = (background: string, dark: boolean) => mix(background, NEUTRAL_CHROME[dark ? "dark" : "light"], dark ? 0.26 : 0.08);

/** Per-mode mix knobs (tokens.css holds the same numbers as fallbacks; keep in sync). */
export const mixesFor = (dark: boolean): Record<string, string> => ({
  "--theme-mix-chrome": dark ? "74%" : "92%",
  "--theme-mix-sidebar": "100%",
  "--theme-mix-card": dark ? "38%" : "22%",
  "--theme-mix-elevated": dark ? "46%" : "28%",
  "--theme-mix-bubble": dark ? "46%" : "0%",
});

const INK_DARK: RGB = { r: 0x16, g: 0x16, b: 0x16 }, INK_LIGHT: RGB = { r: 255, g: 255, b: 255 };
/** #161616 or white, whichever reads better on `bg`. */
export function readableInk(bg: string): string {
  const c = parseColor(bg);
  if (!c) return "#ffffff";
  return contrastRatio(INK_DARK, c) > contrastRatio(INK_LIGHT, c) ? "#161616" : "#ffffff";
}

/** The accent deepened until a light foreground clears AA on it (a loud fill that stays the accent's hue). */
export function primarySolid(primary: string): string {
  const c = parseColor(primary), fg = parseColor(PRIMARY_SOLID_FOREGROUND);
  return c && fg ? toHex(ensureContrast(c, fg, 4.5)) : primary;
}
