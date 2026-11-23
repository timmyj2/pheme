import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "../src/api.ts";
import { TROUBLE_EVENT, useConnection } from "../src/connection.ts";

vi.mock("../src/api.ts", async (orig) => {
  const actual = await orig<typeof import("../src/api.ts")>();
  return { ...actual, api: { ...actual.api, state: vi.fn() } };
});
const state = api.state as unknown as ReturnType<typeof vi.fn>;
const S = { engine: "fake", fake: true, settings: {}, usage: { turns: 0, reviews: 0, toolSteps: 0 }, version: "t" };

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); state.mockReset(); state.mockResolvedValue(S); });
afterEach(() => vi.useRealTimers());

describe("useConnection", () => {
  it("is online once the server answers and exposes its state", async () => {
    const h = renderHook(() => useConnection());
    await waitFor(() => expect(h.result.current.state).toEqual(S));
    expect(h.result.current.status).toBe("online");
  });

  it("a refused connection is offline immediately, and recovery is noticed within ~1.2 s", async () => {
    const h = renderHook(() => useConnection());
    await waitFor(() => expect(h.result.current.status).toBe("online"));
    state.mockRejectedValue(new ApiError(0, "Can't reach Pheme."));
    act(() => { window.dispatchEvent(new Event(TROUBLE_EVENT)); });
    await waitFor(() => expect(h.result.current.status).toBe("offline"));
    state.mockResolvedValue(S);
    await act(async () => { vi.advanceTimersByTime(1500); });
    await waitFor(() => expect(h.result.current.status).toBe("online"));
  });

  it("a single server error is tolerated; two in a row are offline", async () => {
    const h = renderHook(() => useConnection());
    await waitFor(() => expect(h.result.current.status).toBe("online"));
    state.mockRejectedValue(new ApiError(500, "boom"));
    await act(async () => { window.dispatchEvent(new Event(TROUBLE_EVENT)); });
    expect(h.result.current.status).toBe("online");
    await act(async () => { window.dispatchEvent(new Event(TROUBLE_EVENT)); });
    await waitFor(() => expect(h.result.current.status).toBe("offline"));
  });

  it("a rejected token is reported as unauthorized, not offline", async () => {
    state.mockRejectedValue(new ApiError(401, "bad token"));
    const h = renderHook(() => useConnection());
    await waitFor(() => expect(h.result.current.status).toBe("unauthorized"));
    expect(h.result.current.error).toBe("bad token");
  });

  it("a rejected key is replaced by a newer one another window saved, and the connection recovers on its own", async () => {
    sessionStorage.setItem("pheme-token", "old"); localStorage.setItem("pheme-token", "newer");
    state.mockRejectedValueOnce(new ApiError(401, "bad token")).mockResolvedValue(S);
    const h = renderHook(() => useConnection());
    await waitFor(() => expect(h.result.current.status).toBe("online"));
    expect(sessionStorage.getItem("pheme-token")).toBe("newer");
    expect(state).toHaveBeenCalledTimes(2);
    sessionStorage.clear(); localStorage.clear();
  });

  it("does not loop when the saved key is the same one that was rejected", async () => {
    sessionStorage.setItem("pheme-token", "same"); localStorage.setItem("pheme-token", "same");
    state.mockRejectedValue(new ApiError(401, "bad token"));
    const h = renderHook(() => useConnection());
    await waitFor(() => expect(h.result.current.status).toBe("unauthorized"));
    expect(state.mock.calls.length).toBeLessThanOrEqual(2);
    sessionStorage.clear(); localStorage.clear();
  });

  it("reports the first failure as an error when there is no state yet", async () => {
    state.mockRejectedValue(new ApiError(0, "Can't reach Pheme."));
    const h = renderHook(() => useConnection());
    await waitFor(() => expect(h.result.current.error).toBe("Can't reach Pheme."));
    expect(h.result.current.state).toBeNull();
  });

  it("polls on its own and stops after unmount", async () => {
    const h = renderHook(() => useConnection());
    await waitFor(() => expect(state).toHaveBeenCalled());
    const n = state.mock.calls.length;
    await act(async () => { vi.advanceTimersByTime(11000); });
    expect(state.mock.calls.length).toBeGreaterThan(n);
    h.unmount();
    const m = state.mock.calls.length;
    await act(async () => { vi.advanceTimersByTime(20000); });
    expect(state.mock.calls.length).toBe(m);
  });
});
