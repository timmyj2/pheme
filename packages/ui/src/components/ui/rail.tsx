// Adapted from hermes-agent (MIT, Copyright (c) 2025 Nous Research), apps/desktop/src/app/shell/sidebar-label.tsx @ 5688461d (the dithered square and small-caps label).
import type { ReactNode } from "react";

/** The 8px dithered gold square that marks a rail section. */
export function DitherSquare() {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-2 shrink-0"
      style={{ backgroundImage: "conic-gradient(var(--dt-primary) 25%, transparent 0 50%, var(--dt-primary) 0 75%, transparent 0)", backgroundSize: "4px 4px" }}
    />
  );
}

/** Section heading in the rail and the right column: dither square, then a small-caps gold label. */
export function SectionLabel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <h2 className={`flex items-center gap-2 px-1 py-1 text-[0.64rem] font-semibold uppercase tracking-[0.16em] text-primary ${className}`}>
      <DitherSquare />
      <span>{children}</span>
    </h2>
  );
}
