import { useEffect, useState } from "react";
import { BINDING_IDS, BINDING_LABELS, DEFAULT_BINDINGS, comboFromEvent, formatCombo, saveBindings, stringifyCombo, validateBinding, type BindingId } from "./keybindings.ts";
import { useBindings } from "./useBindings.ts";
import { SettingRow, SettingsHeading } from "./components/overlay/settings-rows.tsx";

/** Settings panel for changing keyboard shortcuts. Click a shortcut, press the new keys, Esc to cancel. */
export function KeybindingSettings() {
  const keys = useBindings();
  const [capturing, setCapturing] = useState<BindingId | null>(null);
  const [message, setMessage] = useState<{ id: BindingId; text: string } | null>(null);

  useEffect(() => {
    if (!capturing) return;
    const id = capturing;
    const onKey = (e: KeyboardEvent) => {
      // Capture phase: while choosing, no other shortcut (or the page) may react to these keys.
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") { setCapturing(null); setMessage(null); return; }
      const combo = comboFromEvent(e);
      if (!combo) return; // only a modifier so far: keep waiting
      const norm = stringifyCombo(combo);
      const check = validateBinding(id, norm, keys);
      if (!check.ok) { setMessage({ id, text: check.reason }); return; }
      saveBindings({ ...keys, [id]: norm });
      setCapturing(null);
      setMessage(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [capturing, keys]);

  const changed = BINDING_IDS.some((id) => keys[id] !== DEFAULT_BINDINGS[id]);
  return (
    <>
      <SettingsHeading>Keyboard shortcuts</SettingsHeading>
      <p className="mb-1 text-xs leading-relaxed text-(--ui-text-tertiary)">Click a shortcut, then press the keys you want. Press Esc to cancel. Shortcuts need Ctrl/Cmd or Alt so typing is never interrupted. Saved in this browser.</p>
      <ul className="flex flex-col">
        {BINDING_IDS.map((id) => (
          <li key={id} className="border-t border-(--ui-stroke-quaternary) first:border-t-0">
            <SettingRow
              title={BINDING_LABELS[id]}
              control={
                <div className="flex items-center gap-1.5">
                  <button
                    className={`flex h-7 min-w-[5.5rem] items-center justify-center rounded-md border px-2 text-xs transition-colors duration-100 hover:transition-none ${capturing === id ? "border-(--dt-primary) text-foreground" : "border-(--ui-stroke-secondary) text-(--ui-text-secondary) hover:bg-(--ui-control-hover-background) hover:text-foreground"}`}
                    aria-label={`${BINDING_LABELS[id]}: ${formatCombo(keys[id])}. Change`}
                    onClick={() => { setMessage(null); setCapturing(capturing === id ? null : id); }}
                    type="button"
                  >
                    {capturing === id ? "Press keys…" : <kbd className="font-mono text-[0.6875rem]">{formatCombo(keys[id])}</kbd>}
                  </button>
                  <button
                    className="h-7 rounded-md px-2 text-xs text-(--ui-text-tertiary) transition-colors duration-100 hover:transition-none hover:text-foreground disabled:opacity-40 disabled:hover:text-(--ui-text-tertiary)"
                    disabled={keys[id] === DEFAULT_BINDINGS[id]}
                    aria-label={`Reset ${BINDING_LABELS[id]}`}
                    onClick={() => { saveBindings({ ...keys, [id]: DEFAULT_BINDINGS[id] }); setMessage(null); }}
                    type="button"
                  >
                    Reset
                  </button>
                </div>
              }
              below={message?.id === id ? <span className="over text-xs" role="alert">{message.text}</span> : undefined}
            />
          </li>
        ))}
      </ul>
      {changed && (
        <div className="pt-3">
          <button className="h-7 rounded-md border border-(--ui-stroke-secondary) px-3 text-xs text-(--ui-text-secondary) transition-colors duration-100 hover:transition-none hover:bg-(--ui-control-hover-background) hover:text-foreground" onClick={() => { saveBindings({ ...DEFAULT_BINDINGS }); setCapturing(null); setMessage(null); }} type="button">Reset all to defaults</button>
        </div>
      )}
    </>
  );
}
