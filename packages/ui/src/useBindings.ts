import { useEffect, useState } from "react";
import { KEYS_CHANGED, STORAGE_KEY, loadBindings, type BindingId } from "./keybindings.ts";

/** The current shortcut choices; updates when they change in Settings or in another tab. */
export function useBindings(): Record<BindingId, string> {
  const [b, setB] = useState(() => loadBindings());
  useEffect(() => {
    const sync = () => setB(loadBindings());
    const onStorage = (e: StorageEvent) => { if (e.key === STORAGE_KEY || e.key === null) sync(); };
    window.addEventListener(KEYS_CHANGED, sync);
    window.addEventListener("storage", onStorage);
    return () => { window.removeEventListener(KEYS_CHANGED, sync); window.removeEventListener("storage", onStorage); };
  }, []);
  return b;
}
