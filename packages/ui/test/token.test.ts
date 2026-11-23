import { beforeEach, describe, expect, it, vi } from "vitest";
import { adoptSharedToken, initToken, token } from "../src/api.ts";

const at = (search: string) => window.history.replaceState(null, "", `/${search}#/x`);
beforeEach(() => { sessionStorage.clear(); localStorage.clear(); at(""); vi.restoreAllMocks(); });

describe("access key handling", () => {
  it("takes the key from the address, removes it from the address bar, and remembers it for this tab and this browser", () => {
    at("?token=abc123&keep=1");
    expect(initToken()).toBe("abc123");
    expect(window.location.search).toBe("?keep=1");
    expect(window.location.hash).toBe("#/x");
    expect(token()).toBe("abc123");
    expect(localStorage.getItem("pheme-token")).toBe("abc123");
  });
  it("an installed window with no address key and no tab storage picks up the last key this browser saw", () => {
    localStorage.setItem("pheme-token", "from-last-time");
    expect(initToken()).toBe("from-last-time");
    expect(token()).toBe("from-last-time");
  });
  it("a key in the address always wins over an older saved one", () => {
    localStorage.setItem("pheme-token", "old");
    at("?token=new");
    expect(initToken()).toBe("new");
    expect(localStorage.getItem("pheme-token")).toBe("new");
  });
  it("with no key anywhere, the key is empty (the sign-in screen explains what to do)", () => {
    expect(initToken()).toBe("");
  });
  it("adoptSharedToken switches to a newer key another window saved, once, and reports whether anything changed", () => {
    sessionStorage.setItem("pheme-token", "mine");
    expect(adoptSharedToken()).toBe(false); // nothing shared
    localStorage.setItem("pheme-token", "mine");
    expect(adoptSharedToken()).toBe(false); // same key
    localStorage.setItem("pheme-token", "newer");
    expect(adoptSharedToken()).toBe(true);
    expect(token()).toBe("newer");
    expect(adoptSharedToken()).toBe(false); // already adopted: no loop
  });
  it("private browsing (storage that throws) never breaks the page", () => {
    const real = Object.getOwnPropertyDescriptor(window, "localStorage")!;
    const thrower = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); }, removeItem() { throw new Error("denied"); } };
    Object.defineProperty(window, "localStorage", { value: thrower, configurable: true });
    try {
      expect(adoptSharedToken()).toBe(false);
      at("?token=zzz");
      expect(initToken()).toBe("zzz"); // this tab still works from its own storage
    } finally {
      Object.defineProperty(window, "localStorage", real);
    }
  });
});
