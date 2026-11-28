import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ModelControls } from "../src/components/composer/model-controls.tsx";
import { resetModelCache } from "../src/ModelPicker.tsx";
import { api } from "../src/api.ts";
import { TID } from "../src/testids.ts";

vi.mock("../src/api.ts", async (orig) => {
  const actual = await orig<typeof import("../src/api.ts")>();
  return { ...actual, api: { ...actual.api, models: vi.fn() } };
});

const models = [
  { id: "auto", name: "Auto" },
  { id: "mini", name: "Mini" },
  { id: "large", name: "Large", reasoningEfforts: ["low", "medium", "high"], defaultReasoningEffort: "medium" },
];
const props = { model: undefined, defaultModel: "large", reasoningEffort: "", disabled: false, onModelChange: vi.fn(async () => {}), onEffortChange: vi.fn() };

beforeEach(() => {
  resetModelCache();
  vi.clearAllMocks();
  vi.mocked(api.models).mockResolvedValue(models);
});

describe("reasoning effort pill", () => {
  it("is shown for a model that reports levels, showing the model default", async () => {
    render(<ModelControls {...props} />);
    const pill = await screen.findByTestId(TID.effortPill);
    expect(pill).toHaveTextContent("Med");
  });

  it("is hidden for a model without support", async () => {
    render(<ModelControls {...props} model="mini" defaultModel="mini" />);
    await screen.findByLabelText("Model for this chat");
    expect(screen.queryByTestId(TID.effortPill)).toBeNull();
  });

  it("is hidden for Auto, which has no fixed model to report on", async () => {
    render(<ModelControls {...props} model="auto" defaultModel="auto" />);
    await screen.findByLabelText("Model for this chat");
    expect(screen.queryByTestId(TID.effortPill)).toBeNull();
  });

  it("the menu offers the model's levels and reports the one picked", async () => {
    const user = userEvent.setup();
    const onEffortChange = vi.fn();
    render(<ModelControls {...props} reasoningEffort="low" onEffortChange={onEffortChange} />);
    expect(await screen.findByTestId(TID.effortPill)).toHaveTextContent("Low");
    await user.click(screen.getByTestId(TID.effortPill));
    expect(await screen.findByTestId(`${TID.effortOption}-high`)).toBeInTheDocument();
    await user.click(screen.getByTestId(`${TID.effortOption}-high`));
    expect(onEffortChange).toHaveBeenCalledWith("high");
  });

  it("shows a saved effort on a model that reports levels", async () => {
    render(<ModelControls {...props} reasoningEffort="high" />);
    await screen.findByTestId(TID.effortPill);
    expect(screen.getByTestId(TID.effortPill)).toHaveTextContent("High");
  });
});
