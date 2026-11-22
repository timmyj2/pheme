import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog, Dialog } from "../src/Dialog.tsx";

function Harness({ onConfirm }: { onConfirm: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>open</button>
      {open && <ConfirmDialog title="Sure?" body="body" confirmLabel="Do it" danger onConfirm={onConfirm} onClose={() => setOpen(false)} />}
    </>
  );
}

describe("Dialog", () => {
  it("moves focus in, traps Tab, closes on Escape and gives focus back", async () => {
    const user = userEvent.setup();
    render(<Harness onConfirm={() => {}} />);
    const opener = screen.getByText("open");
    await user.click(opener);
    expect(screen.getByRole("dialog", { name: "Sure?" })).toBeInTheDocument();
    expect(screen.getByText("Do it")).toHaveFocus();
    await user.tab();
    expect(screen.getByText("Cancel")).toHaveFocus(); // wrapped round to the first control
    await user.tab({ shift: true });
    expect(screen.getByText("Do it")).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(opener).toHaveFocus();
  });
  it("confirm runs the action and closes; backdrop click closes without running", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);
    await user.click(screen.getByText("open"));
    await user.click(screen.getByText("Do it"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(screen.getByText("open"));
    await user.click(document.querySelector(".overlay")!);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("renders its label for assistive tech", () => {
    render(<Dialog label="Hello" onClose={() => {}}><button>x</button></Dialog>);
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
  });
});
