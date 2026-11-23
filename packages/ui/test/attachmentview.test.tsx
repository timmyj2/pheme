import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Attachments } from "../src/AttachmentView.tsx";
import { ApiError, api } from "../src/api.ts";

vi.mock("../src/api.ts", async (orig) => {
  const actual = await orig<typeof import("../src/api.ts")>();
  return { ...actual, api: { ...actual.api, attachmentBlob: vi.fn() } };
});
const blob = api.attachmentBlob as unknown as ReturnType<typeof vi.fn>;
const img = { id: "i1", name: "shot.png", kind: "image" as const, mime: "image/png", size: 2048 };
const txt = { id: "t1", name: "notes.md", kind: "text" as const, mime: "text/plain", size: 100 };
beforeEach(() => {
  vi.clearAllMocks(); URL.createObjectURL = vi.fn(() => "blob:thumb"); URL.revokeObjectURL = vi.fn();
  blob.mockResolvedValue(new Blob(["x"]));
});

describe("Attachments", () => {
  it("shows nothing for no files or no chat", () => {
    const { container, rerender } = render(<Attachments chatId="c" items={[]} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<Attachments chatId={null} items={[img]} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("loads image thumbnails through the authorised call (never a bare link) and releases them on unmount", async () => {
    const { unmount } = render(<Attachments chatId="c" items={[img, txt]} />);
    const pic = await screen.findByRole("img", { name: "shot.png" });
    expect(pic).toHaveAttribute("src", "blob:thumb");
    expect(blob).toHaveBeenCalledWith("c", "i1");
    expect(blob).not.toHaveBeenCalledWith("c", "t1"); // text is only fetched when opened
    expect(screen.getByRole("button", { name: /notes\.md/ })).toBeInTheDocument();
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:thumb");
  });
  it("opens a file in a new tab on click, and says so plainly when it has been removed", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const user = userEvent.setup();
    render(<Attachments chatId="c" items={[txt]} />);
    await user.click(screen.getByRole("button", { name: /notes\.md/ }));
    await waitFor(() => expect(open).toHaveBeenCalledWith("blob:thumb", "_blank", "noopener"));
    blob.mockRejectedValue(new ApiError(404, "This file is no longer available."));
    await user.click(screen.getByRole("button", { name: /notes\.md/ }));
    expect(await screen.findByText(/no longer available/)).toBeInTheDocument();
    open.mockRestore();
  });
  it("a missing image shows the same message instead of a broken picture", async () => {
    blob.mockRejectedValue(new ApiError(404, "gone"));
    render(<Attachments chatId="c" items={[img]} />);
    expect(await screen.findByText(/shot\.png \(no longer available\)/)).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
  });
});
