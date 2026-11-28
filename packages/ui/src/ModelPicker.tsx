import { useEffect, useState } from "react";
import { IconChevronDown } from "./lib/icons.ts";
import { api, type ModelOption } from "./api.ts";

let cache: ModelOption[] | null = null;
let inflight: Promise<ModelOption[]> | null = null;
/** Models are listed once per page load; the list rarely changes and asking Copilot for it is slow. */
export function loadModels(): Promise<ModelOption[]> {
  if (cache) return Promise.resolve(cache);
  inflight ??= api.models().then((m) => { cache = m; return m; }).finally(() => { inflight = null; });
  return inflight;
}
export function resetModelCache(): void { cache = null; inflight = null; }

/** The model list, empty until it has loaded. */
export function useModelList(): ModelOption[] {
  const [models, setModels] = useState<ModelOption[]>(cache ?? []);
  useEffect(() => { let dead = false; void loadModels().then((m) => { if (!dead) setModels(m); }).catch(() => {}); return () => { dead = true; }; }, []);
  return models;
}

interface Props {
  /** This chat's own model, or undefined when it follows the default. */
  value: string | undefined;
  /** The default from Settings, shown as "Default (…)". */
  defaultModel: string;
  disabled?: boolean;
  onChange: (model: string | null) => Promise<void>;
}

/** The model pill in the composer: a ghost pill around a native select, so keyboard and screen-reader behaviour stay native. */
export function ModelPicker({ value, defaultModel, disabled, onChange }: Props) {
  const models = useModelList();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const nameOf = (id: string) => models.find((m) => m.id === id)?.name ?? id;
  const unknown = value && !models.some((m) => m.id === value);

  return (
    <label className="model-pick" title={err || "Model for this chat. Takes effect from the next message."}>
      <span className="model-pick-label" aria-hidden="true">{value ? nameOf(value) : `Default (${nameOf(defaultModel)})`}</span>
      <IconChevronDown className="model-pick-chevron" aria-hidden="true" />
      <select
        aria-label="Model for this chat"
        value={value ?? ""}
        disabled={disabled || busy}
        onChange={async (e) => {
          setBusy(true);
          setErr("");
          try {
            await onChange(e.target.value || null);
          } catch (x) {
            setErr((x as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <option value="">Default ({nameOf(defaultModel)})</option>
        {unknown && <option value={value}>{value}</option>}
        {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
      {err && <span className="project-branch warn" role="alert">{err}</span>}
    </label>
  );
}
