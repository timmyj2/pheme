// Adapted from hermes-agent (MIT, Copyright (c) 2025 Nous Research), apps/desktop/src/components/ui/copy-button.tsx @ 5688461d
import { useEffect, useRef, useState } from "react";

export type CopyState = "idle" | "copied" | "failed";

/** How long the "Copied" confirmation stays before it reverts. */
export const COPY_CONFIRM_MS = 1500;

const ICON_PROPS = { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

function CopyIcon() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg {...ICON_PROPS}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

const LABEL: Record<CopyState, string> = { idle: "Copy code", copied: "Copied", failed: "Copy failed" };

/** Icon button that copies `text` and confirms for 1.5s. Position it with the parent (see `.copy-btn` in markdown.css). */
export function CopyButton({ text, className }: { text: string; className?: string }) {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    let next: CopyState = "copied";
    try {
      if (!navigator.clipboard?.writeText) throw new Error("no clipboard");
      await navigator.clipboard.writeText(text);
    } catch {
      next = "failed";
    }
    setState(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), COPY_CONFIRM_MS);
  };

  return (
    <button type="button" className={className ? `copy-btn ${className}` : "copy-btn"} aria-label={LABEL[state]} title={LABEL[state]} data-state={state} onClick={() => void copy()}>
      {state === "copied" ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
}
