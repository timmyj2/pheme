import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Transcript } from "../src/Transcript.tsx";
import type { SeqEvent } from "../src/api.ts";

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
    await user.click(screen.getAllByLabelText("Copy message")[1]);
    expect(onCopy).toHaveBeenCalledWith("a1");
    await user.click(screen.getByLabelText("Try again"));
    expect(onRetry).toHaveBeenCalledWith("q2");
    rerender(<Transcript {...props({ events, busy: true, onCopy, onRetry })} />);
    expect(screen.queryByLabelText("Try again")).toBeNull();
  });

  it("approval cards answer, then collapse to a one-line summary; stale ones say expired", async () => {
    n = 0;
    const user = userEvent.setup();
    const onAnswer = vi.fn();
    const req = ev({ type: "approval_request", id: "p1", kind: "shell", title: "Run shell command", detail: "rm -rf /tmp/x" });
    const { rerender } = render(<Transcript {...props({ events: [req], busy: true, onAnswer })} />);
    await user.click(screen.getByText("Allow for this chat"));
    expect(onAnswer).toHaveBeenCalledWith("p1", "chat");
    await user.click(screen.getByText("Deny"));
    expect(onAnswer).toHaveBeenCalledWith("p1", "deny");
    rerender(<Transcript {...props({ events: [req, ev({ type: "approval_resolved", id: "p1", decision: "deny" })], busy: true, onAnswer })} />);
    expect(screen.queryByText("Allow once")).toBeNull();
    expect(screen.getByText(/Denied · Run shell command/)).toBeInTheDocument();
    rerender(<Transcript {...props({ events: [req], busy: false, onAnswer })} />);
    expect(screen.getByText(/Approval expired/)).toBeInTheDocument();
  });

  it("groups long runs of tool calls behind one summary line", async () => {
    n = 0;
    const user = userEvent.setup();
    const events: SeqEvent[] = [];
    for (let i = 0; i < 6; i++) events.push(ev({ type: "tool_start", id: `t${i}`, name: "bash", args: { command: `cmd ${i}` } }), ev({ type: "tool_end", id: `t${i}`, name: "bash", ok: i !== 2, result: "" }));
    render(<Transcript {...props({ events })} />);
    expect(screen.getByText(/6 tool calls · 1 failed/)).toBeInTheDocument();
    expect(screen.queryByText("cmd 0")).toBeNull();
    await user.click(screen.getByText(/6 tool calls/));
    expect(screen.getByText("cmd 0")).toBeInTheDocument();
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
    expect(document.querySelectorAll(".bubble.user")).toHaveLength(400);
    expect(screen.getByText("m699")).toBeInTheDocument();
    expect(screen.queryByText("m0")).toBeNull();
    await user.click(screen.getByText(/Show 300 earlier/));
    expect(document.querySelectorAll(".bubble.user")).toHaveLength(700);
  });

  it("follows new content at the bottom, but leaves a reader who scrolled up alone", () => {
    n = 0;
    const m = { scrollHeight: 2000, clientHeight: 500, scrollTop: 1500 };
    const { rerender, container } = render(<Transcript {...props({ events: [ev({ type: "message", text: "one" })] })} />);
    const scroller = container.querySelector(".transcript") as HTMLElement;
    metrics(scroller, m);
    // at the bottom: new content pulls the view down
    m.scrollHeight = 2400;
    rerender(<Transcript {...props({ events: [ev({ type: "message", text: "one" }), ev({ type: "message", text: "two" })] })} />);
    expect(m.scrollTop).toBe(2400);
    // the reader scrolls up
    m.scrollTop = 300;
    fireEvent.scroll(scroller);
    expect(screen.getByLabelText("Jump to the latest message")).toHaveTextContent("Latest");
    m.scrollHeight = 2800;
    rerender(<Transcript {...props({ events: [ev({ type: "message", text: "one" }), ev({ type: "message", text: "two" }), ev({ type: "message", text: "three" })] })} />);
    expect(m.scrollTop).toBe(300); // not yanked
    expect(screen.getByLabelText("Jump to the latest message")).toHaveTextContent("New messages");
    act(() => screen.getByLabelText("Jump to the latest message").click());
    expect(m.scrollTop).toBe(2800);
    expect(screen.queryByLabelText("Jump to the latest message")).toBeNull();
  });

  it("sending your own message always scrolls to it", () => {
    n = 0;
    const m = { scrollHeight: 2000, clientHeight: 500, scrollTop: 1500 };
    const base = [ev({ type: "message", text: "one" })];
    const { rerender, container } = render(<Transcript {...props({ events: base })} />);
    const scroller = container.querySelector(".transcript") as HTMLElement;
    metrics(scroller, m);
    m.scrollTop = 200;
    fireEvent.scroll(scroller);
    m.scrollHeight = 2100;
    rerender(<Transcript {...props({ events: base, pending: [{ id: 1, text: "mine" }] })} />);
    expect(m.scrollTop).toBe(2100);
  });
});
