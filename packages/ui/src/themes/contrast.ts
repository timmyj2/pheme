/**
 * Contrast safety for theme palettes. Pure and dependency-free (no DOM, no canvas), so it runs in node/jsdom.
 *
 * Lightness adjustments happen in OKLCH rather than HSL: OKLCH lightness tracks perceived lightness, so changing L
 * keeps hue and apparent chroma stable and gives the smallest visible change per unit of contrast gained
 * (HSL lightness shifts hue/brightness unevenly, especially for blues and yellows).
 */
import type { Palette } from "./presets.ts";

export interface RGB { r: number; g: number; b: number }
interface RGBA extends RGB { a: number }

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function splitArgs(s: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function num(s: string, pctScale: number): number {
  const t = s.trim();
  return t.endsWith("%") ? (parseFloat(t) / 100) * pctScale : parseFloat(t);
}

function hslToRgb(h: number, s: number, l: number): RGB {
  h = ((h % 360) + 360) % 360;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return { r: f(0) * 255, g: f(8) * 255, b: f(4) * 255 };
}

function parseRGBA(css: string): RGBA | null {
  const s = css.trim().toLowerCase();
  if (s === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  if (s.startsWith("#")) {
    const h = s.slice(1);
    if (!/^[0-9a-f]+$/.test(h)) return null;
    const full = h.length === 3 || h.length === 4 ? h.split("").map((c) => c + c).join("") : h;
    if (full.length !== 6 && full.length !== 8) return null;
    const v = (i: number) => parseInt(full.slice(i, i + 2), 16);
    return { r: v(0), g: v(2), b: v(4), a: full.length === 8 ? v(6) / 255 : 1 };
  }
  const fn = /^(rgba?|hsla?|color-mix)\((.*)\)$/.exec(s);
  if (!fn) return null;
  const [, name, body] = fn;
  if (name === "color-mix") {
    const args = splitArgs(body);
    if (args.length !== 3 || !/^in\s+srgb$/.test(args[0])) return null;
    const side = (a: string) => {
      const m = /^(.*?)(?:\s+(-?[\d.]+)%)?$/.exec(a)!;
      const c = parseRGBA(m[1]);
      return c ? { c, p: m[2] === undefined ? undefined : parseFloat(m[2]) / 100 } : null;
    };
    const x = side(args[1]), y = side(args[2]);
    if (!x || !y) return null;
    let p1 = x.p, p2 = y.p;
    if (p1 === undefined && p2 === undefined) { p1 = 0.5; p2 = 0.5; }
    else if (p1 === undefined) p1 = 1 - p2!;
    else if (p2 === undefined) p2 = 1 - p1;
    const sum = p1 + p2!;
    if (sum <= 0) return null;
    p1 /= sum; p2! /= sum;
    const alpha = x.c.a * p1 + y.c.a * p2!;
    if (alpha === 0) return { r: 0, g: 0, b: 0, a: 0 };
    const mix = (k: "r" | "g" | "b") => (x.c[k] * x.c.a * p1! + y.c[k] * y.c.a * p2!) / alpha; // premultiplied
    return { r: mix("r"), g: mix("g"), b: mix("b"), a: alpha };
  }
  const parts = body.split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3) return null;
  const alpha = parts[3] !== undefined ? clamp(num(parts[3], 1), 0, 1) : 1;
  if (name.startsWith("rgb")) {
    const [r, g, b] = parts.slice(0, 3).map((p) => clamp(num(p, 255), 0, 255));
    return [r, g, b].some(Number.isNaN) ? null : { r, g, b, a: alpha };
  }
  const h = parseFloat(parts[0]), sat = num(parts[1], 1), l = num(parts[2], 1);
  if ([h, sat, l].some(Number.isNaN)) return null;
  return { ...hslToRgb(h, clamp(sat, 0, 1), clamp(l, 0, 1)), a: alpha };
}

/** Parses a CSS color to an opaque RGB (integers 0-255), compositing any transparency over `over` (default black). */
export function parseColor(css: string, over: RGB = { r: 0, g: 0, b: 0 }): RGB | null {
  const c = parseRGBA(css);
  if (!c || [c.r, c.g, c.b, c.a].some(Number.isNaN)) return null;
  const f = (k: "r" | "g" | "b") => Math.round(clamp(c[k] * c.a + over[k] * (1 - c.a), 0, 255));
  return { r: f("r"), g: f("g"), b: f("b") };
}

const lin = (v: number) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const luminance = (c: RGB) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);

