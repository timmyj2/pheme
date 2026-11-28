import { describe, expect, it } from "vitest";
import { ApprovalKeyGate, type KeyContext } from "../src/lib/keybinds/approval-keys.ts";

const plain: KeyContext = { editable: false, emptyEditable: false };
const key = (k: string, extra: object = {}) => ({ key: k, repeat: false, ...extra });

describe("ApprovalKeyGate", () => {
  it("Enter runs and Escape rejects once per press", () => {
    const g = new ApprovalKeyGate();
    expect(g.keyDown(key("Enter"), plain)).toBe("run");
    g.keyUp(key("Enter"));
    expect(g.keyDown(key("Escape"), plain)).toBe("reject");
  });
  it("auto-repeat never answers, and a key that answered must be released first", () => {
    const g = new ApprovalKeyGate();
    expect(g.keyDown(key("Enter"), plain)).toBe("run");
    expect(g.keyDown(key("Enter", { repeat: true }), plain)).toBeNull();
    expect(g.keyDown(key("Enter"), plain)).toBeNull();
    g.keyUp(key("Enter"));
    expect(g.keyDown(key("Enter"), plain)).toBe("run");
  });
  it("text fields keep their keys unless the field is empty and the key is Enter", () => {
    const g = new ApprovalKeyGate();
    expect(g.keyDown(key("Enter"), { editable: true, emptyEditable: false })).toBeNull();
    expect(g.keyDown(key("Escape"), { editable: true, emptyEditable: true })).toBeNull();
    expect(g.keyDown(key("Enter"), { editable: true, emptyEditable: true })).toBe("run");
  });
  it("modifiers, IME composition and other keys do nothing; a handled event is left alone", () => {
    const g = new ApprovalKeyGate();
    expect(g.keyDown(key("Enter", { shiftKey: true }), plain)).toBeNull();
    expect(g.keyDown(key("Enter", { isComposing: true }), plain)).toBeNull();
    expect(g.keyDown(key("a"), plain)).toBeNull();
    expect(g.keyDown(key("Enter", { defaultPrevented: true }), plain)).toBeNull();
  });
  it("reset releases a key that never got its keyup", () => {
    const g = new ApprovalKeyGate();
    g.keyDown(key("Enter"), plain);
    g.reset();
    expect(g.keyDown(key("Enter"), plain)).toBe("run");
  });
});
