import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CommitBox, suggestBranch, suggestMessage } from "../src/CommitBox.tsx";
import { api, type ChangedFile, type GitStatus } from "../src/api.ts";
import { ToastProvider } from "../src/toast.tsx";

vi.mock("../src/api.ts", async (orig) => {
  const actual = await orig<typeof import("../src/api.ts")>();
  return { ...actual, api: { ...actual.api, gitCommit: vi.fn(), gitUndo: vi.fn() } };
});
const gitCommit = api.gitCommit as unknown as ReturnType<typeof vi.fn>;
const gitUndo = api.gitUndo as unknown as ReturnType<typeof vi.fn>;
const f = (p: Partial<ChangedFile> & { path: string }): ChangedFile => ({ staged: "", unstaged: "modified", additions: 1, deletions: 0, binary: false, ...p });
const st = (files: ChangedFile[], extra: Partial<GitStatus> = {}): GitStatus => ({ repo: true, branch: "feat/x", hasCommits: true, files, ...extra });
const ui = (status: GitStatus, over: { busy?: boolean; onDone?: () => void } = {}) => (
  <ToastProvider><CommitBox chatId="c1" status={status} busy={over.busy ?? false} onDone={over.onDone ?? (() => {})} /></ToastProvider>
);
beforeEach(() => { gitCommit.mockReset(); gitUndo.mockReset(); });

describe("suggestions", () => {
  it("drafts a message and a branch name", () => {
    expect(suggestMessage([f({ path: "src/a.ts" })])).toBe("Update a.ts");
    expect(suggestMessage([f({ path: "n.ts", unstaged: "untracked" })])).toBe("Add n.ts");
    expect(suggestMessage(["a", "b", "c", "d"].map((p) => f({ path: p })))).toBe("Update a, b, c and 1 more");
    expect(suggestMessage([])).toBe("");
    expect(suggestBranch("Fix the login bug!")).toBe("pheme/fix-the-login-bug");
    expect(suggestBranch("")).toBe("pheme/changes");
  });
});

