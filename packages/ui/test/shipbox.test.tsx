import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ShipBox } from "../src/ShipBox.tsx";
import { api, type GitStatus, type RemoteInfo } from "../src/api.ts";
import { ToastProvider } from "../src/toast.tsx";

vi.mock("../src/api.ts", async (orig) => {
  const actual = await orig<typeof import("../src/api.ts")>();
  return { ...actual, api: { ...actual.api, gitRemote: vi.fn(), gitPush: vi.fn(), gitPr: vi.fn() } };
});
const gitRemote = api.gitRemote as unknown as ReturnType<typeof vi.fn>;
const gitPush = api.gitPush as unknown as ReturnType<typeof vi.fn>;
const gitPr = api.gitPr as unknown as ReturnType<typeof vi.fn>;

const status = (extra: Partial<GitStatus> = {}): GitStatus => ({ repo: true, branch: "feat/x", hasCommits: true, files: [], ...extra });
const remote = (extra: Partial<RemoteInfo> = {}): RemoteInfo => ({ remote: "origin", url: "https://github.com/o/r.git", github: true, ghInstalled: true, ghSignedIn: true, branch: "feat/x", upstream: "origin/feat/x", ahead: 0, behind: 0, defaultBase: "main", ...extra });
const ui = (over: { busy?: boolean; onDone?: () => void } = {}, st = status()) => (
  <ToastProvider><ShipBox chatId="c1" status={st} busy={over.busy ?? false} suggestedTitle="Add the thing" onDone={over.onDone ?? (() => {})} /></ToastProvider>
);
beforeEach(() => { gitRemote.mockReset(); gitPush.mockReset(); gitPr.mockReset(); });

describe("ShipBox", () => {
  it("pushes after a confirm step, then reloads", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    gitRemote.mockResolvedValueOnce(remote({ upstream: undefined, ahead: 0 })).mockResolvedValue(remote());
    gitPush.mockResolvedValue({ branch: "feat/x", remote: "origin", output: "" });
    render(ui({ onDone }));
    expect(await screen.findByText(/not pushed yet/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Push feat\/x…/ }));
    expect(screen.getByRole("group", { name: "Confirm push" })).toHaveTextContent(/never force-pushes/);
    expect(gitPush).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Push" }));
    expect(gitPush).toHaveBeenCalledWith("c1");
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(await screen.findByText(/up to date/)).toBeInTheDocument();
  });

  it("shows the server's reason when a push is rejected", async () => {
    const user = userEvent.setup();
    gitRemote.mockResolvedValue(remote({ ahead: 2 }));
    gitPush.mockRejectedValue(new Error("GitHub already has different commits on this branch. Pheme never force-pushes."));
    render(ui());
    await user.click(await screen.findByRole("button", { name: /Push feat\/x…/ }));
    await user.click(screen.getByRole("button", { name: "Push" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/never force-pushes/);
    expect(screen.queryByRole("group", { name: "Confirm push" })).toBeNull();
  });

  it("opens a PR with an editable pre-filled title, description and draft option", async () => {
    const user = userEvent.setup();
    gitRemote.mockResolvedValue(remote());
    gitPr.mockResolvedValue({ url: "https://github.com/o/r/pull/9", number: 9 });
    render(ui());
    await user.click(await screen.findByRole("button", { name: /Open pull request…/ }));
    const title = screen.getByLabelText("Pull request title");
    expect(title).toHaveValue("Add the thing");
    await user.clear(title);
    await user.type(title, "Better title");
    await user.type(screen.getByLabelText("Pull request description"), "Why it matters");
    await user.click(screen.getByRole("checkbox", { name: /draft/ }));
    await user.click(screen.getByRole("button", { name: "Open pull request" }));
    expect(gitPr).toHaveBeenCalledWith("c1", { title: "Better title", body: "Why it matters", draft: true });
  });

  it("will not open a PR with an empty title", async () => {
    const user = userEvent.setup();
    gitRemote.mockResolvedValue(remote());
    render(ui());
    await user.click(await screen.findByRole("button", { name: /Open pull request…/ }));
    await user.clear(screen.getByLabelText("Pull request title"));
    expect(screen.getByRole("button", { name: "Open pull request" })).toBeDisabled();
  });

  it("shows an existing PR with its checks instead of offering a new one", async () => {
    gitRemote.mockResolvedValue(remote({ pr: { number: 7, url: "https://github.com/o/r/pull/7", title: "Existing", state: "OPEN", draft: true, checks: "failing" } }));
    render(ui());
    const link = await screen.findByRole("link", { name: /#7 Existing/ });
    expect(link).toHaveAttribute("href", "https://github.com/o/r/pull/7");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(screen.getByText(/Draft · ✗ Checks failing/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Open pull request/ })).toBeNull();
  });

  it("explains each reason a PR cannot be opened, with a GitHub link as the fallback", async () => {
    gitRemote.mockResolvedValue(remote({ ghInstalled: false, compareUrl: "https://github.com/o/r/compare/main...feat/x?expand=1" }));
    const { unmount } = render(ui());
    expect(await screen.findByText(/GitHub CLI \(gh\) is not installed/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open it on GitHub instead/ })).toHaveAttribute("href", expect.stringContaining("/compare/main...feat/x"));
    unmount();
    gitRemote.mockResolvedValue(remote({ ghSignedIn: false }));
    const b = render(ui());
    expect(await screen.findByText(/not signed in/)).toBeInTheDocument();
    b.unmount();
    gitRemote.mockResolvedValue(remote({ github: false }));
    render(ui());
    expect(await screen.findByText(/for GitHub remotes/)).toBeInTheDocument();
  });

  it("disables Push while a reply is running, and shows problems and load errors plainly", async () => {
    gitRemote.mockResolvedValue(remote({ ahead: 1 }));
    const { rerender } = render(ui({ busy: true }));
    expect(await screen.findByRole("button", { name: /Push feat\/x…/ })).toBeDisabled();
    gitRemote.mockResolvedValue(remote({ problem: "This repository has no remote yet." }));
    rerender(ui({ busy: false }, status({ branch: "other" })));
    expect(await screen.findByText(/no remote yet/)).toBeInTheDocument();
    gitRemote.mockRejectedValue(new Error("Can't reach Pheme."));
    rerender(ui({}, status({ branch: "third" })));
    expect(await screen.findByRole("alert")).toHaveTextContent("Can't reach Pheme.");
  });

  it("warns when GitHub is ahead of you", async () => {
    gitRemote.mockResolvedValue(remote({ behind: 3, ahead: 1 }));
    render(ui());
    expect(await screen.findByText(/GitHub has 3 commits you do not/)).toBeInTheDocument();
  });
});
