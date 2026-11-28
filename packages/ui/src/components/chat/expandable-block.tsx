// Adapted from hermes-agent (MIT, Copyright (c) 2025 Nous Research), apps/desktop/src/components/chat/expandable-block.tsx @ 5688461d
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";

/** Collapsed height is 7.5rem (120px); a block only gets the toggle when it is taller than that plus a line of slack. */
const OVERFLOW_PX = 121;

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" data-open={open ? "" : undefined}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

/** Caps its content at 7.5rem with a fade and a chevron to expand, but only when the content overflows. */
export function ExpandableBlock({ children }: { children: ReactNode }) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);

  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const measure = () => setOverflowing(el.scrollHeight > OVERFLOW_PX);
    measure();
    // Streaming grows the block until it hits the cap; the observer catches that and width changes.
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="expandable">
      <div ref={innerRef} className="expandable-scroll" data-expanded={expanded && overflowing ? "" : undefined}>
        {children}
      </div>
      {overflowing && (
        <div className="expandable-fade">
          <button type="button" className="expandable-toggle" aria-expanded={expanded} aria-label={expanded ? "Collapse" : "Expand"} onClick={() => setExpanded((v) => !v)}>
            <ChevronIcon open={expanded} />
          </button>
        </div>
      )}
    </div>
  );
}
