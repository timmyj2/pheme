import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChangesPanel, DiffView } from "../src/ChangesPanel.tsx";
import { ProjectBar } from "../src/ProjectBar.tsx";
import { api, type ChangedFile, type GitStatus } from "../src/api.ts";
import { useGit } from "../src/useGit.ts";

vi.mock("../src/api.ts", async (orig) => {
  const actual = await orig<typeof import("../src/api.ts")>();
  return { ...actual, api: { ...actual.api, gitStatus: vi.fn(), gitDiff: vi.fn() } };
});
const gitStatus = api.gitStatus as unknown as ReturnType<typeof vi.fn>;
const gitDiff = api.gitDiff as unknown as ReturnType<typeof vi.fn>;

const file = (p: Partial<ChangedFile> & { path: string }): ChangedFile => ({ staged: "", unstaged: "modified", additions: 1, deletions: 0, binary: false, ...p });
const status = (files: ChangedFile[], extra: Partial<GitStatus> = {}): GitStatus => ({ repo: true, branch: "main", hasCommits: true, files, ...extra });
beforeEach(() => { gitStatus.mockReset(); gitDiff.mockReset(); });

describe("DiffView", () => {
  it("colours added/removed/hunk lines and never renders file content as HTML", () => {
    const { container } = render(<DiffView diff={'@@ -1 +1 @@\n-old\n+<img src=x onerror="alert(1)">\n ctx'} />);
    expect(container.querySelector(".dl.hunk")).toBeTruthy();
    expect(container.querySelector(".dl.del")?.textContent).toContain("old");
    expect(container.querySelector(".dl.add")?.textContent).toContain("<img src=x");
    expect(container.querySelector("img")).toBeNull();
  });
});

describe("ChangesPanel", () => {
  const props = { chatId: "c1", error: "", loading: false, onRefresh: vi.fn(), onClose: vi.fn() };

  it("groups files into Staged / Changes / Untracked / Conflicts with counts and badges", () => {
    const s = status([
      file({ path: "a.ts", additions: 3, deletions: 1 }),
      file({ path: "s.ts", staged: "added", unstaged: "" }),
      file({ path: "n.ts", unstaged: "untracked" }),
      file({ path: "c.ts", staged: "conflicted", unstaged: "conflicted" }),
      file({ path: "img.png", binary: true }),
    ]);
    render(<ChangesPanel {...props} status={s} />);
    for (const h of ["Conflicts", "Staged", "Unstaged", "Untracked"]) expect(screen.getByRole("heading", { name: new RegExp(h) })).toBeInTheDocument();
    expect(screen.getByText("+3")).toBeInTheDocument();
    expect(screen.getByText("binary")).toBeInTheDocument();
    expect(screen.getByLabelText("Conflict")).toBeInTheDocument();
  });

  it("explains a non-repo folder, a clean tree, errors, and extra hidden files", () => {
    const { rerender } = render(<ChangesPanel {...props} status={{ repo: false, files: [], problem: "This folder is not a Git repository." }} />);
    expect(screen.getByText(/not a Git repository/)).toBeInTheDocument();
    rerender(<ChangesPanel {...props} status={status([])} />);
    expect(screen.getByText(/working tree is clean/)).toBeInTheDocument();
    rerender(<ChangesPanel {...props} status={status([file({ path: "x" })], { moreFiles: 12 })} />);
    expect(screen.getByText(/and 12 more files/)).toBeInTheDocument();
    rerender(<ChangesPanel {...props} status={null} error="Can't reach Pheme." />);
    expect(screen.getByRole("alert")).toHaveTextContent("Can't reach Pheme.");
  });

  it("loads a file's diff on expand, handles binary/empty/error/truncated, and refresh/close work", async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn(), onClose = vi.fn();
    gitDiff.mockResolvedValueOnce({ path: "a.ts", diff: "@@ -1 +1 @@\n-a\n+b\n", binary: false, truncated: true });
    render(<ChangesPanel {...props} onRefresh={onRefresh} onClose={onClose} status={status([file({ path: "a.ts" })])} />);
    await user.click(screen.getByRole("button", { name: /a\.ts/ }));
    expect(await screen.findByText("+b")).toBeInTheDocument();
    expect(screen.getByText(/cut short/)).toBeInTheDocument();
    expect(gitDiff).toHaveBeenCalledWith("c1", "a.ts");
    await user.click(screen.getByRole("button", { name: /a\.ts/ })); // collapse
    expect(screen.queryByText("+b")).toBeNull();
    gitDiff.mockRejectedValueOnce(new Error("boom"));
    await user.click(screen.getByRole("button", { name: /a\.ts/ }));
    expect(await screen.findByText("boom")).toBeInTheDocument();
    await user.click(screen.getByLabelText("Refresh changes"));
    await user.click(screen.getByLabelText("Close changes"));
    expect(onRefresh).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("shows a friendly line for a binary diff and an empty one", async () => {
    const user = userEvent.setup();
    gitDiff.mockResolvedValueOnce({ path: "i.png", diff: "", binary: true, truncated: false });
    render(<ChangesPanel {...props} status={status([file({ path: "i.png", binary: true })])} />);
    await user.click(screen.getByRole("button", { name: /i\.png/ }));
    expect(await screen.findByText(/Binary file/)).toBeInTheDocument();
  });
});

describe("ProjectBar", () => {
  const base = { status: null, busy: false, panelOpen: false, filesOpen: false, onTogglePanel: vi.fn(), onToggleFiles: vi.fn() };

  it("asks for a folder when none is set, validates server errors inline, and closes on success", async () => {
    const user = userEvent.setup();
    const onSetDir = vi.fn().mockRejectedValueOnce(new Error("That folder does not exist: /nope")).mockResolvedValueOnce(undefined);
    render(<ProjectBar {...base} dir={undefined} onSetDir={onSetDir} />);
    await user.click(screen.getByText(/Choose a project folder/));
    const input = screen.getByLabelText("Folder path");
    expect(input).toHaveFocus();
    expect(screen.getByText("Use this folder")).toBeDisabled(); // empty input
    await user.type(input, "/nope");
    await user.click(screen.getByText("Use this folder"));
    expect(await screen.findByRole("alert")).toHaveTextContent("does not exist");
    expect(screen.getByRole("dialog")).toBeInTheDocument(); // stays open to fix it
    await user.click(screen.getByText("Use this folder"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onSetDir).toHaveBeenLastCalledWith("/nope");
  });

  it("shows folder name, branch with ahead/behind and a change count; Remove clears it; busy blocks edits", async () => {
    const user = userEvent.setup();
    const onSetDir = vi.fn().mockResolvedValue(undefined);
    const s = status([file({ path: "a" }), file({ path: "b" })], { branch: "feat/x", ahead: 2, behind: 1, upstream: "origin/feat/x" });
    const { rerender } = render(<ProjectBar {...base} dir="/Users/me/proj" status={s} onSetDir={onSetDir} />);
    expect(screen.getByText("proj")).toBeInTheDocument();
    expect(screen.getByText(/feat\/x ↑2 ↓1/)).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    await user.click(screen.getByLabelText(/Project folder \/Users\/me\/proj/));
    await user.click(screen.getByText("Remove folder"));
    expect(onSetDir).toHaveBeenCalledWith(null);
    rerender(<ProjectBar {...base} dir="/Users/me/proj" status={s} busy onSetDir={onSetDir} />);
    await user.click(screen.getByLabelText(/Project folder/));
    expect(screen.getByText(/A reply is running/)).toBeInTheDocument();
    expect(screen.getByText("Use this folder")).toBeDisabled();
  });

  it("handles Windows paths and toggles the panel", async () => {
    const user = userEvent.setup();
    const onTogglePanel = vi.fn();
    render(<ProjectBar {...base} onTogglePanel={onTogglePanel} dir={"C:\\Users\\me\\my project"} onSetDir={vi.fn()} />);
    expect(screen.getByText("my project")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Changes/ }));
    expect(onTogglePanel).toHaveBeenCalled();
  });
});

