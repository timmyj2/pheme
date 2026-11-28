import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SettingsPage } from "../src/Pages.tsx";
import { ToastProvider } from "../src/toast.tsx";
import type { BootstrapState } from "../src/api.ts";

vi.mock("../src/api.ts", async (orig) => {
  const actual = await orig<typeof import("../src/api.ts")>();
  return { ...actual, api: { ...actual.api, models: vi.fn().mockResolvedValue([{ id: "auto", name: "Auto" }]) } };
});
const state = { engine: "fake", fake: true, version: "t", usage: { turns: 0, reviews: 0, toolSteps: 0 }, settings: { model: "auto", reviewModel: "", theme: "dark", autoApproveAll: false, loopsEnabled: true, curatorEnabled: true, curatorEveryDays: 7, curatorStaleDays: 90, skillReviewMinToolSteps: 10, memoryReviewEveryUserMessages: 10, memoryLimit: 2200, userLimit: 1375 } } as unknown as BootstrapState;
const ui = (onClose = vi.fn()) => ({ onClose, el: <ToastProvider><SettingsPage state={state} onChange={() => {}} onClose={onClose} /></ToastProvider> });

describe("Settings overlay", () => {
  it("is a named modal dialog with a breadcrumb for the open page", async () => {
    const { el } = ui();
    render(el);
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeInTheDocument();
    const crumb = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(crumb).toHaveTextContent("SettingsModelMain model");
  });

  it("the left rail opens a page and the breadcrumb follows it", async () => {
    const user = userEvent.setup();
    const { el } = ui();
    render(el);
    await user.click(screen.getByRole("button", { name: "Chat" }));
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toHaveTextContent("SettingsChat");
    expect(screen.getByRole("button", { name: "Chat" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByLabelText("Text size").closest("[hidden]")).toBeNull();
    expect(screen.getByLabelText("Chat model").closest("[hidden]")).not.toBeNull();
  });

  it("a group with sub-pages expands and its children open their own page", async () => {
    const user = userEvent.setup();
    const { el } = ui();
    render(el);
    await user.click(screen.getByRole("button", { name: "Collapse: Model" }));
    expect(screen.queryByRole("button", { name: "Review model" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Expand: Model" }));
    await user.click(screen.getByRole("button", { name: "Review model" }));
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toHaveTextContent("SettingsModelReview model");
    expect(screen.getByLabelText("Background review model")).toBeInTheDocument();
  });

  it("Escape, the X and a click on the scrim each close it", async () => {
    const user = userEvent.setup();
    const { el, onClose } = ui();
    const { unmount } = render(el);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Close settings" }));
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("dialog").parentElement!.parentElement!);
    expect(onClose).toHaveBeenCalledTimes(3);
    unmount();
  });

  it("Tab cycles inside the card and never reaches the page behind it", async () => {
    const user = userEvent.setup();
    const { el } = ui();
    render(el);
    const dialog = screen.getByRole("dialog");
    const focusables = [...dialog.querySelectorAll<HTMLElement>("button,input,select")].filter((el) => !el.closest("[hidden]"));
    const last = focusables[focusables.length - 1]!;
    last.focus();
    await user.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(focusables[0]);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(last);
  });

  it("the palette shortcut focuses the settings search instead of opening the palette", async () => {
    const user = userEvent.setup();
    const { el } = ui();
    render(el);
    await user.keyboard("{Control>}k{/Control}");
    expect(screen.getByLabelText("Search settings")).toHaveFocus();
  });
});
