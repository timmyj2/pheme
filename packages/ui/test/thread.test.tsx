import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Transcript } from "../src/Transcript.tsx";
import type { SeqEvent } from "../src/api.ts";
import { TID } from "../src/testids.ts";
import { formatDuration, groupTurns, turnMs } from "../src/components/thread/turns.ts";
import { buildBlocks } from "../src/blocks.ts";

let n = 0;
const ev = (e: object, ts = Date.now()): SeqEvent => ({ ...e, seq: ++n, ts }) as SeqEvent;
const noop = () => {};
const props = (over: Partial<React.ComponentProps<typeof Transcript>> = {}) => ({
  events: [] as SeqEvent[], streaming: "", busy: false, loaded: true, pending: [], onAnswer: noop, onCopy: noop, onRetry: noop,
  onDismissPending: noop, onResendPending: noop, onSuggest: noop, ...over,
});

/** jsdom has no layout: give the scroller the metrics we control. */
function metrics(el: HTMLElement, m: { scrollHeight: number; clientHeight: number; scrollTop: number }) {
  Object.defineProperty(el, "scrollHeight", { configurable: true, get: () => m.scrollHeight });
  Object.defineProperty(el, "clientHeight", { configurable: true, get: () => m.clientHeight });
  Object.defineProperty(el, "scrollTop", { configurable: true, get: () => m.scrollTop, set: (v: number) => { m.scrollTop = v; } });
  el.scrollTo = ((o: ScrollToOptions) => { m.scrollTop = o.top ?? 0; }) as never;
}

