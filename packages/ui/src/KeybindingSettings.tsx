import { useEffect, useState } from "react";
import { BINDING_IDS, BINDING_LABELS, DEFAULT_BINDINGS, comboFromEvent, formatCombo, saveBindings, stringifyCombo, validateBinding, type BindingId } from "./keybindings.ts";
import { useBindings } from "./useBindings.ts";
import { TID } from "./testids.ts";

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
    <div className="panel" data-testid={TID.settingsPanel}>
      <h3>Keyboard shortcuts</h3>
      <p className="muted small">Click a shortcut, then press the keys you want. Press Esc to cancel. Shortcuts need Ctrl/Cmd or Alt so typing is never interrupted. Saved in this browser.</p>
      <ul className="key-list">
        {BINDING_IDS.map((id) => (
          <li key={id} className="key-row">
            <span>{BINDING_LABELS[id]}</span>
            <span className="spacer" />
            <button
              className={`btn small key-btn${capturing === id ? " capturing" : ""}`}
              aria-label={`${BINDING_LABELS[id]}: ${formatCombo(keys[id])}. Change`}
              onClick={() => { setMessage(null); setCapturing(capturing === id ? null : id); }}
            >
              {capturing === id ? "Press keys…" : <kbd>{formatCombo(keys[id])}</kbd>}
            </button>
            <button className="btn small" disabled={keys[id] === DEFAULT_BINDINGS[id]} aria-label={`Reset ${BINDING_LABELS[id]}`} onClick={() => { saveBindings({ ...keys, [id]: DEFAULT_BINDINGS[id] }); setMessage(null); }}>Reset</button>
            {message?.id === id && <span className="notice error key-msg" role="alert">{message.text}</span>}
          </li>
        ))}
      </ul>
      {changed && <div className="row"><button className="btn" onClick={() => { saveBindings({ ...DEFAULT_BINDINGS }); setCapturing(null); setMessage(null); }}>Reset all to defaults</button></div>}
    </div>
  );
}
