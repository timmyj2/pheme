import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Transcript } from "../src/Transcript.tsx";
import type { SeqEvent } from "../src/api.ts";
import { TID } from "../src/testids.ts";

let n = 0;
const ev = (e: object): SeqEvent => ({ ...e, seq: ++n, ts: Date.now() }) as SeqEvent;
const noop = () => {};
const props = (over: Partial<React.ComponentProps<typeof Transcript>> = {}) => ({
  events: [] as SeqEvent[], streaming: "", busy: false, loaded: true, pending: [], onAnswer: noop, onCopy: noop, onRetry: noop,
  onDismissPending: noop, onResendPending: noop, onSuggest: noop, ...over,
});

// jsdom has no layout, so give the scroller a size we control.
function metrics(el: HTMLElement, m: { scrollHeight: number; clientHeight: number; scrollTop: number }) {
  Object.defineProperty(el, "scrollHeight", { configurable: true, get: () => m.scrollHeight });
  Object.defineProperty(el, "clientHeight", { configurable: true, get: () => m.clientHeight });
  Object.defineProperty(el, "scrollTop", { configurable: true, get: () => m.scrollTop, set: (v: number) => { m.scrollTop = v; } });
  el.scrollTo = ((o: ScrollToOptions) => { m.scrollTop = o.top ?? 0; }) as never;
}

