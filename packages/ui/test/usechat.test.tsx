import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api, type SeqEvent } from "../src/api.ts";
import { useChat } from "../src/useChat.ts";

vi.mock("../src/api.ts", async (orig) => {
  const actual = await orig<typeof import("../src/api.ts")>();
  return {
    ...actual,
    api: { ...actual.api, chat: vi.fn(), send: vi.fn(), stop: vi.fn(), approve: vi.fn(), eventsUrl: (id: string, after: number) => `/events/${id}?after=${after}` },
  };
});

class FakeES {
  static all: FakeES[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((m: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(public url: string) { FakeES.all.push(this); }
  close() { this.closed = true; }
  open() { this.onopen?.(); }
  emit(e: object) { this.onmessage?.({ data: JSON.stringify(e) }); }
  fail() { this.onerror?.(); }
}
const live = () => FakeES.all.filter((e) => !e.closed).at(-1)!;
let seq = 0;
const ev = (e: object): SeqEvent => ({ ...e, seq: ++seq, ts: 1 }) as SeqEvent;
const opts = () => ({ onChange: vi.fn(), onError: vi.fn() });
const chatApi = api.chat as unknown as ReturnType<typeof vi.fn>;
const sendApi = api.send as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  FakeES.all = [];
  seq = 0;
  vi.stubGlobal("EventSource", FakeES);
  vi.clearAllMocks();
  chatApi.mockResolvedValue({ meta: {}, busy: false, events: [] });
  sendApi.mockResolvedValue({ ok: true });
  (api.stop as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
  (api.approve as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

const boot = async (o = opts(), id: string | null = "c1") => {
  const h = renderHook(() => useChat(id, o));
  await waitFor(() => expect(h.result.current.loaded).toBe(true));
  return h;
};

describe("useChat", () => {
  it("loads the transcript, then follows the stream from the last event it saw", async () => {
    chatApi.mockResolvedValue({ meta: {}, busy: false, events: [ev({ type: "user", text: "hi" }), ev({ type: "message", text: "hello" })] });
    const h = await boot();
    expect(h.result.current.events).toHaveLength(2);
    expect(live().url).toBe("/events/c1?after=2");
    act(() => live().open());
    expect(h.result.current.live).toBe("live");
  });

  it("shows streamed text, clears it when the whole message lands, and finishes the turn on idle", async () => {
    const o = opts();
    const h = await boot(o);
    act(() => { live().emit(ev({ type: "turn_start" })); live().emit({ type: "delta", text: "Hel", seq: 99, ts: 1 }); live().emit({ type: "delta", text: "lo", seq: 100, ts: 1 }); });
    expect(h.result.current.busy).toBe(true);
    expect(h.result.current.streaming).toBe("Hello");
    act(() => { live().emit(ev({ type: "message", text: "Hello" })); live().emit(ev({ type: "idle" })); });
    expect(h.result.current.streaming).toBe("");
    expect(h.result.current.busy).toBe(false);
    expect(o.onChange).toHaveBeenCalled();
  });

  it("ignores replayed and duplicate events", async () => {
    const h = await boot();
    const e = ev({ type: "message", text: "once" });
    act(() => { live().emit(e); live().emit(e); live().emit({ ...e }); });
    expect(h.result.current.events).toHaveLength(1);
  });

  it("reconnects with backoff, resumes from the last event and re-syncs busy", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const h = await boot();
    act(() => { live().open(); live().emit(ev({ type: "turn_start" })); live().emit({ type: "delta", text: "half a rep", seq: 50, ts: 1 }); });
    const first = live();
    chatApi.mockResolvedValue({ meta: {}, busy: false, events: [] });
    act(() => first.fail());
    expect(first.closed).toBe(true);
    expect(h.result.current.live).toBe("reconnecting");
    expect(h.result.current.streaming).toBe(""); // a half reply is dropped, the full message arrives on resume
    await act(async () => { vi.advanceTimersByTime(600); });
    const second = live();
    expect(second).not.toBe(first);
    expect(second.url).toBe("/events/c1?after=1");
    await act(async () => { second.open(); });
    await waitFor(() => expect(h.result.current.busy).toBe(false)); // the turn finished while we were away
    expect(h.result.current.live).toBe("live");
  });

  it("backs off further on repeated failures (0.5 s, 1 s, 2 s)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await boot();
    const open = () => FakeES.all.filter((e) => !e.closed).length;
    for (const delay of [500, 1000, 2000]) {
      act(() => live().fail());
      await act(async () => { vi.advanceTimersByTime(delay - 100); });
      expect(open()).toBe(0); // still waiting
      await act(async () => { vi.advanceTimersByTime(150); });
      expect(open()).toBe(1); // reopened on schedule
    }
  });

  it("shows a sent message at once, and replaces it with the real one when the server confirms", async () => {
    const h = await boot();
    act(() => h.result.current.send("hello there"));
    expect(h.result.current.pending.map((p) => p.text)).toEqual(["hello there"]);
    expect(h.result.current.busy).toBe(true);
    await waitFor(() => expect(sendApi).toHaveBeenCalledWith("c1", "hello there", undefined));
    act(() => live().emit(ev({ type: "user", text: "hello there" })));
    expect(h.result.current.pending).toHaveLength(0);
    expect(h.result.current.events.filter((e) => e.type === "user")).toHaveLength(1);
  });

  it("a rejected send is marked failed, reported, and can be dismissed", async () => {
    sendApi.mockRejectedValue(new ApiError(500, "disk full"));
    const o = opts();
    const h = await boot(o);
    act(() => h.result.current.send("x"));
    await waitFor(() => expect(h.result.current.pending[0]?.failed).toBe("disk full"));
    expect(h.result.current.busy).toBe(false);
    expect(o.onError).toHaveBeenCalledWith("disk full");
    act(() => h.result.current.dropPending(h.result.current.pending[0].id));
    expect(h.result.current.pending).toHaveLength(0);
  });

  it("typing while a reply runs queues the message and sends it when the reply ends", async () => {
    const h = await boot();
    act(() => live().emit(ev({ type: "turn_start" })));
    act(() => { h.result.current.send("one"); h.result.current.send("two"); });
    expect(h.result.current.queue).toEqual(["one", "two"]);
    expect(sendApi).not.toHaveBeenCalled();
    act(() => { live().emit(ev({ type: "idle" })); });
    await waitFor(() => expect(sendApi).toHaveBeenCalledWith("c1", "one", undefined));
    expect(h.result.current.queue).toEqual(["two"]);
    act(() => { live().emit(ev({ type: "user", text: "one" })); live().emit(ev({ type: "turn_start" })); });
    act(() => { live().emit(ev({ type: "idle" })); });
    await waitFor(() => expect(sendApi).toHaveBeenCalledWith("c1", "two", undefined));
    expect(sendApi).toHaveBeenCalledTimes(2);
  });

  it("a 409 (server still busy) queues instead of failing", async () => {
    sendApi.mockRejectedValueOnce(new ApiError(409, "this chat is still working"));
    const o = opts();
    const h = await boot(o);
    act(() => h.result.current.send("late"));
    await waitFor(() => expect(h.result.current.queue).toEqual(["late"]));
    expect(o.onError).not.toHaveBeenCalled();
    expect(h.result.current.pending).toHaveLength(0);
  });

  it("Stop hands queued messages back instead of losing them", async () => {
    const h = await boot();
    act(() => live().emit(ev({ type: "turn_start" })));
    act(() => { h.result.current.send("a"); h.result.current.send("b"); });
    let held: string[] = [];
    await act(async () => { held = await h.result.current.stop(); });
    expect(held).toEqual(["a", "b"]);
    expect(h.result.current.queue).toEqual([]);
    expect(api.stop).toHaveBeenCalledWith("c1");
  });

  it("queued messages wait while the connection is down", async () => {
    const h = await boot();
    act(() => live().open());
    act(() => live().emit(ev({ type: "turn_start" })));
    act(() => h.result.current.send("later"));
    act(() => live().fail());
    act(() => { /* reconnecting */ });
    expect(h.result.current.live).toBe("reconnecting");
    await new Promise((r) => setTimeout(r, 20));
    expect(sendApi).not.toHaveBeenCalled();
  });

  it("a new chat (null id) loads instantly and cannot send", async () => {
    const h = await boot(opts(), null);
    expect(FakeES.all).toHaveLength(0);
    act(() => h.result.current.send("x"));
    expect(sendApi).not.toHaveBeenCalled();
  });

  it("a missing chat reports it; unmount closes the stream", async () => {
    chatApi.mockRejectedValue(new ApiError(404, "no such chat"));
    const h = renderHook(() => useChat("gone", opts()));
    await waitFor(() => expect(h.result.current.loadError).toBe("This chat no longer exists."));
    chatApi.mockResolvedValue({ meta: {}, busy: false, events: [] });
    const h2 = await boot();
    const es = live();
    h2.unmount();
    expect(es.closed).toBe(true);
  });

  it("switching chats ignores a slow response for the old one", async () => {
    let resolveOld: (v: unknown) => void = () => {};
    chatApi.mockImplementationOnce(() => new Promise((r) => { resolveOld = r; }));
    const h = renderHook(({ id }) => useChat(id, opts()), { initialProps: { id: "old" as string | null } });
    chatApi.mockResolvedValue({ meta: {}, busy: false, events: [ev({ type: "message", text: "new chat text" })] });
    h.rerender({ id: "new" });
    await waitFor(() => expect(h.result.current.events).toHaveLength(1));
    resolveOld({ meta: {}, busy: true, events: [ev({ type: "message", text: "OLD" })] });
    await new Promise((r) => setTimeout(r, 20));
    expect(h.result.current.events.map((e) => (e as { text?: string }).text)).toEqual(["new chat text"]);
    expect(h.result.current.busy).toBe(false);
  });

  it("a malformed SSE frame does not break the stream", async () => {
    const h = await boot();
    act(() => { live().onmessage?.({ data: "{not json" }); live().emit(ev({ type: "message", text: "still works" })); });
    expect(h.result.current.events).toHaveLength(1);
  });
});
