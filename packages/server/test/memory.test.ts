import { describe, expect, it } from "vitest";
import { MemoryStore } from "../src/memory.ts";
import { tmpDir } from "./helpers.ts";

const mk = (memory = 100, user = 50) => new MemoryStore(tmpDir(), () => ({ memory, user }));

describe("MemoryStore", () => {
  it("adds, replaces and removes entries", () => {
    const m = mk();
    m.apply({ action: "add", store: "user", content: "likes tea" });
    m.apply({ action: "add", store: "user", content: "works nights" });
    expect(m.read("user")).toEqual(["likes tea", "works nights"]);
    m.apply({ action: "replace", store: "user", old_text: "tea", content: "likes coffee" });
    m.apply({ action: "remove", store: "user", old_text: "nights" });
    expect(m.read("user")).toEqual(["likes coffee"]);
    expect(m.read("memory")).toEqual([]);
  });
  it("enforces the character limit", () => {
    const m = mk(100, 10);
    expect(() => m.apply({ action: "add", store: "user", content: "this is far too long" })).toThrow(/limit/);
    expect(m.read("user")).toEqual([]);
  });
  it("rejects ambiguous or missing matches and duplicates", () => {
    const m = mk();
    m.apply({ action: "add", store: "memory", content: "a one" });
    m.apply({ action: "add", store: "memory", content: "a two" });
    expect(() => m.apply({ action: "remove", store: "memory", old_text: "a " })).toThrow(/several/);
    expect(() => m.apply({ action: "remove", store: "memory", old_text: "zzz" })).toThrow(/no entry/);
    expect(m.apply({ action: "add", store: "memory", content: "a one" })).toMatch(/Already/);
  });
  it("renders a block for the system message", () => {
    const m = mk();
    m.apply({ action: "add", store: "user", content: "beginner" });
    expect(m.block()).toContain("beginner");
    expect(m.block()).toContain("/50 chars");
  });
});
