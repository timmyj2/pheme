import { Dialog } from "./Dialog.tsx";
import { SHORTCUTS } from "./shortcuts.ts";
import { BINDING_IDS, formatCombo, type BindingId } from "./keybindings.ts";
import { useBindings } from "./useBindings.ts";

export function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  const keys = useBindings();
  const keyText = (id: string, fallback: string) => ((BINDING_IDS as string[]).includes(id) ? formatCombo(keys[id as BindingId]) : fallback);
  const groups = ["Chat", "Navigation", "View"] as const;
  return (
    <Dialog label="Keyboard shortcuts" onClose={onClose} className="wide">
      <h2 className="dialog-title">Keyboard shortcuts</h2>
      <div className="shortcut-grid">
        {groups.map((g) => (
          <section key={g}>
            <h3 className="group-label">{g}</h3>
            <dl>
              {SHORTCUTS.filter((s) => s.group === g).map((s) => (
                <div key={s.id} className="shortcut"><dt>{s.label}</dt><dd><kbd>{keyText(s.id, s.keys)}</kbd></dd></div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <p className="muted small">Some of these can be changed in Settings → Keyboard shortcuts.</p>
      <div className="dialog-actions"><button className="btn" data-autofocus onClick={onClose}>Close</button></div>
    </Dialog>
  );
}
