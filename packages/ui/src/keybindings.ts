/** Rebindable keyboard shortcuts: defaults, saved choices, matching a key event, and validating a new choice. */

export type BindingId = "palette" | "new" | "search" | "sidebar" | "prev" | "next";

export const BINDING_IDS: BindingId[] = ["palette", "new", "search", "sidebar", "prev", "next"];
export const BINDING_LABELS: Record<BindingId, string> = {
  palette: "Command palette",
  new: "New chat",
  search: "Search chats",
  sidebar: "Show or hide the sidebar",
  prev: "Previous chat",
  next: "Next chat",
};
/** A combo is written like "Mod+KeyK" or "Alt+Shift+ArrowUp". `Mod` means Ctrl (Windows/Linux) or Cmd (Mac). */
export const DEFAULT_BINDINGS: Record<BindingId, string> = {
  palette: "Mod+KeyK",
  new: "Alt+KeyN",
  search: "Alt+KeyS",
  sidebar: "Mod+KeyB",
  prev: "Alt+ArrowUp",
  next: "Alt+ArrowDown",
};

export const STORAGE_KEY = "pheme-keys";
export const KEYS_CHANGED = "pheme:keys-changed";

export interface Combo { mod: boolean; alt: boolean; shift: boolean; code: string }

const MODIFIER_CODES = /^(Control|Shift|Alt|Meta|OS)(Left|Right)?$/;
const ALLOWED_CODE = /^(Key[A-Z]|Digit[0-9]|Arrow(Up|Down|Left|Right)|F([1-9]|1[0-2])|Comma|Period|Slash|Semicolon|Quote|BracketLeft|BracketRight|Backquote|Minus|Equal)$/;

export function parseCombo(s: string): Combo | null {
  if (typeof s !== "string") return null;
  const parts = s.split("+");
  const code = parts.pop() ?? "";
  if (!ALLOWED_CODE.test(code)) return null;
  const c: Combo = { mod: false, alt: false, shift: false, code };
  for (const p of parts) {
    if (p === "Mod" && !c.mod) c.mod = true;
    else if (p === "Alt" && !c.alt) c.alt = true;
    else if (p === "Shift" && !c.shift) c.shift = true;
    else return null;
  }
  return c;
}

export function stringifyCombo(c: Combo): string {
  return [c.mod && "Mod", c.alt && "Alt", c.shift && "Shift", c.code].filter(Boolean).join("+");
}

/** The combo a key event represents, or null for a lone modifier key press. */
export function comboFromEvent(e: Pick<KeyboardEvent, "code" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">): Combo | null {
  if (!e.code || MODIFIER_CODES.test(e.code)) return null;
  return { mod: e.ctrlKey || e.metaKey, alt: e.altKey, shift: e.shiftKey, code: e.code };
}

export function matches(e: Pick<KeyboardEvent, "code" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">, combo: string): boolean {
  const c = parseCombo(combo);
  if (!c) return false;
  return e.code === c.code && (e.ctrlKey || e.metaKey) === c.mod && e.altKey === c.alt && e.shiftKey === c.shift;
}

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

