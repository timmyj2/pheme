import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast } from "../src/toast.tsx";

function Probe({ action }: { action?: () => void }) {
  const t = useToast();
  return (
    <>
      <button onClick={() => t.info("Saved")}>info</button>
      <button onClick={() => t.error("Boom", action ? { label: "Retry", run: action } : undefined)}>err</button>
    </>
  );
}
afterEach(() => vi.useRealTimers());

describe("toasts", () => {
  it("info toasts disappear on their own, errors stay until dismissed", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<ToastProvider><Probe /></ToastProvider>);
    await user.click(screen.getByText("info"));
    await user.click(screen.getByText("err"));
    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Boom");
    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.queryByText("Saved")).toBeNull();
    expect(screen.getByText("Boom")).toBeInTheDocument();
    await user.click(screen.getByLabelText("Dismiss"));
    expect(screen.queryByText("Boom")).toBeNull();
  });
  it("collapses identical errors and caps the stack", async () => {
    const user = userEvent.setup();
    render(<ToastProvider><Probe /></ToastProvider>);
    for (let i = 0; i < 5; i++) await user.click(screen.getByText("err"));
    expect(screen.getAllByText("Boom")).toHaveLength(1);
  });
  it("an action button runs and dismisses", async () => {
    const user = userEvent.setup();
    const run = vi.fn();
    render(<ToastProvider><Probe action={run} /></ToastProvider>);
    await user.click(screen.getByText("err"));
    await user.click(screen.getByText("Retry"));
    expect(run).toHaveBeenCalled();
    expect(screen.queryByText("Boom")).toBeNull();
  });
});
