import { render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatRow } from "../src/api.ts";
import { NotificationSetting } from "../src/NotificationSetting.tsx";
import { diffNotifications, notifyEnabled, setNotify, useNotifications } from "../src/notify.ts";

const row = (id: string, extra: Partial<ChatRow> = {}): ChatRow => ({ id, title: `Chat ${id}`, pinned: false, archived: false, createdAt: 0, updatedAt: 0, userMessages: 1, lastMemoryReviewAt: 0, ...extra });
const snap = (rows: ChatRow[]) => new Map(rows.map((c) => [c.id, { busy: !!c.busy, waiting: !!c.waiting }]));

describe("diffNotifications", () => {
  it("says nothing on the first snapshot", () => {
    expect(diffNotifications(null, [row("a", { busy: true })], null, false)).toEqual([]);
  });
  it("notifies when a reply finishes or a tool starts waiting, with the chat title", () => {
    const before = snap([row("a", { busy: true }), row("b", { busy: true }), row("c")]);
    const ev = diffNotifications(before, [row("a"), row("b", { busy: true, waiting: true }), row("c")], null, false);
    expect(ev.map((e) => [e.chatId, e.title, e.body])).toEqual([["a", "Reply ready", "Chat a"], ["b", "Approval needed", "Chat b"]]);
  });
  it("does not say 'reply ready' for a chat that stopped only because it is waiting for approval", () => {
    const ev = diffNotifications(snap([row("a", { busy: true })]), [row("a", { busy: false, waiting: true })], null, false);
    expect(ev.map((e) => e.title)).toEqual(["Approval needed"]);
  });
  it("stays quiet for the chat you are looking at, but not when the tab is hidden", () => {
    const before = snap([row("a", { busy: true })]);
    expect(diffNotifications(before, [row("a")], "a", true)).toEqual([]);
    expect(diffNotifications(before, [row("a")], "a", false)).toHaveLength(1);
  });
  it("ignores new chats, deleted chats, unchanged states, and trims very long titles", () => {
    expect(diffNotifications(snap([row("a")]), [row("a"), row("new", { busy: false })], null, false)).toEqual([]);
    expect(diffNotifications(snap([row("gone", { busy: true })]), [], null, false)).toEqual([]);
    expect(diffNotifications(snap([row("a", { busy: true, waiting: true })]), [row("a", { busy: true, waiting: true })], null, false)).toEqual([]);
    const long = diffNotifications(snap([row("a", { busy: true })]), [row("a", { title: "x".repeat(300) })], null, false)[0];
    expect(long.body.length).toBeLessThanOrEqual(80);
  });
});

describe("notifications in the browser", () => {
  const made: { title: string; opts: NotificationOptions; onclick?: () => void; close: () => void }[] = [];
  function fakeNotification(permission: NotificationPermission, request: NotificationPermission = permission) {
    made.length = 0;
    class N {
      static permission = permission;
      static requestPermission = vi.fn(async () => { N.permission = request; return request; });
      onclick?: () => void;
      close = vi.fn();
      constructor(public title: string, public opts: NotificationOptions) { made.push(this as never); }
    }
    vi.stubGlobal("Notification", N);
    return N;
  }
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it("fires a notification, and clicking it opens the chat", () => {
    fakeNotification("granted");
    localStorage.setItem("pheme-notify", "1");
    const open = vi.fn();
    const focus = vi.spyOn(window, "focus").mockImplementation(() => {});
    const { rerender } = renderHook(({ chats }) => useNotifications(chats, true, null, true, open), { initialProps: { chats: [row("a", { busy: true })] } });
    rerender({ chats: [row("a")] });
    expect(made).toHaveLength(1);
    expect(made[0].title).toBe("Reply ready");
    made[0].onclick?.();
    expect(open).toHaveBeenCalledWith("a");
    expect(focus).toHaveBeenCalled();
    expect(made[0].close).toHaveBeenCalled();
  });

  it("does nothing while disabled, while chats are still loading, or without permission", () => {
    fakeNotification("granted");
    const { rerender } = renderHook(({ chats, loaded, on }) => useNotifications(chats, loaded, null, on, vi.fn()), { initialProps: { chats: [row("a", { busy: true })], loaded: true, on: false } });
    rerender({ chats: [row("a")], loaded: true, on: false });
    expect(made).toHaveLength(0);
    fakeNotification("denied");
    const h = renderHook(({ chats }) => useNotifications(chats, true, null, true, vi.fn()), { initialProps: { chats: [row("a", { busy: true })] } });
    h.rerender({ chats: [row("a")] });
    expect(made).toHaveLength(0);
  });

  it("a notification constructor that throws (some browsers) does not break the app", () => {
    class Boom { static permission = "granted"; constructor() { throw new Error("Illegal constructor"); } }
    vi.stubGlobal("Notification", Boom);
    const h = renderHook(({ chats }) => useNotifications(chats, true, null, true, vi.fn()), { initialProps: { chats: [row("a", { busy: true })] } });
    expect(() => h.rerender({ chats: [row("a")] })).not.toThrow();
  });

  it("setNotify asks permission once, explains a refusal, and respects a block", async () => {
    const N = fakeNotification("default", "granted");
    expect(await setNotify(true)).toEqual({ enabled: true, problem: undefined });
    expect(N.requestPermission).toHaveBeenCalledTimes(1);
    expect(notifyEnabled()).toBe(true);
    expect((await setNotify(false)).enabled).toBe(false);
    expect(notifyEnabled()).toBe(false);
    fakeNotification("default", "denied");
    expect((await setNotify(true)).problem).toMatch(/Permission was not given/);
    expect(notifyEnabled()).toBe(false);
    fakeNotification("denied");
    expect((await setNotify(true)).problem).toMatch(/blocked/);
    vi.stubGlobal("Notification", undefined);
    expect((await setNotify(true)).problem).toMatch(/does not support/);
  });

  it("the settings checkbox reflects the outcome and shows the reason on failure", async () => {
    const user = userEvent.setup();
    fakeNotification("denied");
    render(<NotificationSetting />);
    await user.click(screen.getByRole("checkbox"));
    expect(await screen.findByRole("alert")).toHaveTextContent(/blocked/);
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    fakeNotification("granted");
    await user.click(screen.getByRole("checkbox"));
    await waitFor(() => expect(screen.getByRole("checkbox")).toBeChecked());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("the setting is disabled where notifications do not exist", () => {
    vi.stubGlobal("Notification", undefined);
    render(<NotificationSetting />);
    expect(screen.getByRole("checkbox")).toBeDisabled();
  });
});
