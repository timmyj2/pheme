import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { clearUnsaved, hasUnsaved, useUnsaved } from "../src/unsaved.ts";

describe("unsaved registry", () => {
  it("tracks dirty editors and forgets them when they become clean or unmount", () => {
    const a = renderHook(({ d }) => useUnsaved(d), { initialProps: { d: false } });
    const b = renderHook(({ d }) => useUnsaved(d), { initialProps: { d: true } });
    expect(hasUnsaved()).toBe(true);
    b.rerender({ d: false });
    expect(hasUnsaved()).toBe(false);
    a.rerender({ d: true });
    expect(hasUnsaved()).toBe(true);
    a.unmount();
    expect(hasUnsaved()).toBe(false);
  });
  it("clearUnsaved resets everything", () => {
    renderHook(() => useUnsaved(true));
    clearUnsaved();
    expect(hasUnsaved()).toBe(false);
  });
});
