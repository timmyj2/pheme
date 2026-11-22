import { describe, expect, it } from "vitest";
import { computeUnread } from "../src/seen.ts";

describe("unread tracking", () => {
  it("a chat never seen before counts as seen, so the first run flags nothing", () => {
    const r = computeUnread([{ id: "a", updatedAt: 5 }, { id: "b", updatedAt: 9 }], {}, null);
    expect(r.unread.size).toBe(0);
    expect(r.seen).toEqual({ a: 5, b: 9 });
  });
  it("flags chats that changed after they were last seen, but never the open one", () => {
    const r = computeUnread([{ id: "a", updatedAt: 20 }, { id: "b", updatedAt: 20 }], { a: 10, b: 10 }, "b");
    expect([...r.unread]).toEqual(["a"]);
    expect(r.seen.b).toBe(20);
  });
  it("forgets deleted chats", () => {
    expect(computeUnread([{ id: "a", updatedAt: 1 }], { a: 1, gone: 3 }, null).seen).toEqual({ a: 1 });
  });
});
