import { beforeEach, describe, expect, it } from "vitest";
import { BINDING_IDS, DEFAULT_BINDINGS, comboFromEvent, formatCombo, loadBindings, matches, parseCombo, saveBindings, stringifyCombo, validateBinding, type BindingId } from "../src/keybindings.ts";

const ev = (code: string, o: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) => ({ code, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...o });

describe("combos", () => {
  it("parses, rejects junk and round-trips", () => {
    expect(parseCombo("Mod+KeyK")).toEqual({ mod: true, alt: false, shift: false, code: "KeyK" });
    expect(stringifyCombo(parseCombo("Shift+Alt+ArrowUp")!)).toBe("Alt+Shift+ArrowUp"); // canonical order
    for (const bad of ["", "Mod+", "KeyK+Mod", "Mod+Mod+KeyK", "Ctrl+KeyK", "Mod+Enter", "Mod+Escape", "Mod+Tab", "Mod+Space", "Alt+Backspace", "Mod+ShiftLeft", "Mod+Key1", "Mod+F13"]) expect(parseCombo(bad), bad).toBeNull();
    expect(parseCombo(5 as never)).toBeNull();
  });
  it("matches ctrl or cmd for Mod, exact alt and shift, and the physical key", () => {
    expect(matches(ev("KeyK", { ctrlKey: true }), "Mod+KeyK")).toBe(true);
    expect(matches(ev("KeyK", { metaKey: true }), "Mod+KeyK")).toBe(true);
    expect(matches(ev("KeyK"), "Mod+KeyK")).toBe(false);
    expect(matches(ev("KeyK", { ctrlKey: true, shiftKey: true }), "Mod+KeyK")).toBe(false);
    expect(matches(ev("KeyN", { altKey: true }), "Alt+KeyN")).toBe(true);
    expect(matches(ev("KeyN", { altKey: true, ctrlKey: true }), "Alt+KeyN")).toBe(false);
    expect(matches(ev("KeyN", { altKey: true }), "garbage")).toBe(false);
  });
  it("reads a combo from an event and ignores lone modifier keys", () => {
    expect(comboFromEvent(ev("KeyJ", { altKey: true, shiftKey: true }))).toEqual({ mod: false, alt: true, shift: true, code: "KeyJ" });
    for (const m of ["ControlLeft", "ShiftRight", "AltLeft", "MetaLeft", "OSLeft"]) expect(comboFromEvent(ev(m, { ctrlKey: true }))).toBeNull();
    expect(comboFromEvent(ev(""))).toBeNull();
  });
  it("formats for Mac and for Windows/Linux", () => {
    expect(formatCombo("Mod+KeyK", false)).toBe("Ctrl+K");
    expect(formatCombo("Mod+KeyK", true)).toBe("⌘K");
    expect(formatCombo("Alt+Shift+ArrowUp", false)).toBe("Alt+Shift+↑");
    expect(formatCombo("Alt+ArrowDown", true)).toBe("⌥↓");
    expect(formatCombo("Mod+Slash", false)).toBe("Ctrl+/");
    expect(formatCombo("Alt+Digit3", false)).toBe("Alt+3");
    expect(formatCombo("not a combo")).toBe("not a combo");
  });
});

describe("validateBinding", () => {
  const cur = { ...DEFAULT_BINDINGS };
  it("needs Ctrl/Cmd or Alt, and refuses keys the browser or system keeps", () => {
    expect(validateBinding("new", "Shift+KeyN", cur)).toMatchObject({ ok: false, reason: expect.stringMatching(/together with a key/) });
    expect(validateBinding("new", "KeyN", cur).ok).toBe(false);
    for (const r of ["Mod+KeyW", "Mod+KeyT", "Mod+KeyN", "Mod+KeyR", "Alt+F4", "F5", "Mod+Shift+KeyI"]) expect(validateBinding("new", r, cur), r).toMatchObject({ ok: false });
    expect(validateBinding("new", "Mod+KeyW", cur)).toMatchObject({ reason: expect.stringMatching(/browser or system/) });
  });
  it("protects the fixed Alt+1…9 chat slots", () => {
    expect(validateBinding("new", "Alt+Digit4", cur)).toMatchObject({ ok: false, reason: expect.stringMatching(/recent chat/) });
    expect(validateBinding("new", "Alt+Digit0", cur).ok).toBe(true);
  });
  it("refuses a clash with another shortcut, but allows keeping its own value", () => {
    expect(validateBinding("new", "Mod+KeyK", cur)).toMatchObject({ ok: false, reason: expect.stringMatching(/already used for “Command palette”/) });
    expect(validateBinding("new", "Alt+KeyN", cur).ok).toBe(true);
    expect(validateBinding("new", "Alt+KeyJ", cur).ok).toBe(true);
  });
});

describe("loadBindings / saveBindings", () => {
  beforeEach(() => localStorage.clear());
  it("returns the defaults when nothing or junk is saved", () => {
    expect(loadBindings()).toEqual(DEFAULT_BINDINGS);
    for (const junk of ["", "null", "[]", "5", "{bad json", '"str"', '{"palette":5}', '{"nope":"Alt+KeyZ"}']) expect(loadBindings(junk), junk).toEqual(DEFAULT_BINDINGS);
  });
  it("keeps valid choices and drops invalid or reserved ones one by one", () => {
    const b = loadBindings(JSON.stringify({ new: "Alt+KeyJ", palette: "Mod+KeyW", sidebar: "KeyB", search: "Alt+Digit2", prev: "Alt+Shift+ArrowUp" }));
    expect(b.new).toBe("Alt+KeyJ");
    expect(b.palette).toBe(DEFAULT_BINDINGS.palette);
    expect(b.sidebar).toBe(DEFAULT_BINDINGS.sidebar);
    expect(b.search).toBe(DEFAULT_BINDINGS.search);
    expect(b.prev).toBe("Alt+Shift+ArrowUp");
  });
  it("accepts a valid swap of two shortcuts (each is checked against the final set, not the defaults)", () => {
    const b = loadBindings(JSON.stringify({ palette: "Alt+KeyN", new: "Mod+KeyK" }));
    expect(b.palette).toBe("Alt+KeyN");
    expect(b.new).toBe("Mod+KeyK");
  });
  it("undoes clashing customisations instead of leaving two actions on one key", () => {
    const b = loadBindings(JSON.stringify({ new: "Alt+KeyJ", search: "Alt+KeyJ" }));
    expect(b.new).toBe(DEFAULT_BINDINGS.new);
    expect(b.search).toBe(DEFAULT_BINDINGS.search);
    const vals = BINDING_IDS.map((id: BindingId) => b[id]);
    expect(new Set(vals).size).toBe(vals.length);
    // a customised key that lands on another action's untouched default is also undone
    const c = loadBindings(JSON.stringify({ new: "Mod+KeyK" }));
    expect(new Set(BINDING_IDS.map((id) => c[id])).size).toBe(BINDING_IDS.length);
  });
  it("saves only the differences, clears storage on reset, and announces the change", () => {
    let fired = 0;
    window.addEventListener("pheme:keys-changed", () => fired++);
    saveBindings({ ...DEFAULT_BINDINGS, new: "Alt+KeyJ" });
    expect(JSON.parse(localStorage.getItem("pheme-keys")!)).toEqual({ new: "Alt+KeyJ" });
    expect(loadBindings().new).toBe("Alt+KeyJ");
    saveBindings({ ...DEFAULT_BINDINGS });
    expect(localStorage.getItem("pheme-keys")).toBeNull();
    expect(fired).toBe(2);
  });
});