/** WCAG 2.x contrast ratio, 1..21. */
export function contrastRatio(a: RGB, b: RGB): number {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function toHex(c: RGB): string {
  return "#" + [c.r, c.g, c.b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0")).join("");
}

// ---- OKLCH (Björn Ottosson's reference matrices) ----
function toOklch(c: RGB): { L: number; C: number; h: number } {
  const r = lin(c.r), g = lin(c.g), b = lin(c.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { L, C: Math.hypot(A, B), h: Math.atan2(B, A) };
}

function fromOklchRaw(L: number, C: number, h: number): [number, number, number] {
  const A = C * Math.cos(h), B = C * Math.sin(h);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const b = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  const enc = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.max(v, 0) ** (1 / 2.4) - 0.055);
  return [enc(r), enc(g), enc(b)];
}

/** OKLCH -> sRGB; if out of gamut, reduces chroma (keeping L and hue) rather than clipping channels. */
function fromOklch(L: number, C: number, h: number): RGB {
  const inGamut = (v: number[]) => v.every((x) => x >= -0.0005 && x <= 1.0005);
  let v = fromOklchRaw(L, C, h);
  if (!inGamut(v)) {
    let lo = 0, hi = C;
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(fromOklchRaw(L, mid, h))) lo = mid; else hi = mid;
    }
    v = fromOklchRaw(L, lo, h);
  }
  return { r: Math.round(clamp(v[0], 0, 1) * 255), g: Math.round(clamp(v[1], 0, 1) * 255), b: Math.round(clamp(v[2], 0, 1) * 255) };
}

const BLACK: RGB = { r: 0, g: 0, b: 0 };
const WHITE: RGB = { r: 255, g: 255, b: 255 };
const worst = (fg: RGB, bgs: RGB[]) => Math.min(...bgs.map((b) => contrastRatio(fg, b)));

/** Like ensureContrast, but the result must reach `min` against EVERY background (worst case). */
export function ensureContrastAll(fg: RGB, bgs: RGB[], min: number): RGB {
  if (worst(fg, bgs) >= min) return fg;
  const { L, C, h } = toOklch(fg);
  let best: { rgb: RGB; delta: number } | null = null;
  for (const target of [0, 1]) {
    if (worst(fromOklch(target, C, h), bgs) < min) continue; // this direction cannot reach min
    let pass = target, fail = L; // pass = reaches min, fail = doesn't; find the closest passing L
    for (let i = 0; i < 40; i++) {
      const mid = (pass + fail) / 2;
      if (worst(fromOklch(mid, C, h), bgs) >= min) pass = mid; else fail = mid;
    }
    const rgb = fromOklch(pass, C, h);
    const delta = Math.abs(pass - L);
    if (worst(rgb, bgs) >= min && (!best || delta < best.delta)) best = { rgb, delta };
  }
  if (best) return best.rgb;
  return worst(BLACK, bgs) >= worst(WHITE, bgs) ? BLACK : WHITE;
}

/** Nudges fg's OKLCH lightness (hue kept) the smallest amount that reaches `min` against bg; black/white as a last resort. */
export function ensureContrast(fg: RGB, bg: RGB, min: number): RGB {
  return ensureContrastAll(fg, [bg], min);
}

export type AdjustedPalette = Palette & { destructiveText: string; primaryText: string };

/** Returns a NEW palette in which the UI's real color pairings meet WCAG AA. Tokens that already pass keep their raw value. */
export function adjustPalette(p: Palette): AdjustedPalette {
  const out: Palette = { ...p };
  const bg = parseColor(p.background) ?? WHITE;
  const get = (css: string | undefined, fallback: RGB) => (css ? parseColor(css, bg) : null) ?? fallback;
  const surfaces = (keys: (keyof Palette)[]) => keys.map((k) => get(p[k], bg));

  // (d) foreground against every surface it's drawn on
  const fg = get(p.foreground, BLACK);
  const fgOk = ensureContrastAll(fg, surfaces(["background", "sidebar", "muted", "accent", "userBubble"]), 4.5);
  if (fgOk !== fg) out.foreground = toHex(fgOk);

  // (a) secondary text on background, sidebar, muted
  const mfg = get(p.mutedForeground, fg);
  const mfgOk = ensureContrastAll(mfg, surfaces(["background", "sidebar", "muted"]), 4.5);
  if (mfgOk !== mfg) out.mutedForeground = toHex(mfgOk);

  // (c) text on primary buttons: keep the theme's own value if it passes, else the better of black/white
  const primary = get(p.primary, bg);
  const pfg = get(p.primaryForeground, WHITE);
  if (contrastRatio(pfg, primary) < 4.5) {
    out.primaryForeground = toHex(contrastRatio(BLACK, primary) >= contrastRatio(WHITE, primary) ? BLACK : WHITE);
  }

  // (e) focus ring
  const ring = get(p.ring, primary);
  const ringOk = ensureContrast(ring, bg, 3);
  if (ringOk !== ring) out.ring = toHex(ringOk);

  // (f) separators: mix toward foreground in 5% steps until 1.3:1 against the background
  for (const k of ["border", "sidebarBorder"] as const) {
    const c = get(p[k], bg);
    if (contrastRatio(c, bg) >= 1.3) continue;
    let t = 0, m = c;
    while (t < 1 && contrastRatio(m, bg) < 1.3) {
      t = Math.min(1, t + 0.05);
      m = { r: Math.round(c.r + (fgOk.r - c.r) * t), g: Math.round(c.g + (fgOk.g - c.g) * t), b: Math.round(c.b + (fgOk.b - c.b) * t) };
    }
    out[k] = toHex(m);
  }

  // (b) / (g) text-safe variants of the fill colors
  const destructive = get(p.destructive, fg);
  return {
    ...out,
    destructiveText: toHex(ensureContrast(destructive, bg, 4.5)),
    primaryText: toHex(ensureContrast(primary, bg, 4.5)),
  };
}