describe("useGit", () => {
  it("loads status, refreshes when a reply finishes, ignores a stale response, and clears with no folder", async () => {
    gitStatus.mockResolvedValue(status([file({ path: "a" })]));
    const h = renderHook(({ busy, dir }) => useGit("c1", dir, false, busy), { initialProps: { busy: true, dir: "/p" as string | undefined } });
    await waitFor(() => expect(h.result.current.status?.files).toHaveLength(1));
    expect(gitStatus).toHaveBeenCalledTimes(1);
    gitStatus.mockResolvedValue(status([file({ path: "a" }), file({ path: "b" })]));
    h.rerender({ busy: false, dir: "/p" }); // the reply finished: files may have changed
    await waitFor(() => expect(h.result.current.status?.files).toHaveLength(2));
    h.rerender({ busy: false, dir: undefined });
    await waitFor(() => expect(h.result.current.status).toBeNull());
  });

  it("only the newest of two overlapping requests wins", async () => {
    let first!: (s: GitStatus) => void;
    gitStatus.mockImplementationOnce(() => new Promise<GitStatus>((r) => { first = r; }));
    gitStatus.mockResolvedValueOnce(status([file({ path: "new" })]));
    const h = renderHook(() => useGit("c1", "/p", false, false));
    await act(async () => { await h.result.current.refresh(); });
    await waitFor(() => expect(h.result.current.status?.files[0].path).toBe("new"));
    await act(async () => { first(status([file({ path: "OLD" })])); });
    expect(h.result.current.status?.files[0].path).toBe("new");
  });

  it("reports a failure and keeps working afterwards", async () => {
    gitStatus.mockRejectedValueOnce(new Error("offline"));
    const h = renderHook(() => useGit("c1", "/p", false, false));
    await waitFor(() => expect(h.result.current.error).toBe("offline"));
    gitStatus.mockResolvedValueOnce(status([]));
    await act(async () => { await h.result.current.refresh(); });
    expect(h.result.current.error).toBe("");
  });
});
