import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mergeText, PrDetails, reviewText } from "../src/PrDetails.tsx";
import { api, type PrDetail } from "../src/api.ts";

const base: PrDetail = { number: 5, url: "https://github.com/o/r/pull/5", title: "T", state: "open", draft: false, base: "main", head: "feat/x", checks: [], checksSummary: "none", moreChecks: 0, review: "none", mergeable: "mergeable", additions: 4, deletions: 1, changedFiles: 2 };
const mk = (o: Partial<PrDetail>): PrDetail => ({ ...base, ...o });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("PrDetails", () => {
  it("shows failing and running checks first, hides passing ones until asked, and never relies on colour alone", async () => {
    vi.spyOn(api, "gitPrDetail").mockResolvedValue({ pr: mk({ review: "changes_requested", checksSummary: "failing", checks: [
      { name: "test (windows)", state: "failing", url: "https://github.com/o/r/runs/1" }, { name: "test (mac)", state: "pending" }, { name: "lint", state: "passing" }, { name: "docs", state: "skipped" }] }) });
    const user = userEvent.setup();
    render(<PrDetails chatId="c" number={5} />);
    expect(await screen.findByText("Changes requested")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("1 failed · 1 running · 1 passed · 1 skipped");
    expect(screen.getByText("failed:", { exact: false })).toBeInTheDocument(); // screen-reader word
    expect(screen.getByRole("link", { name: "test (windows)" })).toHaveAttribute("href", "https://github.com/o/r/runs/1");
    expect(screen.queryByText("lint")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Show all 4 checks" }));
    expect(screen.getByText("lint")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Show only checks that need attention/ })).toHaveAttribute("aria-expanded", "true");
  });
  it("says so when no checks have reported, and when GitHub cannot be reached (with a retry)", async () => {
    const spy = vi.spyOn(api, "gitPrDetail").mockRejectedValueOnce(new Error("HTTP 502: Bad Gateway")).mockResolvedValue({ pr: mk({}) });
    const user = userEvent.setup();
    render(<PrDetails chatId="c" number={5} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("HTTP 502");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No checks have reported yet.")).toBeInTheDocument();
    expect(spy).toHaveBeenCalledTimes(2);
  });
  it("looks again every 20 s while checks run, and stops when they finish", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const spy = vi.spyOn(api, "gitPrDetail")
      .mockResolvedValueOnce({ pr: mk({ checksSummary: "pending", checks: [{ name: "t", state: "pending" }] }) })
      .mockResolvedValue({ pr: mk({ checksSummary: "passing", checks: [{ name: "t", state: "passing" }] }) });
    render(<PrDetails chatId="c" number={5} />);
    await screen.findByText("1 running");
    await vi.advanceTimersByTimeAsync(20_500);
    await screen.findByText("1 passed");
    const n = spy.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(spy.mock.calls.length).toBe(n);
  });
  it("labels merge state in plain words", () => {
    expect(mergeText(mk({ state: "merged" }))).toBe("Merged");
    expect(mergeText(mk({ draft: true }))).toMatch(/Draft/);
    expect(mergeText(mk({ mergeable: "conflicting" }))).toBe("Has merge conflicts");
    expect(mergeText(mk({ mergeState: "behind" }))).toBe("Behind the base branch");
    expect(mergeText(mk({ mergeable: "unknown" }))).toMatch(/not known/);
    expect(reviewText("review_required")).toBe("Review required");
  });
});
