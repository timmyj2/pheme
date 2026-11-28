import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SettingsPage } from "../src/Pages.tsx";
import { ToastProvider } from "../src/toast.tsx";
import type { BootstrapState } from "../src/api.ts";
import { TID } from "../src/testids.ts";

vi.mock("../src/api.ts", async (orig) => {
  const actual = await orig<typeof import("../src/api.ts")>();
  return { ...actual, api: { ...actual.api, models: vi.fn().mockResolvedValue([{ id: "auto", name: "Auto" }]) } };
});
const state = { engine: "fake", fake: true, version: "t", usage: { turns: 0, reviews: 0, toolSteps: 0 }, settings: { model: "auto", reviewModel: "", theme: "dark", autoApproveAll: false, loopsEnabled: true, curatorEnabled: true, curatorEveryDays: 7, curatorStaleDays: 90, skillReviewMinToolSteps: 10, memoryReviewEveryUserMessages: 10, memoryLimit: 2200, userLimit: 1375 } } as unknown as BootstrapState;
const ui = () => <ToastProvider><SettingsPage state={state} onChange={() => {}} /></ToastProvider>;
const visibleHeadings = () => screen.getAllByTestId(TID.settingsPanel).filter((p) => !p.hidden).map((p) => p.querySelector("h3")?.textContent);

describe("Settings search", () => {
  it("shows every panel with no query, then narrows by any word in a panel, and says when nothing matches", async () => {
    const user = userEvent.setup();
    render(ui());
    const all = visibleHeadings();
    expect(all).toEqual(expect.arrayContaining(["Model", "Appearance", "Notifications", "Keyboard shortcuts", "Backup and restore", "Permissions"]));
    const box = screen.getByLabelText("Search settings");
    await user.type(box, "backup");
    expect(visibleHeadings()).toEqual(["Backup and restore"]);
    await user.clear(box);
    await user.type(box, "approv");
    expect(visibleHeadings()).toContain("Notifications"); // its text mentions approve
    expect(visibleHeadings()).toContain("Permissions");
    await user.clear(box);
    await user.type(box, "solarized"); // an option inside a select
    expect(visibleHeadings()).toEqual(["Appearance"]);
    await user.clear(box);
    await user.type(box, "zzzz-nothing");
    expect(visibleHeadings()).toEqual([]);
    expect(await screen.findByText(/No settings match “zzzz-nothing”/)).toBeInTheDocument();
    await user.type(box, "{Escape}");
    expect(visibleHeadings()).toEqual(all);
  });
  it("matches several words in any order, case-insensitively", async () => {
    const user = userEvent.setup();
    render(ui());
    await user.type(screen.getByLabelText("Search settings"), "SHORTCUTS keyboard");
    expect(visibleHeadings()).toEqual(["Keyboard shortcuts"]);
  });
});
