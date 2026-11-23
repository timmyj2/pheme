import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ago, BranchBar } from "../src/BranchBar.tsx";
import { api, type BranchList, type ChangedFile, type GitStatus, type StashEntry } from "../src/api.ts";
import { ToastProvider } from "../src/toast.tsx";

vi.mock("../src/api.ts", async (orig) => {
  const actual = await orig<typeof import("../src/api.ts")>();
  return { ...actual, api: { ...actual.api, gitBranches: vi.fn(), gitStashes: vi.fn(), gitSwitch: vi.fn(), gitStashPush: vi.fn(), gitStashApply: vi.fn(), gitStashDrop: vi.fn() } };
});
const m = (k: keyof typeof api) => api[k] as unknown as ReturnType<typeof vi.fn>;
const file = (p: string): ChangedFile => ({ path: p, staged: "", unstaged: "modified", additions: 1, deletions: 0, binary: false });
const status = (files: ChangedFile[] = []): GitStatus => ({ repo: true, branch: "main", hasCommits: true, files });
const now = Math.floor(Date.now() / 1000);
const branches: BranchList = { current: "main", detached: false, more: 0, branches: [
  { name: "main", current: true, sha: "a", subject: "init", date: now }, { name: "feat/login", current: false, sha: "b", subject: "Add login", date: now - 7200 }] };
const stash = (msg: string, sha = "a".repeat(40)): StashEntry => ({ sha, message: msg, date: now - 120, branch: "main" });
const ui = (s: GitStatus, o: { busy?: boolean; onChanged?: () => void } = {}) => <ToastProvider><BranchBar chatId="c" status={s} busy={o.busy ?? false} onChanged={o.onChanged ?? (() => {})} /></ToastProvider>;
const openIt = async () => { const u = userEvent.setup(); await u.click(screen.getByRole("button", { name: /main/ })); await screen.findByText(/Add login/); return u; };

beforeEach(() => {
  for (const k of ["gitBranches", "gitStashes", "gitSwitch", "gitStashPush", "gitStashApply", "gitStashDrop"] as const) m(k).mockReset();
  m("gitBranches").mockResolvedValue(branches);
  m("gitStashes").mockResolvedValue({ stashes: [], more: 0 });
});

