import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Composer } from "../src/Composer.tsx";
import { runningActivity } from "../src/components/composer/status-stack.tsx";
import { TID } from "../src/testids.ts";
import type { SeqEvent } from "../src/api.ts";

const base = { chatId: "c1", busy: false, offline: false, queue: [] as string[], hasMessages: true, onSend: vi.fn(), onStop: vi.fn(), onRemoveQueued: vi.fn() };
const box = () => screen.getByLabelText("Message") as HTMLTextAreaElement;
beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });

const run = (id: string, status: "running" | "done", source: "session" | "copilot" = "session") => ({
  type: "agent_update" as const, seq: 0, ts: 0, run: { id, parentChatId: "c1", name: `agent ${id}`, task: `task ${id}`, source, status, startedAt: 0, endedAt: null, result: "" },
});

describe("composer status stack", () => {
  it("is not drawn when nothing is running and nothing is queued", () => {
    render(<Composer {...base} />);
    expect(screen.queryByTestId(TID.statusStack)).toBeNull();
  });

  it("shows only the rows that have something in them, with counts", () => {
    render(<Composer {...base} queue={["next one"]} activity={[{ id: "a", name: "Scout", task: "look", kind: "subagent" }, { id: "b", name: "Watcher", task: "watch", kind: "subagent" }]} />);
    expect(screen.getByRole("button", { name: /2 Subagents/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /1 Queued/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Background/ })).toBeNull();
  });

  it("the queue is listed and each entry can be removed; the ridge hides and shows the card", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Composer {...base} queue={["one", "two"]} />);
    await user.click(screen.getByLabelText("Remove queued message 2"));
    expect(base.onRemoveQueued).toHaveBeenCalledWith(1);
    await user.click(screen.getByRole("button", { name: "Hide status" }));
    expect(screen.queryByLabelText("Remove queued message 2")).toBeNull();
    expect(localStorage.getItem("pheme-stack-collapsed:c1")).toBe("1");
    rerender(<Composer {...base} queue={["one", "two"]} />);
    expect(screen.queryByLabelText("Remove queued message 2")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Show status" }));
    expect(screen.getByLabelText("Remove queued message 2")).toBeInTheDocument();
  });

  it("runningActivity keeps only the newest state of each run that is still going", () => {
    const events = [run("a", "running"), run("b", "running", "copilot"), run("a", "done"), run("c", "running")] as SeqEvent[];
    expect(runningActivity(events).map((r) => [r.id, r.kind])).toEqual([["b", "background"], ["c", "subagent"]]);
  });
});

describe("composer box", () => {
  it("shows the branch strip with the behind count and changed files in a repository, and not outside one", () => {
    const { rerender } = render(<Composer {...base} git={{ branch: "main", behind: 2, changed: 1 }} />);
    const strip = screen.getByLabelText("Repository");
    expect(strip).toHaveTextContent("main");
    expect(strip).toHaveTextContent("↓2");
    expect(strip).toHaveTextContent("1 changed");
    rerender(<Composer {...base} git={null} />);
    expect(screen.queryByLabelText("Repository")).toBeNull();
  });

  it("Ctrl+Enter and Enter both queue while busy; Escape stops; an empty box while busy shows Stop", async () => {
    const user = userEvent.setup();
    render(<Composer {...base} busy />);
    expect(screen.getByTestId(TID.stopButton)).toBeInTheDocument();
    await user.type(box(), "queued by ctrl");
    await user.keyboard("{Control>}{Enter}{/Control}");
    expect(base.onSend).toHaveBeenLastCalledWith("queued by ctrl", []);
    await user.type(box(), "queued by meta");
    await user.keyboard("{Meta>}{Enter}{/Meta}");
    expect(base.onSend).toHaveBeenLastCalledWith("queued by meta", []);
    await user.keyboard("{Escape}");
    expect(base.onStop).toHaveBeenCalledTimes(1);
  });

  it("the + menu offers files and saved prompts", async () => {
    const user = userEvent.setup();
    render(<Composer {...base} />);
    await user.click(screen.getByRole("button", { name: "Add files or saved prompts" }));
    expect(await screen.findByRole("menuitem", { name: "Attach files or images" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Insert a saved prompt" })).toBeInTheDocument();
  });
});
