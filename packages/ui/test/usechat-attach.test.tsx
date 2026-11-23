import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../src/api.ts";
import { useChat } from "../src/useChat.ts";

vi.mock("../src/api.ts", async (orig) => {
  const actual = await orig<typeof import("../src/api.ts")>();
  return { ...actual, api: { ...actual.api, chat: vi.fn(), send: vi.fn(), stop: vi.fn(), uploadAttachment: vi.fn(), eventsUrl: () => "/e" } };
});
class ES { onopen = null; onmessage = null; onerror = null; close() {} constructor(public url: string) {} }
const m = (k: keyof typeof api) => api[k] as unknown as ReturnType<typeof vi.fn>;
const f = (n: string) => new File(["x"], n);
beforeEach(() => {
  vi.stubGlobal("EventSource", ES); vi.clearAllMocks();
  m("chat").mockResolvedValue({ meta: {}, busy: false, events: [] });
  m("send").mockResolvedValue({ ok: true });
  m("uploadAttachment").mockImplementation(async (_id: string, file: File) => ({ id: `id-${file.name}`, name: file.name, kind: "text", mime: "text/plain", size: 1 }));
});
afterEach(() => vi.unstubAllGlobals());
const boot = async (o: { onChange: () => void; onError: (m: string) => void; onRestore?: (t: string, f: File[]) => void }) => {
  const h = renderHook(() => useChat("c1", o));
  await waitFor(() => expect(h.result.current.loaded).toBe(true));
  return h;
};

describe("useChat with attachments", () => {
  it("uploads each file first, in order, then sends the message with their ids; the pending bubble names the files", async () => {
    const h = await boot({ onChange: vi.fn(), onError: vi.fn() });
    act(() => h.result.current.send("see these", [f("a.txt"), f("b.md")]));
    expect(h.result.current.pending[0]).toMatchObject({ text: "see these", files: ["a.txt", "b.md"] });
    await waitFor(() => expect(m("send")).toHaveBeenCalledWith("c1", "see these", ["id-a.txt", "id-b.md"]));
    expect(m("uploadAttachment").mock.calls.map((c) => (c[1] as File).name)).toEqual(["a.txt", "b.md"]);
    expect(m("uploadAttachment").mock.invocationCallOrder[1]).toBeLessThan(m("send").mock.invocationCallOrder[0]);
  });
  it("if an upload fails nothing is sent, the bubble goes away, and text and files are handed back", async () => {
    m("uploadAttachment").mockResolvedValueOnce({ id: "ok", name: "a.txt", kind: "text", mime: "text/plain", size: 1 }).mockRejectedValueOnce(new Error('"b.exe" can\'t be attached'));
    const o = { onChange: vi.fn(), onError: vi.fn(), onRestore: vi.fn() };
    const h = await boot(o);
    const files = [f("a.txt"), f("b.exe")];
    act(() => h.result.current.send("hello", files));
    await waitFor(() => expect(o.onRestore).toHaveBeenCalledWith("hello", files));
    expect(o.onError).toHaveBeenCalledWith(expect.stringContaining("b.exe"));
    expect(m("send")).not.toHaveBeenCalled();
    expect(h.result.current.pending).toEqual([]);
    expect(h.result.current.busy).toBe(false);
  });
  it("a plain message sends with no attachment list, as before", async () => {
    const h = await boot({ onChange: vi.fn(), onError: vi.fn() });
    act(() => h.result.current.send("just text"));
    await waitFor(() => expect(m("send")).toHaveBeenCalledWith("c1", "just text", undefined));
    expect(m("uploadAttachment")).not.toHaveBeenCalled();
  });
});
