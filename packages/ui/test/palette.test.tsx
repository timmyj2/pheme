import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Palette, filterCommands, type Command } from "../src/Palette.tsx";

const cmds = (...labels: string[]): Command[] => labels.map((l, i) => ({ id: String(i), label: l, run: vi.fn() }));

describe("filterCommands", () => {
  it("needs every word and ranks prefix matches first", () => {
    const c = cmds("Go to Settings", "Settings: theme", "New chat", "Open skill: set-up");
    expect(filterCommands(c, "set").map((x) => x.label)).toEqual(["Settings: theme", "Go to Settings", "Open skill: set-up"]);
    expect(filterCommands(c, "go set").map((x) => x.label)).toEqual(["Go to Settings"]);
    expect(filterCommands(c, "zzz")).toEqual([]);
    expect(filterCommands(c, "   ").length).toBe(4);
  });
  it("stays fast and capped with thousands of chats", () => {
    const many = cmds(...Array.from({ length: 20000 }, (_, i) => `chat number ${i}`));
    const t = performance.now();
    const r = filterCommands(many, "number 1");
    expect(r.length).toBeLessThanOrEqual(50);
    expect(performance.now() - t).toBeLessThan(200);
  });
});

describe("Palette", () => {
  it("filters, moves with arrows, runs on Enter and closes", async () => {
    const user = userEvent.setup();
    const c = cmds("Alpha", "Beta", "Gamma");
    const onClose = vi.fn();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<Palette commands={c} onClose={onClose} />);
    const box = screen.getByRole("combobox");
    expect(box).toHaveFocus();
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    vi.advanceTimersByTime(10);
    expect(c[2].run).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    vi.useRealTimers();
  });
  it("announces the active option for screen readers and shows an empty state", async () => {
    const user = userEvent.setup();
    render(<Palette commands={cmds("Alpha", "Beta")} onClose={() => {}} />);
    const box = screen.getByRole("combobox");
    expect(box).toHaveAttribute("aria-activedescendant", "pal-0");
    await user.keyboard("{ArrowDown}");
    expect(box).toHaveAttribute("aria-activedescendant", "pal-1");
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");
    await user.keyboard("nomatch");
    expect(screen.getByText("No matches")).toBeInTheDocument();
  });
  it("Escape closes it", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Palette commands={cmds("Alpha")} onClose={onClose} />);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});
