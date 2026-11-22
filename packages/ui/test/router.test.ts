import { describe, expect, it } from "vitest";
import { parseHash, sameRoute, toHash, type Route } from "../src/router.ts";

describe("hash routes", () => {
  it("round-trips every route", () => {
    const routes: Route[] = [
      { view: "chat", chatId: null },
      { view: "chat", chatId: "0f8fad5b-d9cb-469f-a165-70867728950e" },
      { view: "skills", name: null },
      { view: "skills", name: "csv-to-json" },
      { view: "memory" },
      { view: "agents" },
      { view: "jobs" },
      { view: "settings" },
    ];
    for (const r of routes) expect(parseHash(toHash(r))).toEqual(r);
  });
  it("falls back to a new chat on anything unknown or hostile", () => {
    for (const h of ["", "#", "#/", "#/nope", "#/chat/../../etc", "#/chat/a.b", "#/chat/%E0%A4%A", "#/chat/" + "a".repeat(80), "#/skills/Bad Name", "#/skills/../x", "#/<script>"]) {
      const r = parseHash(h);
      if (r.view === "chat") expect(r.chatId).toBeNull();
      if (r.view === "skills") expect(r.name).toBeNull();
    }
    expect(parseHash("#/nope")).toEqual({ view: "chat", chatId: null });
  });
  it("sameRoute compares by address", () => {
    expect(sameRoute({ view: "memory" }, { view: "memory" })).toBe(true);
    expect(sameRoute({ view: "chat", chatId: "a" }, { view: "chat", chatId: "b" })).toBe(false);
  });
});
