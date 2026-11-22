import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Composer, MAX_CHARS, type ComposerHandle } from "../src/Composer.tsx";

const base = { chatId: "c1", busy: false, offline: false, queue: [] as string[], hasMessages: false, onSend: vi.fn(), onStop: vi.fn(), onRemoveQueued: vi.fn() };
const box = () => screen.getByLabelText("Message") as HTMLTextAreaElement;
beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });

describe("Composer", () => {
  it("Enter sends and clears; Shift+Enter makes a new line", async () => {
    const user = userEvent.setup();
    render(<Composer {...base} />);
    await user.type(box(), "hello{Shift>}{Enter}{/Shift}world");
    expect(base.onSend).not.toHaveBeenCalled();
    expect(box().value).toBe("hello\nworld");
    await user.keyboard("{Enter}");
    expect(base.onSend).toHaveBeenCalledWith("hello\nworld");
    expect(box().value).toBe("");
  });
  it("ignores Enter while an IME is composing (Japanese/Chinese input)", () => {
    render(<Composer {...base} />);
    fireEvent.change(box(), { target: { value: "にほん" } });
    fireEvent.keyDown(box(), { key: "Enter", isComposing: true, keyCode: 229 });
    expect(base.onSend).not.toHaveBeenCalled();
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(base.onSend).toHaveBeenCalledWith("にほん");
  });
  it("never sends blank or whitespace-only text", async () => {
    const user = userEvent.setup();
    render(<Composer {...base} />);
    await user.type(box(), "   {Enter}");
    expect(base.onSend).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
  });
  it("keeps a separate draft per chat and survives a remount", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { rerender, unmount } = render(<Composer {...base} chatId="a" />);
    await user.type(box(), "draft for a");
    vi.advanceTimersByTime(400);
    rerender(<Composer {...base} chatId="b" />);
    expect(box().value).toBe("");
    await user.type(box(), "draft for b");
    rerender(<Composer {...base} chatId="a" />);
    expect(box().value).toBe("draft for a");
    unmount();
    render(<Composer {...base} chatId="b" />);
    expect(box().value).toBe("draft for b");
    vi.useRealTimers();
  });
  it("never loses a draft when you leave the chat straight away (before the save delay)", async () => {
    const user = userEvent.setup();
    const { rerender, unmount } = render(<Composer {...base} chatId={null} />);
    await user.type(box(), "typed and left at once");
    rerender(<Composer {...base} chatId="other" />); // navigate away immediately
    expect(localStorage.getItem("pheme-draft:new")).toBe("typed and left at once");
    rerender(<Composer {...base} chatId={null} />);
    expect(box().value).toBe("typed and left at once");
    unmount(); // closing the whole view keeps it too
    expect(localStorage.getItem("pheme-draft:new")).toBe("typed and left at once");
  });
  it("clears the saved draft once the message is sent", async () => {
    const user = userEvent.setup();
    render(<Composer {...base} />);
    await user.type(box(), "gone after send{Enter}");
    expect(localStorage.getItem("pheme-draft:c1")).toBeNull();
  });
  it("while busy: Enter queues (button says Queue), an empty box shows Stop, Esc stops", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Composer {...base} busy />);
    expect(screen.getByRole("button", { name: "Stop the reply" })).toBeInTheDocument();
    await user.type(box(), "next thing");
    expect(screen.getByRole("button", { name: "Queue message" })).toBeEnabled();
    await user.keyboard("{Enter}");
    expect(base.onSend).toHaveBeenCalledWith("next thing");
    await user.keyboard("{Escape}");
    expect(base.onStop).toHaveBeenCalledTimes(1);
    rerender(<Composer {...base} busy queue={["one", "two"]} />);
    await user.click(screen.getByLabelText("Remove queued message 2"));
    expect(base.onRemoveQueued).toHaveBeenCalledWith(1);
  });
  it("Up arrow in an empty box recalls earlier messages, Down returns", async () => {
    const user = userEvent.setup();
    render(<Composer {...base} />);
    await user.type(box(), "first{Enter}");
    await user.type(box(), "second{Enter}");
    await user.keyboard("{ArrowUp}");
    expect(box().value).toBe("second");
    await user.keyboard("{ArrowUp}");
    expect(box().value).toBe("first");
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(box().value).toBe("");
  });
  it("refuses over-long messages and says why; offline disables sending", async () => {
    const { rerender } = render(<Composer {...base} />);
    fireEvent.change(box(), { target: { value: "x".repeat(MAX_CHARS + 1) } });
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
    expect(screen.getByText(/Too long to send/)).toBeInTheDocument();
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(base.onSend).not.toHaveBeenCalled();
    fireEvent.change(box(), { target: { value: "ok" } });
    rerender(<Composer {...base} offline />);
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
    expect(box()).toHaveAttribute("placeholder", "Reconnecting to Pheme…");
  });
  it("exposes set/insert/focus for suggestions and the post-Stop hand-back", () => {
    const ref = createRef<ComposerHandle>();
    render(<Composer {...base} ref={ref} />);
    act(() => ref.current!.set("from a chip"));
    expect(box().value).toBe("from a chip");
    act(() => ref.current!.insert("queued one"));
    expect(box().value).toBe("from a chip\nqueued one");
    expect(box()).toHaveFocus();
  });
  it("works when localStorage throws (private mode)", async () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    const user = userEvent.setup();
    render(<Composer {...base} />);
    await user.type(box(), "hi{Enter}");
    expect(base.onSend).toHaveBeenCalledWith("hi");
    spy.mockRestore();
    set.mockRestore();
  });
});
