// Adapted from hermes-agent (MIT, Copyright (c) 2025 Nous Research), apps/desktop/src/components/ui/card-stack.tsx @ 5688461d
// Rewritten: no generic item list or framer-motion. The front card is in flow; up to two peeks sit behind it, offset by
// GAP px per level and narrowed by SCALE per level. Promotion is a CSS transition on the card itself.
import type { ReactNode } from "react";
import "./tool.css";

export const GAP = 7;
export const SCALE = 0.96;
const MAX_PEEKS = 2;

/** `behind` is how many more cards wait under the front one. */
export function CardStack({ behind, children }: { behind: number; children: ReactNode }) {
  const peeks = Math.min(Math.max(0, behind), MAX_PEEKS);
  const pad = GAP * peeks;
  return (
    <div className="card-stack" style={{ paddingBottom: pad }} data-depth={behind}>
      {Array.from({ length: peeks }, (_, k) => {
        const level = k + 1;
        const inset = ((1 - SCALE ** level) / 2) * 100;
        return (
          <div
            key={level}
            aria-hidden="true"
            className="card-stack-peek"
            style={{ bottom: pad - GAP * level, left: `${inset}%`, right: `${inset}%`, zIndex: 10 - level }}
          />
        );
      })}
      <div className="card-stack-front" style={{ zIndex: 10 }}>{children}</div>
    </div>
  );
}