const ARROWS: Record<string, string> = { ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→" };
const PUNCT: Record<string, string> = { Comma: ",", Period: ".", Slash: "/", Semicolon: ";", Quote: "'", BracketLeft: "[", BracketRight: "]", Backquote: "`", Minus: "-", Equal: "=" };

/** Human text for a combo: "Ctrl+K", "⌘K", "Alt+↑". */
export function formatCombo(combo: string, mac = isMac()): string {
  const c = parseCombo(combo);
  if (!c) return combo;
  const key = c.code.startsWith("Key") ? c.code.slice(3) : c.code.startsWith("Digit") ? c.code.slice(5) : (ARROWS[c.code] ?? PUNCT[c.code] ?? c.code);
  if (mac) return `${c.mod ? "⌘" : ""}${c.alt ? "⌥" : ""}${c.shift ? "⇧" : ""}${key}`;
  return [c.mod && "Ctrl", c.alt && "Alt", c.shift && "Shift", key].filter(Boolean).join("+");
}

/** Combos the browser or operating system keeps for itself (or that Pheme uses for something fixed). */
const RESERVED = new Set([
  "Mod+KeyW", "Mod+KeyT", "Mod+KeyN", "Mod+KeyR", "Mod+KeyQ", "Mod+KeyL", "Mod+KeyP", "Mod+KeyS", "Mod+KeyF", "Mod+KeyA", "Mod+KeyC", "Mod+KeyV", "Mod+KeyX",
  "Mod+KeyZ", "Mod+KeyY", "Mod+KeyD", "Mod+KeyH", "Mod+KeyJ", "Mod+KeyU", "Mod+KeyO", "Mod+KeyG", "Mod+KeyE", "Mod+KeyM", "Mod+Comma", "Mod+Minus", "Mod+Equal",
  "Mod+Shift+KeyT", "Mod+Shift+KeyN", "Mod+Shift+KeyW", "Mod+Shift+KeyR", "Mod+Shift+KeyI", "Mod+Shift+KeyJ", "Mod+Shift+KeyC", "Mod+Shift+KeyDelete",
  "Alt+F4", "Alt+ArrowLeft", "Alt+ArrowRight", "Alt+Shift+ArrowLeft", "Alt+Shift+ArrowRight", "F5", "F11", "F12",
]);

export type CheckResult = { ok: true } | { ok: false; reason: string };

/** Is this combo acceptable for `id`, given what the other shortcuts use? */
export function validateBinding(id: BindingId, combo: string, current: Record<BindingId, string>): CheckResult {
  const c = parseCombo(combo);
  if (!c) return { ok: false, reason: "That key cannot be used." };
  if (!c.mod && !c.alt) return { ok: false, reason: "Use Ctrl/Cmd or Alt together with a key, so typing is never interrupted." };
  const norm = stringifyCombo(c);
  if (RESERVED.has(norm)) return { ok: false, reason: `${formatCombo(norm)} is used by your browser or system. Pick another.` };
  if (c.alt && !c.mod && !c.shift && /^Digit[1-9]$/.test(c.code)) return { ok: false, reason: `${formatCombo(norm)} jumps to a recent chat and cannot be changed.` };
  for (const other of BINDING_IDS) {
    const theirs = parseCombo(current[other]);
    if (other !== id && theirs && stringifyCombo(theirs) === norm) return { ok: false, reason: `${formatCombo(norm)} is already used for “${BINDING_LABELS[other]}”.` };
  }
  return { ok: true };
}

/** Everything `validateBinding` checks except clashes with the other shortcuts. */
function individuallyOk(combo: string): string | null {
  const c = parseCombo(combo);
  if (!c || (!c.mod && !c.alt)) return null;
  const norm = stringifyCombo(c);
  if (RESERVED.has(norm)) return null;
  if (c.alt && !c.mod && !c.shift && /^Digit[1-9]$/.test(c.code)) return null;
  return norm;
}

/** Saved bindings merged over the defaults. Anything damaged, unknown, reserved or clashing falls back to the default. */
export function loadBindings(raw?: string | null): Record<BindingId, string> {
  const out = { ...DEFAULT_BINDINGS };
  let saved: unknown;
  try {
    const text = raw ?? (typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null);
    saved = JSON.parse(text || "null");
  } catch { return out; }
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) return out;
  for (const id of BINDING_IDS) {
    const v = (saved as Record<string, unknown>)[id];
    const norm = typeof v === "string" ? individuallyOk(v) : null;
    if (norm) out[id] = norm;
  }
  // Two shortcuts must never share a combo (a hand-edited or older save could): undo the customised ones in any clash.
  const clash = () => {
    const seen = new Map<string, BindingId[]>();
    for (const id of BINDING_IDS) seen.set(out[id], [...(seen.get(out[id]) ?? []), id]);
    return [...seen.values()].filter((ids) => ids.length > 1).flat();
  };
  for (const id of clash()) out[id] = DEFAULT_BINDINGS[id];
  if (clash().length) return { ...DEFAULT_BINDINGS };
  return out;
}

export function saveBindings(b: Record<BindingId, string>): void {
  const diff: Partial<Record<BindingId, string>> = {};
  for (const id of BINDING_IDS) if (b[id] !== DEFAULT_BINDINGS[id]) diff[id] = b[id];
  try {
    if (Object.keys(diff).length) localStorage.setItem(STORAGE_KEY, JSON.stringify(diff));
    else localStorage.removeItem(STORAGE_KEY);
  } catch { /* private mode: lasts until the tab closes */ }
  window.dispatchEvent(new Event(KEYS_CHANGED));
}