describe("BranchBar", () => {
  it("is closed until asked, then lists branches (current one not clickable) and filters", async () => {
    render(ui(status()));
    expect(m("gitBranches")).not.toHaveBeenCalled();
    const u = await openIt();
    expect(screen.getByRole("button", { name: /main/, current: true })).toBeDisabled();
    await u.type(screen.getByLabelText("Filter branches"), "LOGIN");
    expect(screen.queryByText(/^init ·/)).toBeNull();
    await u.clear(screen.getByLabelText("Filter branches")); await u.type(screen.getByLabelText("Filter branches"), "zzz");
    expect(screen.getByText("No branch matches.")).toBeInTheDocument();
  });
  it("switches on click and tells the page to refresh", async () => {
    m("gitSwitch").mockResolvedValue({ branch: "feat/login", created: false, stashed: false });
    const onChanged = vi.fn();
    render(ui(status(), { onChanged }));
    const u = await openIt();
    await u.click(screen.getByRole("button", { name: /feat\/login/ }));
    await waitFor(() => expect(m("gitSwitch")).toHaveBeenCalledWith("c", { name: "feat/login", stash: false }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });
  it("when changes would be overwritten it asks first, and only then stashes and switches", async () => {
    m("gitSwitch").mockRejectedValueOnce(new Error("Your unsaved changes would be overwritten by feat/login. Set them aside (stash)…")).mockResolvedValueOnce({ branch: "feat/login", created: false, stashed: true });
    render(ui(status([file("a.ts")])));
    const u = await openIt();
    await u.click(screen.getByRole("button", { name: /feat\/login/ }));
    const box = await screen.findByRole("group", { name: "Confirm stash and switch" });
    expect(m("gitSwitch")).toHaveBeenCalledTimes(1); // nothing stashed yet
    expect(screen.queryByRole("alert")).toBeNull(); // the confirm replaces the raw error
    await u.click(screen.getByRole("button", { name: "Set aside and switch" }));
    await waitFor(() => expect(m("gitSwitch")).toHaveBeenLastCalledWith("c", { name: "feat/login", stash: true }));
    await waitFor(() => expect(box).not.toBeInTheDocument());
  });
  it("shows other errors in plain view and keeps the list usable", async () => {
    m("gitSwitch").mockRejectedValue(new Error("A merge, rebase or cherry-pick is in progress in this folder."));
    render(ui(status()));
    const u = await openIt();
    await u.click(screen.getByRole("button", { name: /feat\/login/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("in progress");
    expect(screen.getByRole("button", { name: /feat\/login/ })).toBeEnabled();
  });
  it("creates a branch from the typed name, and refuses an empty one", async () => {
    m("gitSwitch").mockResolvedValue({ branch: "feat/new", created: true, stashed: false });
    render(ui(status()));
    const u = await openIt();
    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
    await u.type(screen.getByLabelText("Branch to create from here"), "  feat/new ");
    await u.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(m("gitSwitch")).toHaveBeenCalledWith("c", { name: "feat/new", create: true }));
    await waitFor(() => expect(screen.getByLabelText("Branch to create from here")).toHaveValue(""));
  });
  it("stash: set aside needs changes; restore and delete work, and delete asks first", async () => {
    m("gitStashes").mockResolvedValue({ stashes: [stash("half done")], more: 0 });
    m("gitStashPush").mockResolvedValue({ stashed: true });
    m("gitStashApply").mockResolvedValue({ applied: true, dropped: true });
    m("gitStashDrop").mockResolvedValue({ dropped: true });
    const { rerender } = render(ui(status()));
    const u = await openIt();
    expect(screen.getByRole("button", { name: /Set aside 0/ })).toBeDisabled();
    rerender(ui(status([file("a"), file("b")])));
    await u.type(screen.getByLabelText("Stash note"), "wip");
    await u.click(screen.getByRole("button", { name: "Set aside 2" }));
    await waitFor(() => expect(m("gitStashPush")).toHaveBeenCalledWith("c", { message: "wip" }));
    await u.click(await screen.findByRole("button", { name: "Restore stash: half done" }));
    await waitFor(() => expect(m("gitStashApply")).toHaveBeenCalledWith("c", "a".repeat(40), true));
    await u.click(screen.getByRole("button", { name: "Delete stash: half done" }));
    expect(m("gitStashDrop")).not.toHaveBeenCalled();
    await u.click(screen.getByRole("button", { name: "Keep" }));
    await u.click(screen.getByRole("button", { name: "Delete stash: half done" }));
    await u.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(m("gitStashDrop")).toHaveBeenCalledWith("c", "a".repeat(40)));
  });
  it("pauses switching, creating and restoring while a reply is running, but still lets you look", async () => {
    m("gitStashes").mockResolvedValue({ stashes: [stash("x")], more: 0 });
    render(ui(status([file("a")]), { busy: true }));
    await openIt();
    expect(screen.getByRole("button", { name: /feat\/login/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Restore stash: x" })).toBeDisabled();
    expect(screen.getByText(/Add login/)).toBeInTheDocument();
  });
  it("describes time in words", () => {
    const n = 1_000_000_000_000;
    expect(ago(n / 1000 - 5, n)).toBe("just now");
    expect(ago(n / 1000 - 300, n)).toBe("5 min ago");
    expect(ago(n / 1000 - 7200, n)).toBe("2 h ago");
    expect(ago(n / 1000 - 3 * 86400, n)).toBe("3 d ago");
    expect(ago(n / 1000 + 50, n)).toBe("just now"); // a clock a little ahead is not "in the future"
  });
});
