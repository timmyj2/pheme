import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ContextMeter, formatTokens, latestUsage, usageLevel } from "../src/ContextMeter.tsx";
import type { SeqEvent } from "../src/api.ts";

const ev = (e: object, seq = 1): SeqEvent => ({ ...e, seq, ts: 0 }) as SeqEvent;

describe("ContextMeter", () => {
  it("shows nothing until the engine has reported usage", () => {
    const { container } = render(<ContextMeter events={[ev({ type: "user", text: "hi" })]} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("uses the newest report and exposes it to screen readers as a meter", () => {
    render(<ContextMeter events={[ev({ type: "usage", used: 1000, limit: 128000 }, 1), ev({ type: "user", text: "x" }, 2), ev({ type: "usage", used: 32000, limit: 128000 }, 3)]} />);
    const m = screen.getByRole("meter", { name: "Context used" });
    expect(m).toHaveAttribute("aria-valuenow", "32000");
    expect(m).toHaveAttribute("aria-valuemax", "128000");
    expect(m).toHaveAttribute("aria-valuetext", "32k of 128k tokens, 25 percent");
    expect(screen.getByText("32k / 128k")).toBeInTheDocument();
  });
  it("warns in words as well as colour when getting full, and caps at 100%", () => {
    const { rerender } = render(<ContextMeter events={[ev({ type: "usage", used: 105000, limit: 128000 })]} />);
    expect(screen.getByText(/getting full/)).toBeInTheDocument();
    rerender(<ContextMeter events={[ev({ type: "usage", used: 130000, limit: 128000 })]} />);
    expect(screen.getByText(/almost full/)).toBeInTheDocument();
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "128000");
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuetext", expect.stringContaining("100 percent"));
  });
  it("skips junk reports from old or damaged logs", () => {
    expect(latestUsage([ev({ type: "usage", used: 5, limit: 0 }), ev({ type: "usage", used: -1, limit: 10 }), ev({ type: "usage", used: "x", limit: 10 })])).toBeNull();
    expect(latestUsage([ev({ type: "usage", used: 5, limit: 10 }, 1), ev({ type: "usage", used: NaN, limit: 10 }, 2)])).toEqual({ used: 5, limit: 10 });
  });
  it("formats token counts and levels", () => {
    expect([0, 999, 1000, 1234, 12345, 128000, 1000000, 2500000, 12000000].map(formatTokens)).toEqual(["0", "999", "1k", "1.2k", "12k", "128k", "1M", "2.5M", "12M"]);
    expect([0, 79, 80, 94, 95, 100].map(usageLevel)).toEqual(["ok", "ok", "warn", "warn", "full", "full"]);
  });
});
