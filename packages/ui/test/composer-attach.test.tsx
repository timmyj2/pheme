import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Composer, type ComposerHandle } from "../src/Composer.tsx";
import { TID } from "../src/testids.ts";

const base = { chatId: "c1", busy: false, offline: false, queue: [] as string[], hasMessages: false, onSend: vi.fn(), onStop: vi.fn(), onRemoveQueued: vi.fn() };
const box = () => screen.getByLabelText("Message") as HTMLTextAreaElement;
const f = (name: string, size = 10, type = "") => new File([new Uint8Array(size)], name, { type });
const pick = (files: File[]) => fireEvent.change(document.querySelector("input[type=file]")!, { target: { files } });
beforeEach(() => {
  localStorage.clear(); vi.clearAllMocks();
  URL.createObjectURL = vi.fn(() => "blob:x"); URL.revokeObjectURL = vi.fn();
});

describe("Composer attachments", () => {
  it("picks files, shows them with a remove button, and sends them with the message (then clears)", async () => {
    const user = userEvent.setup();
    render(<Composer {...base} />);
    expect(document.querySelector("input[type=file]")).toHaveAttribute("multiple");
    pick([f("notes.md"), f("shot.png", 2048, "image/png")]);
    const list = await screen.findByRole("list", { name: "Files to send" });
    expect(list).toHaveTextContent("notes.md");
    expect(list).toHaveTextContent("2 KB");
    await user.type(box(), "look{Enter}");
    expect(base.onSend).toHaveBeenCalledTimes(1);
    const [text, files] = base.onSend.mock.calls[0];
    expect(text).toBe("look");
    expect((files as File[]).map((x) => x.name)).toEqual(["notes.md", "shot.png"]);
    await waitFor(() => expect(screen.queryByRole("list", { name: "Files to send" })).toBeNull());
  });
  it("files alone are enough to send, with a default sentence", async () => {
    const user = userEvent.setup();
    render(<Composer {...base} />);
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
    pick([f("a.txt")]);
    await user.click(await screen.findByRole("button", { name: "Send message" }));
    expect(base.onSend.mock.calls[0][0]).toBe("Please take a look at the attached file.");
  });
  it("removes one file; refuses unsupported and oversize ones with a spoken reason, and keeps the good ones", async () => {
    const user = userEvent.setup();
    render(<Composer {...base} />);
    pick([f("a.txt"), f("virus.exe"), f("b.txt", 20)]);
    expect(await screen.findByRole("alert")).toHaveTextContent('"virus.exe" can\'t be attached');
    expect(screen.getByText("a.txt")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove a.txt" }));
    expect(screen.queryByText("a.txt")).toBeNull();
    expect(screen.getByText("b.txt")).toBeInTheDocument();
  });
  it("pasted images are attached (with a good name); pasted text still pastes as text", async () => {
    render(<Composer {...base} />);
    const shot = f("image.png", 100, "image/png");
    fireEvent.paste(box(), { clipboardData: { files: [shot], getData: () => "" } });
    expect(await screen.findByText("pasted-image.png")).toBeInTheDocument();
    const before = screen.getAllByRole("listitem").length;
    fireEvent.paste(box(), { clipboardData: { files: [], getData: () => "plain" } });
    expect(screen.getAllByRole("listitem").length).toBe(before);
  });
  it("dropping files attaches them; dropping other things (text) does nothing special", async () => {
    render(<Composer {...base} />);
    const wrap = screen.getByTestId(TID.composerWrap);
    fireEvent.dragOver(wrap, { dataTransfer: { types: ["Files"] } });
    expect(wrap).toHaveAttribute("data-dragging", "true");
    fireEvent.drop(wrap, { dataTransfer: { types: ["Files"], files: [f("dropped.json")] } });
    expect(await screen.findByText("dropped.json")).toBeInTheDocument();
    expect(wrap).not.toHaveAttribute("data-dragging");
    fireEvent.dragOver(wrap, { dataTransfer: { types: ["text/plain"] } });
    expect(wrap).not.toHaveAttribute("data-dragging");
  });
  it("while a reply runs, attachments wait (Send is off and says why) but plain text can still be queued", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Composer {...base} busy />);
    await user.type(box(), "queue me");
    expect(screen.getByRole("button", { name: "Queue message" })).toBeEnabled();
    pick([f("a.txt")]);
    expect(await screen.findByRole("status")).toHaveTextContent("sent once the current reply finishes");
    expect(screen.getByRole("button", { name: "Queue message" })).toBeDisabled();
    rerender(<Composer {...base} busy={false} />);
    expect(screen.getByRole("button", { name: "Send message" })).toBeEnabled();
  });
  it("switching chats drops the pending files; offline disables the paperclip; the handle can put files back", async () => {
    const ref = createRef<ComposerHandle>();
    const { rerender } = render(<Composer {...base} ref={ref} />);
    pick([f("a.txt")]);
    await screen.findByText("a.txt");
    rerender(<Composer {...base} ref={ref} chatId="c2" />);
    await waitFor(() => expect(screen.queryByText("a.txt")).toBeNull());
    act(() => ref.current!.addFiles([f("back.txt")]));
    expect(await screen.findByText("back.txt")).toBeInTheDocument();
    rerender(<Composer {...base} ref={ref} chatId="c2" offline />);
    expect(screen.getByRole("button", { name: "Attach files" })).toBeDisabled();
  });
  it("revokes image preview addresses when the file is removed (no leak)", async () => {
    const user = userEvent.setup();
    render(<Composer {...base} />);
    pick([f("p.png", 10, "image/png")]);
    await screen.findByText("p.png");
    expect(URL.createObjectURL).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Remove p.png" }));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:x");
  });
});
