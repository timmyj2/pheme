import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TABS_KEY, neighbourTab, pruneTabs, readOpenTabs, withTab, writeOpenTabs } from "../src/tabs.ts";

describe("open tabs", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("opening a chat adds its tab once, at the end", () => {
    expect(withTab([], "a")).toEqual(["a"]);
    expect(withTab(["a", "b"], "c")).toEqual(["a", "b", "c"]);
    const same = ["a", "b"];
    expect(withTab(same, "a")).toBe(same);
  });

  it("closing the active tab goes to the right neighbour, else the left, else a new chat", () => {
    expect(neighbourTab(["a", "b", "c"], "b")).toBe("c");
    expect(neighbourTab(["a", "b", "c"], "c")).toBe("b");
    expect(neighbourTab(["a"], "a")).toBeNull();
    expect(neighbourTab(["a", "b"], "z")).toBeNull();
  });

  it("drops tabs for chats that no longer exist, and keeps the array when nothing is gone", () => {
    const ids = ["a", "b"];
    expect(pruneTabs(ids, new Set(["a", "b", "c"]))).toBe(ids);
    expect(pruneTabs(ids, new Set(["b"]))).toEqual(["b"]);
  });

  it("remembers the open tabs in this browser, in order", () => {
    writeOpenTabs(["c", "a"]);
    expect(JSON.parse(localStorage.getItem(TABS_KEY) || "null")).toEqual(["c", "a"]);
    expect(readOpenTabs()).toEqual(["c", "a"]);
  });

  it("ignores corrupt storage and keeps working when storage is blocked", () => {
    localStorage.setItem(TABS_KEY, "{not json");
    expect(readOpenTabs()).toEqual([]);
    localStorage.setItem(TABS_KEY, JSON.stringify(["a", 3, null, "b"]));
    expect(readOpenTabs()).toEqual(["a", "b"]);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(readOpenTabs()).toEqual([]);
    expect(() => writeOpenTabs(["a"])).not.toThrow();
  });
});
