import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ModelPicker, resetModelCache } from "../src/ModelPicker.tsx";
import { api } from "../src/api.ts";

vi.mock("../src/api.ts", async (orig) => {
  const actual = await orig<typeof import("../src/api.ts")>();
  return { ...actual, api: { ...actual.api, models: vi.fn() } };
});
const models = api.models as unknown as ReturnType<typeof vi.fn>;
beforeEach(() => { models.mockReset(); resetModelCache(); models.mockResolvedValue([{ id: "auto", name: "Auto" }, { id: "gpt-x", name: "GPT X" }]); });

describe("ModelPicker", () => {
  it("shows the default by name, lists models, and reports a change (or null for default)", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn().mockResolvedValue(undefined);
    render(<ModelPicker value={undefined} defaultModel="gpt-x" onChange={onChange} />);
    const sel = screen.getByLabelText("Model for this chat") as HTMLSelectElement;
    await waitFor(() => expect(screen.getByRole("option", { name: "Default (GPT X)" })).toBeInTheDocument());
    expect(sel.value).toBe("");
    await user.selectOptions(sel, "auto");
    expect(onChange).toHaveBeenLastCalledWith("auto");
    await user.selectOptions(sel, "");
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("keeps an unknown saved model selectable instead of silently changing it", async () => {
    render(<ModelPicker value="retired-model" defaultModel="auto" onChange={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("option", { name: "retired-model" })).toBeInTheDocument());
    expect((screen.getByLabelText("Model for this chat") as HTMLSelectElement).value).toBe("retired-model");
  });

  it("shows the server's reason when the change is refused, and works with no model list", async () => {
    const user = userEvent.setup();
    models.mockRejectedValue(new Error("offline"));
    const onChange = vi.fn().mockRejectedValue(new Error("Wait for the current reply to finish."));
    render(<ModelPicker value="a" defaultModel="auto" onChange={onChange} />);
    await user.selectOptions(screen.getByLabelText("Model for this chat"), "");
    expect(await screen.findByRole("alert")).toHaveTextContent(/Wait for the current reply/);
  });

  it("is disabled while a reply runs", () => {
    render(<ModelPicker value={undefined} defaultModel="auto" disabled onChange={vi.fn()} />);
    expect(screen.getByLabelText("Model for this chat")).toBeDisabled();
  });
});