describe("Transcript", () => {
  it("shows suggestions on an empty chat and sends the clicked one to the composer", async () => {
    const onSuggest = vi.fn();
    render(<Transcript {...props({ onSuggest })} />);
    await userEvent.setup().click(screen.getByText("What can you do?"));
    expect(onSuggest).toHaveBeenCalledWith("What can you do?");
  });

  it("shows a loading skeleton until the chat has loaded", () => {
    render(<Transcript {...props({ loaded: false })} />);
    expect(screen.getByLabelText("Loading chat")).toBeInTheDocument();
    expect(screen.queryByText("What can I help with?")).toBeNull();
  });

  it("renders messages, copies them, and offers 'Try again' only on the latest reply when idle", async () => {
    n = 0;
    const user = userEvent.setup();
    const onCopy = vi.fn();
    const onRetry = vi.fn();
    const events = [ev({ type: "user", text: "q1" }), ev({ type: "message", text: "a1" }), ev({ type: "user", text: "q2" }), ev({ type: "message", text: "a2" })];
    const { rerender } = render(<Transcript {...props({ events, onCopy, onRetry })} />);
    expect(screen.getAllByLabelText("Try again")).toHaveLength(1);
    await user.click(screen.getAllByLabelText("Copy message")[0]);
    expect(onCopy).toHaveBeenCalledWith("a1");
    await user.click(screen.getByLabelText("Try again"));
    expect(onRetry).toHaveBeenCalledWith("q2");
    rerender(<Transcript {...props({ events, busy: true, onCopy, onRetry })} />);
    expect(screen.queryByLabelText("Try again")).toBeNull();
  });

  it("approval cards answer from their buttons, then settle to one line; stale ones say expired", async () => {
    n = 0;
    const user = userEvent.setup();
    const onAnswer = vi.fn();
    const req = ev({ type: "approval_request", id: "p1", kind: "shell", title: "Run shell command", detail: "rm -rf /tmp/x" });
    const { rerender } = render(<Transcript {...props({ events: [req], busy: true, onAnswer })} />);
    expect(screen.getByText("Command")).toBeInTheDocument();
    await user.click(screen.getByText("Allow this session"));
    expect(onAnswer).toHaveBeenCalledWith("p1", "chat");
    await user.click(screen.getByText("Reject"));
    expect(onAnswer).toHaveBeenCalledWith("p1", "deny");
    await user.click(screen.getByTestId(TID.approvalAllowOnce));
    expect(onAnswer).toHaveBeenLastCalledWith("p1", "once");
    rerender(<Transcript {...props({ events: [req, ev({ type: "approval_resolved", id: "p1", decision: "deny" })], busy: true, onAnswer })} />);
    expect(screen.queryByTestId(TID.approval)).toBeNull();
    expect(screen.getByText(/Rejected · Run shell command/)).toBeInTheDocument();
    rerender(<Transcript {...props({ events: [req], busy: false, onAnswer })} />);
    expect(screen.getByText(/Approval expired/)).toBeInTheDocument();
  });

  it("stacks pending approvals with a 1 / N counter; Enter runs the top card and Escape rejects it", () => {
    n = 0;
    const onAnswer = vi.fn();
    const reqs = [1, 2, 3].map((i) => ev({ type: "approval_request", id: `p${i}`, kind: "shell", title: "Run shell command", detail: `cmd ${i}` }));
    const { rerender } = render(<Transcript {...props({ events: reqs, busy: true, onAnswer })} />);
    expect(screen.getByTestId(TID.approvalCounter)).toHaveTextContent("1 / 3");
    expect(screen.getAllByTestId(TID.approval)).toHaveLength(1); // only the front card is live
    fireEvent.keyDown(document.body, { key: "Enter" });
    expect(onAnswer).toHaveBeenLastCalledWith("p1", "once");
    fireEvent.keyUp(document.body, { key: "Enter" });
    rerender(<Transcript {...props({ events: [...reqs, ev({ type: "approval_resolved", id: "p1", decision: "once" })], busy: true, onAnswer })} />);
    expect(screen.getByTestId(TID.approvalCounter)).toHaveTextContent("1 / 2");
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onAnswer).toHaveBeenLastCalledWith("p2", "deny");
  });

  it("holding Enter does not approve the next card", () => {
    n = 0;
    const onAnswer = vi.fn();
    const reqs = [1, 2].map((i) => ev({ type: "approval_request", id: `p${i}`, kind: "shell", title: "Run shell command", detail: `cmd ${i}` }));
    const { rerender } = render(<Transcript {...props({ events: reqs, busy: true, onAnswer })} />);
    fireEvent.keyDown(document.body, { key: "Enter" });
    expect(onAnswer).toHaveBeenCalledTimes(1);
    rerender(<Transcript {...props({ events: [...reqs, ev({ type: "approval_resolved", id: "p1", decision: "once" })], busy: true, onAnswer })} />);
    // the key is still down: auto-repeat, and a keydown without a keyup, must not answer the second card
    fireEvent.keyDown(document.body, { key: "Enter", repeat: true });
    fireEvent.keyDown(document.body, { key: "Enter" });
    expect(onAnswer).toHaveBeenCalledTimes(1);
    fireEvent.keyUp(document.body, { key: "Enter" });
    fireEvent.keyDown(document.body, { key: "Enter" });
    expect(onAnswer).toHaveBeenCalledTimes(2);
    expect(onAnswer).toHaveBeenLastCalledWith("p2", "once");
  });

  it("Enter in a text field that has text sends the message and does not answer the card", () => {
    n = 0;
    const onAnswer = vi.fn();
    const req = ev({ type: "approval_request", id: "p1", kind: "shell", title: "Run", detail: "ls" });
    render(<><textarea data-testid="fake-composer" defaultValue="draft" /><Transcript {...props({ events: [req], busy: true, onAnswer })} /></>);
    fireEvent.keyDown(screen.getByTestId("fake-composer"), { key: "Enter" });
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it("a tool name nobody maps falls back to 'Used tool' and does not crash", async () => {
    n = 0;
    const user = userEvent.setup();
    const events = [ev({ type: "tool_start", id: "x", name: "mystery_tool", args: { foo: 1 } }), ev({ type: "tool_end", id: "x", name: "mystery_tool", ok: true, result: "fine" })];
    render(<Transcript {...props({ events })} />);
    expect(screen.getByText("Used tool")).toBeInTheDocument();
    await user.click(screen.getByText("Used tool"));
    expect(screen.getByText("fine")).toBeInTheDocument();
  });

  it("an edit call shows its diff open; closing the row hides it", async () => {
    n = 0;
    const user = userEvent.setup();
    const events = [
      ev({ type: "tool_start", id: "e", name: "edit", args: { path: "a.txt", old_str: "one\ntwo", new_str: "one\n2" } }),
      ev({ type: "tool_end", id: "e", name: "edit", ok: true, result: "" }),
    ];
    render(<Transcript {...props({ events })} />);
    expect(screen.getByText("Edited file")).toBeInTheDocument();
    const kinds = screen.getAllByTestId(TID.diffLine).map((el) => el.getAttribute("data-kind"));
    expect(kinds).toContain("del");
    expect(kinds).toContain("add");
    await user.click(screen.getByText("Edited file"));
    expect(screen.queryAllByTestId(TID.diffLine)).toHaveLength(0);
  });

  it("a finished shell call shows the command strip with its exit code", async () => {
    n = 0;
    const user = userEvent.setup();
    const events = [ev({ type: "tool_start", id: "b", name: "bash", args: { command: "npm test" } }), ev({ type: "tool_end", id: "b", name: "bash", ok: true, result: "all good\n<exited with exit code 0>" })];
    render(<Transcript {...props({ events })} />);
    await user.click(screen.getByText("Ran command"));
    expect(screen.getByText("exit 0")).toBeInTheDocument();
  });

  it("folds consecutive calls into one summary; the live ticker shows while running", async () => {
    n = 0;
    const user = userEvent.setup();
    const events = [
      ev({ type: "tool_start", id: "a", name: "view", args: { path: "one.ts" } }), ev({ type: "tool_end", id: "a", name: "view", ok: true, result: "" }),
      ev({ type: "tool_start", id: "b", name: "view", args: { path: "two.ts" } }), ev({ type: "tool_end", id: "b", name: "view", ok: true, result: "" }),
      ev({ type: "tool_start", id: "c", name: "bash", args: { command: "npm run lint" } }),
    ];
    const { rerender } = render(<Transcript {...props({ events, busy: true })} />);
    expect(screen.getByTestId(TID.runSummary)).toHaveTextContent("Explored 2 files, running npm run lint");
    expect(screen.getByTestId(TID.toolTicker)).toBeInTheDocument();
    rerender(<Transcript {...props({ events: [...events, ev({ type: "tool_end", id: "c", name: "bash", ok: true, result: "" })], busy: false })} />);
    expect(screen.queryByTestId(TID.toolTicker)).toBeNull();
    expect(screen.getByTestId(TID.runSummary)).toHaveTextContent("Explored 2 files, ran npm run lint");
    await user.click(screen.getByTestId(TID.runSummary));
    expect(screen.getAllByTestId(TID.toolRow)).toHaveLength(3);
  });

  it("shows a message that is still sending, and lets a failed one be retried or dismissed", async () => {
    const user = userEvent.setup();
    const onResendPending = vi.fn();
    const onDismissPending = vi.fn();
    render(<Transcript {...props({ pending: [{ id: 1, text: "on its way" }, { id: 2, text: "did not go", failed: "offline" }], onResendPending, onDismissPending })} />);
    expect(screen.getByText("Sending…")).toBeInTheDocument();
    expect(screen.getByText(/Not sent: offline/)).toBeInTheDocument();
    await user.click(screen.getByText("Retry"));
    expect(onResendPending).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }));
    await user.click(screen.getByText("Dismiss"));
    expect(onDismissPending).toHaveBeenCalledWith(2);
  });

  it("windows a long chat and can load earlier events", async () => {
    n = 0;
    const user = userEvent.setup();
    const events: SeqEvent[] = [];
    for (let i = 0; i < 700; i++) events.push(ev({ type: "user", text: `m${i}` }));
    render(<Transcript {...props({ events })} />);
    expect(screen.getAllByTestId(TID.userBlock)).toHaveLength(400);
    expect(screen.getByText("m699")).toBeInTheDocument();
    expect(screen.queryByText("m0")).toBeNull();
    await user.click(screen.getByText(/Show 300 earlier/));
    expect(screen.getAllByTestId(TID.userBlock)).toHaveLength(700);
  });

  it("follows new content at the bottom, but leaves a reader who scrolled up alone", () => {
    n = 0;
    const m = { scrollHeight: 2000, clientHeight: 500, scrollTop: 1500 };
    const { rerender } = render(<Transcript {...props({ events: [ev({ type: "message", text: "one" })] })} />);
    const scroller = screen.getByTestId(TID.transcript);
    metrics(scroller, m);
    // at the bottom: new content pulls the view down
    m.scrollHeight = 2400;
    rerender(<Transcript {...props({ events: [ev({ type: "message", text: "one" }), ev({ type: "message", text: "two" })] })} />);
    expect(m.scrollTop).toBe(2400);
    // the reader scrolls up
    m.scrollTop = 300;
    fireEvent.scroll(scroller);
    expect(screen.getByTestId(TID.scrollToBottom)).toHaveTextContent("Scroll to bottom");
    m.scrollHeight = 2800;
    rerender(<Transcript {...props({ events: [ev({ type: "message", text: "one" }), ev({ type: "message", text: "two" }), ev({ type: "message", text: "three" })] })} />);
    expect(m.scrollTop).toBe(300); // not yanked
    expect(screen.getByTestId(TID.scrollToBottom)).toHaveAttribute("data-unseen");
    act(() => screen.getByTestId(TID.scrollToBottom).click());
    expect(m.scrollTop).toBe(2800);
    expect(screen.queryByTestId(TID.scrollToBottom)).toBeNull();
  });

  it("sending your own message always scrolls to it", () => {
    n = 0;
    const m = { scrollHeight: 2000, clientHeight: 500, scrollTop: 1500 };
    const base = [ev({ type: "message", text: "one" })];
    const { rerender } = render(<Transcript {...props({ events: base })} />);
    const scroller = screen.getByTestId(TID.transcript);
    metrics(scroller, m);
    m.scrollTop = 200;
    fireEvent.scroll(scroller);
    m.scrollHeight = 2100;
    rerender(<Transcript {...props({ events: base, pending: [{ id: 1, text: "mine" }] })} />);
    expect(m.scrollTop).toBe(2100);
  });
});
