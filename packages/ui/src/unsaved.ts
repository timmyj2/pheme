import { useEffect, useRef } from "react";

// Editors (memory, skills) register here while they hold unsaved edits, so the app can ask before navigating away.
const dirty = new Set<symbol>();
export const hasUnsaved = () => dirty.size > 0;
export const clearUnsaved = () => dirty.clear();

export function useUnsaved(isDirty: boolean): void {
  const id = useRef(Symbol("unsaved"));
  useEffect(() => {
    const key = id.current;
    if (isDirty) dirty.add(key);
    else dirty.delete(key);
    return () => { dirty.delete(key); };
  }, [isDirty]);
}