describe("CommitBox", () => {
  it("pre-fills the message, commits the ticked files after a confirm step, then offers Undo", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    gitCommit.mockResolvedValue({ sha: "abc1234def", short: "abc1234", branch: "feat/x", summary: "Update a.ts", files: 1 });
    gitUndo.mockResolvedValue({ undone: "abc1234" });
    render(ui(st([f({ path: "a.ts" }), f({ path: "b.ts" })]), { onDone }));
    expect(screen.getByLabelText("Commit message")).toHaveValue("Update a.ts, b.ts");
    await user.click(screen.getByRole("checkbox", { name: /b\.ts/ })); // untick b
    expect(screen.getByLabelText("Commit message")).toHaveValue("Update a.ts");
    await user.click(screen.getByRole("button", { name: /Commit 1 file…/ }));
    expect(screen.getByRole("group", { name: "Confirm commit" })).toHaveTextContent("on feat/x");
    expect(gitCommit).not.toHaveBeenCalled(); // nothing happens until the confirm click
    await user.click(screen.getByRole("button", { name: "Commit" }));
    expect(gitCommit).toHaveBeenCalledWith("c1", { message: "Update a.ts", paths: ["a.ts"], branch: undefined, allowRisky: [] });
    await waitFor(() => expect(document.querySelector(".commit-done")).toHaveTextContent("abc1234 on feat/x: Update a.ts"));
    expect(onDone).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(gitUndo).toHaveBeenCalledWith("c1", "abc1234def");
    await waitFor(() => expect(screen.queryByRole("button", { name: "Undo" })).toBeNull());
  });

  it("on main it asks for a new branch (pre-filled) and sends it", async () => {
    const user = userEvent.setup();
    gitCommit.mockResolvedValue({ sha: "s1", short: "s1", branch: "pheme/update-a-ts", summary: "x", files: 1 });
    render(ui(st([f({ path: "a.ts" })], { branch: "main", protectedBranch: true })));
    const branch = screen.getByLabelText("New branch name");
    expect(branch).toHaveValue("pheme/update-a-ts");
    await user.click(screen.getByRole("button", { name: /Commit 1 file…/ }));
    expect(screen.getByRole("group", { name: "Confirm commit" })).toHaveTextContent("new branch pheme/update-a-ts");
    await user.click(screen.getByRole("button", { name: "Commit" }));
    expect(gitCommit).toHaveBeenCalledWith("c1", expect.objectContaining({ branch: "pheme/update-a-ts" }));
  });

  it("blocks Commit with a reason when nothing is ticked, the message is empty, the branch is empty, or a reply is running", async () => {
    const user = userEvent.setup();
    const { rerender } = render(ui(st([f({ path: "a.ts" })])));
    const commitBtn = () => screen.getByRole("button", { name: /Commit/ });
    await user.clear(screen.getByLabelText("Commit message"));
    expect(commitBtn()).toBeDisabled();
    expect(screen.getByText("Write a commit message.")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Commit message"), "Hello");
    expect(commitBtn()).toBeEnabled();
    await user.click(screen.getByRole("checkbox", { name: /a\.ts/ }));
    expect(screen.getByText("Tick at least one file.")).toBeInTheDocument();
    rerender(ui(st([f({ path: "a.ts" })]), { busy: true }));
    expect(screen.getByText(/A reply is running/)).toBeInTheDocument();
  });

  it("never pre-ticks secret-looking files, and needs a separate acknowledgement to commit one", async () => {
    const user = userEvent.setup();
    gitCommit.mockResolvedValue({ sha: "s2", short: "s2", branch: "feat/x", summary: "x", files: 1 });
    render(ui(st([f({ path: "ok.ts" }), f({ path: ".env", risky: true })])));
    expect(screen.getByRole("checkbox", { name: /\.env/ })).not.toBeChecked();
    expect(screen.getByText(/secret\?/)).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /\.env/ }));
    await user.click(screen.getByRole("button", { name: /Commit 2 files…/ }));
    const go = screen.getByRole("button", { name: "Commit" });
    expect(go).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: /I understand/ }));
    expect(go).toBeEnabled();
    await user.click(go);
    expect(gitCommit).toHaveBeenCalledWith("c1", expect.objectContaining({ allowRisky: [".env"], paths: expect.arrayContaining(["ok.ts", ".env"]) }));
  });

  it("shows the server's reason on failure and keeps the message; changing the selection cancels a pending confirm", async () => {
    const user = userEvent.setup();
    gitCommit.mockRejectedValue(new Error("lint failed: no TODOs allowed"));
    render(ui(st([f({ path: "a.ts" }), f({ path: "b.ts" })])));
    await user.click(screen.getByRole("button", { name: /Commit 2 files…/ }));
    await user.click(screen.getByRole("checkbox", { name: /b\.ts/ }));
    expect(screen.queryByRole("group", { name: "Confirm commit" })).toBeNull(); // selection changed => confirm dropped
    await user.click(screen.getByRole("button", { name: /Commit 1 file…/ }));
    await user.click(screen.getByRole("button", { name: "Commit" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("lint failed: no TODOs allowed");
    expect(screen.getByLabelText("Commit message")).toHaveValue("Update a.ts");
  });

  it("leaves conflicted files out and picks up new files that appear later", async () => {
    const { rerender } = render(ui(st([f({ path: "a.ts" }), f({ path: "c.ts", staged: "conflicted", unstaged: "conflicted" })])));
    expect(screen.queryByRole("checkbox", { name: /c\.ts/ })).toBeNull();
    rerender(ui(st([f({ path: "a.ts" }), f({ path: "late.ts", unstaged: "untracked" })])));
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /late\.ts/ })).toBeChecked());
  });

  it("an undo that the server refuses is explained and does not lose the commit info", async () => {
    const user = userEvent.setup();
    gitCommit.mockResolvedValue({ sha: "aaa1111", short: "aaa1111", branch: "feat/x", summary: "s", files: 1 });
    gitUndo.mockRejectedValue(new Error("This commit has already been pushed, so it cannot be undone from here."));
    render(ui(st([f({ path: "a.ts" })])));
    await user.click(screen.getByRole("button", { name: /Commit 1 file…/ }));
    await user.click(screen.getByRole("button", { name: "Commit" }));
    await user.click(await screen.findByRole("button", { name: "Undo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/already been pushed/);
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
  });
});