function setReducedMotion(reduce: boolean) {
  window.matchMedia = ((q: string) => ({ matches: reduce && q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia;
}

afterEach(() => {
  setReducedMotion(false);
  delete (Element.prototype as { animate?: unknown }).animate;
});

describe("turns", () => {
  it("groups replies under the prompt that opened them, and measures the turn", () => {
    n = 0;
    const t0 = 1_000_000;
    const events = [ev({ type: "user", text: "q1" }, t0), ev({ type: "message", text: "a1" }, t0 + 65_000), ev({ type: "user", text: "q2" }, t0 + 70_000)];
    const turns = groupTurns(buildBlocks(events));
    expect(turns).toHaveLength(2);
    expect(turns[0].user?.text).toBe("q1");
    expect(turns[0].body).toHaveLength(1);
    expect(turnMs(turns[0])).toBe(65_000);
    expect(turnMs(turns[1])).toBeUndefined();
    expect(formatDuration(65_000)).toBe("1:05");
    expect(formatDuration(3_723_000)).toBe("1:02:03");
  });
});

describe("sticky prompt", () => {
  it("the prompt is the sticky first child of its turn, so it holds while the reply scrolls", () => {
    n = 0;
    const events = [ev({ type: "user", text: "lets build it" }), ev({ type: "message", text: "Done." })];
    render(<Transcript {...props({ events })} />);
    const prompt = screen.getByTestId(TID.userMessage);
    expect(prompt.style.position).toBe("sticky");
    expect(prompt.style.top).toBe("0.23rem");
    const turn = prompt.closest(`[data-testid="${TID.turn}"]`) as HTMLElement;
    expect(prompt.parentElement).toBe(turn);
    expect(within(turn).getByTestId(TID.assistantBlock)).toHaveTextContent("Done.");
  });

  it("a long prompt is clamped with a Show all toggle", () => {
    n = 0;
    const offset = vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(200);
    try {
      render(<Transcript {...props({ events: [ev({ type: "user", text: "long ".repeat(200) })] })} />);
      const clamp = screen.getByTestId(TID.userBlock).parentElement!;
      expect(clamp).toHaveAttribute("data-clamped", "true");
      fireEvent.click(screen.getByRole("button", { name: "Show all" }));
      expect(clamp).not.toHaveAttribute("data-clamped");
    } finally {
      offset.mockRestore();
    }
  });
});

describe("scroll-to-bottom pill", () => {
  it("appears only after the reader scrolls up, and jumps back to the bottom", () => {
    n = 0;
    const m = { scrollHeight: 2000, clientHeight: 500, scrollTop: 1500 };
    render(<Transcript {...props({ events: [ev({ type: "message", text: "one" })] })} />);
    const scroller = screen.getByTestId(TID.transcript);
    metrics(scroller, m);
    expect(screen.queryByTestId(TID.scrollToBottom)).toBeNull();
    m.scrollTop = 300;
    fireEvent.scroll(scroller);
    const pill = screen.getByTestId(TID.scrollToBottom);
    expect(pill).toHaveTextContent("Scroll to bottom");
    expect(pill).not.toHaveAttribute("data-attention");
    act(() => pill.click());
    expect(m.scrollTop).toBe(2000);
    expect(screen.queryByTestId(TID.scrollToBottom)).toBeNull();
  });

  it("says Approval needed when a pending approval card is below the view", () => {
    n = 0;
    const m = { scrollHeight: 2000, clientHeight: 500, scrollTop: 1500 };
    const req = ev({ type: "approval_request", id: "p1", kind: "shell", title: "Run shell command", detail: "ls" });
    render(<Transcript {...props({ events: [req], busy: true })} />);
    const scroller = screen.getByTestId(TID.transcript);
    metrics(scroller, m);
    const box = { top: 0, bottom: 400, height: 400, left: 0, right: 0, width: 0, x: 0, y: 0, toJSON: () => ({}) };
    vi.spyOn(scroller, "getBoundingClientRect").mockReturnValue(box as DOMRect);
    vi.spyOn(screen.getByTestId(TID.approval), "getBoundingClientRect").mockReturnValue({ ...box, top: 500, bottom: 580, height: 80 } as DOMRect);
    m.scrollTop = 300;
    fireEvent.scroll(scroller);
    expect(screen.getByTestId(TID.scrollToBottom)).toHaveTextContent("Approval needed");
    expect(screen.getByTestId(TID.scrollToBottom)).toHaveAttribute("data-attention", "approval");
  });
});

describe("enter animation", () => {
  it("slides a block that arrives after the chat loaded, once, over 180ms", () => {
    n = 0;
    const animate = vi.fn(() => ({}));
    Object.defineProperty(Element.prototype, "animate", { configurable: true, value: animate });
    const base = [ev({ type: "message", text: "old" })];
    const { rerender } = render(<Transcript {...props({ events: base })} />);
    expect(animate).not.toHaveBeenCalled(); // what was on screen at load does not slide in again
    const reply = ev({ type: "message", text: "new reply" });
    rerender(<Transcript {...props({ events: [...base, reply] })} />);
    expect(animate).toHaveBeenCalledTimes(1);
    const [frames, opts] = animate.mock.calls[0] as unknown as [Keyframe[], KeyframeAnimationOptions];
    expect(frames).toEqual([{ transform: "translateY(0.375rem)" }, { transform: "translateY(0)" }]);
    expect(opts).toMatchObject({ duration: 180, easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
    rerender(<Transcript {...props({ events: [...base, reply], busy: true })} />);
    expect(animate).toHaveBeenCalledTimes(1); // the same block never replays
  });

  it("does not animate under reduced motion", () => {
    n = 0;
    setReducedMotion(true);
    const animate = vi.fn(() => ({}));
    Object.defineProperty(Element.prototype, "animate", { configurable: true, value: animate });
    const base = [ev({ type: "message", text: "old" })];
    const { rerender } = render(<Transcript {...props({ events: base })} />);
    rerender(<Transcript {...props({ events: [...base, ev({ type: "message", text: "new reply" })] })} />);
    expect(screen.getByText("new reply")).toBeInTheDocument();
    expect(animate).not.toHaveBeenCalled();
  });
});

describe("working row", () => {
  it("replaces the old loaders with a quiet status line while a turn runs", () => {
    n = 0;
    render(<Transcript {...props({ events: [ev({ type: "user", text: "go" })], busy: true })} />);
    const row = screen.getByTestId(TID.workingRow);
    expect(within(row).getByRole("status")).toHaveTextContent("Working");
    expect(row.querySelector(".working-timer")).toHaveTextContent("0:00");
  });

  it("the reply action bar offers the turn duration on the last reply", () => {
    n = 0;
    const t0 = Date.now();
    const events = [ev({ type: "user", text: "q" }, t0), ev({ type: "message", text: "a" }, t0 + 65_000)];
    render(<Transcript {...props({ events })} />);
    expect(screen.getByTestId(TID.replyActions)).toHaveTextContent("1:05");
  });
});
