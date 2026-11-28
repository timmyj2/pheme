import { ModelPicker, useModelList } from "../../ModelPicker.tsx";
import { ReasoningPill } from "./reasoning-pill.tsx";

interface Props {
  /** This chat's own model, or undefined when it follows the default. */
  model: string | undefined;
  defaultModel: string;
  reasoningEffort: string;
  disabled?: boolean;
  onModelChange: (model: string | null) => Promise<void>;
  onEffortChange: (effort: string) => void;
}

/** The composer's right-hand pills: model, then reasoning effort when the chosen model reports levels. */
export function ModelControls({ model, defaultModel, reasoningEffort, disabled, onModelChange, onEffortChange }: Props) {
  const models = useModelList();
  const effective = model || defaultModel;
  const info = models.find((m) => m.id === effective);
  const efforts = info?.reasoningEfforts ?? [];
  const value = reasoningEffort || info?.defaultReasoningEffort || efforts[0] || "";
  return (
    <>
      <ModelPicker value={model} defaultModel={defaultModel} disabled={disabled} onChange={onModelChange} />
      <ReasoningPill efforts={efforts} value={value} disabled={disabled} onChange={onEffortChange} />
    </>
  );
}
