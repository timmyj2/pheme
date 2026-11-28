import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Transcript } from "../src/Transcript.tsx";
import { Thinking, thoughtLabel } from "../src/components/thread/Thinking.tsx";
import { StatusStack } from "../src/components/composer/status-stack.tsx";
import { buildBlocks, latestIntent, latestTodos } from "../src/blocks.ts";
import type { SeqEvent } from "../src/api.ts";
import { TID } from "../src/testids.ts";

let n = 0;
const ev = (e: object): SeqEvent => ({ ...e, seq: ++n, ts: Date.now() }) as SeqEvent;
const noop = () => {};
const props = (over: Partial<React.ComponentProps<typeof Transcript>> = {}) => ({
  events: [] as SeqEvent[], streaming: "", busy: false, loaded: true, pending: [], onAnswer: noop, onCopy: noop, onRetry: noop,
  onDismissPending: noop, onResendPending: noop, onSuggest: noop, ...over,
});

describe("Thinking disclosure", () => {
  it("shows Thinking with its text while live, then the measured time once finished", () => {
    const { rerender } = render(<Thinking text="Weighing two options" live since={Date.now()} />);
    expect(screen.getByText("Thinking")).toBeTruthy();
    expect(screen.getByText("Weighing two options")).toBeTruthy();
    // The same block, finished, keeps its preview open (as Hermes does).
    rerender(<Thinking text="Weighing two options" ms={12_000} />);
    expect(screen.getByText("Thought for 12s")).toBeTruthy();
    expect(screen.getByText("Weighing two options")).toBeTruthy();
  });

  it("a finished block that was never shown live starts collapsed", () => {
    render(<Thinking text="Weighing two options" ms={12_000} />);
    expect(screen.queryByText("Weighing two options")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Thought for 12s/ }));
    expect(screen.getByText("Weighing two options")).toBeTruthy();
  });

  it("labels short and unmeasured blocks", () => {
    expect(thoughtLabel(300)).toBe("Thought briefly");
    expect(thoughtLabel(undefined)).toBe("Thought");
    expect(thoughtLabel(75_000)).toBe("Thought for 1m 15s");
  });

  it("renders nothing without text", () => {
    const { container } = render(<Thinking text="  " live />);
    expect(container.firstChild).toBeNull();
  });

  it("hides the live preview when collapsed by default", () => {
    render(<Thinking text="Secret plan" live collapseThinking />);
    expect(screen.getByText("Thinking")).toBeTruthy();
    expect(screen.queryByText("Secret plan")).toBeNull();
  });
});

describe("Transcript reasoning, intent and progress", () => {
  it("renders nothing for thinking, intent or progress when the engine never sent them", () => {
    const { container } = render(<Transcript {...props({ events: [ev({ type: "user", text: "hi" }), ev({ type: "message", text: "Hello" })] })} />);
    expect(container.querySelector(`[data-testid="${TID.thinking}"]`)).toBeNull();
    expect(container.querySelector(`[data-testid="${TID.toolProgress}"]`)).toBeNull();
    expect(container.querySelector(`[data-testid="${TID.todoRow}"]`)).toBeNull();
  });

  it("keeps the final reasoning after a reload and shows it under its time", () => {
    const events = [
      ev({ type: "user", text: "why?" }),
      ev({ type: "reasoning", id: "r1", text: "Because the parser is strict.", ms: 2000 }),
      ev({ type: "message", text: "It is strict." }),
    ];
    render(<Transcript {...props({ events })} />);
    expect(screen.getByText("Thought for 2s")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Thought for 2s/ }));
    expect(screen.getByText("Because the parser is strict.")).toBeTruthy();
  });

  it("shows the live Thinking block with its preview while reasoning streams", () => {
    render(<Transcript {...props({ busy: true, thinking: { text: "Checking the tests", since: Date.now() } })} />);
    expect(screen.getByText("Thinking")).toBeTruthy();
    expect(screen.getByText("Checking the tests")).toBeTruthy();
  });

  it("uses the intent line in the working row, and the running tool's progress", () => {
    const events = [
      ev({ type: "turn_start" }),
      ev({ type: "intent", text: "Reading the config" }),
      ev({ type: "tool_start", id: "t1", name: "bash", args: { command: "ls" } }),
      ev({ type: "progress", id: "t1", text: "Scanning 12 files" }),
    ];
    const { container } = render(<Transcript {...props({ events, busy: true })} />);
    expect(container.querySelector(`[data-testid="${TID.workingRow}"]`)?.textContent).toContain("Reading the config");
    expect(screen.getByTestId(TID.toolProgress).textContent).toBe("Scanning 12 files");
    // The working line is a polite live region, so screen readers hear the hint change.
    expect(container.querySelector(`[data-testid="${TID.workingRow}"] [role="status"]`)).toHaveAttribute("aria-live", "polite");
  });

  it("drops the intent once the turn has ended", () => {
    expect(latestIntent([ev({ type: "intent", text: "Old" }), ev({ type: "idle" })])).toBeUndefined();
    expect(latestIntent([ev({ type: "intent", text: "Now" })])).toBe("Now");
  });
});

describe("todos and the status stack", () => {
  it("hides a todo list once every item is done, and shows an unfinished one", () => {
    expect(latestTodos([ev({ type: "todos", items: [{ id: "1", title: "A", status: "done" }] })])).toBeUndefined();
    const open = [{ id: "1", title: "A", status: "done" }, { id: "2", title: "B", status: "in_progress" }];
    expect(latestTodos([ev({ type: "todos", items: [{ id: "1", title: "A", status: "pending" }] }), ev({ type: "todos", items: open })])).toEqual(open);
  });

  it("adds a Todos row only when there is a list", () => {
    const { rerender, container } = render(<StatusStack chatId="c" activity={[]} queue={[]} onRemoveQueued={noop} />);
    expect(container.querySelector(`[data-testid="${TID.statusStack}"]`)).toBeNull();
    rerender(<StatusStack chatId="c" activity={[]} queue={[]} onRemoveQueued={noop} todos={[{ id: "1", title: "Read files", status: "in_progress" }]} />);
    expect(screen.getByText("Todos")).toBeTruthy();
    expect(screen.getByText("Read files")).toBeTruthy();
  });
});

describe("buildBlocks", () => {
  it("turns a final reasoning event into a thinking block and never shows deltas", () => {
    const blocks = buildBlocks([ev({ type: "reasoning", id: "r", text: "x", ms: 900 })]);
    expect(blocks).toEqual([expect.objectContaining({ kind: "thinking", text: "x", ms: 900 })]);
  });
});

void vi;
