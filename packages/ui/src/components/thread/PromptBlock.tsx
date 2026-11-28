import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { TID } from "../../testids.ts";
import { Enter } from "./Enter.tsx";

const CLAMP_LINES = 4;

/**
 * The user's prompt: a full-width gold-tinted bar that sticks to the top of its turn while the replies scroll under it.
 * Clamped to four lines with a fade; a "Show all" button lifts the clamp.
 */
export function PromptBlock({ id, enabled, pending, failed, children, footer }: { id: string; enabled: boolean; pending?: boolean; failed?: boolean; children: ReactNode; footer?: ReactNode }) {
  const textRef = useRef<HTMLDivElement>(null);
  const [clamped, setClamped] = useState(false);
  const [expanded, setExpanded] = useState(false);
  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el) return;
    const measure = () => {
      const size = parseFloat(getComputedStyle(el).fontSize) || 16;
      setClamped(el.offsetHeight > CLAMP_LINES * 1.5 * size + 1);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const lifted = expanded || !clamped;
  // The sticky wrapper is the turn's direct child, so it holds for the whole turn. Attachments sit below it in flow.
  return (
    <>
    <Enter id={id} enabled={enabled} className={`turn-prompt${pending ? " pending" : ""}${failed ? " failed" : ""}`} style={{ position: "sticky", top: "0.23rem", zIndex: 3 }} testId={TID.userMessage}>
      <div className="prompt-bar">
        <div className="prompt-clamp" data-clamped={clamped && !expanded ? "true" : undefined}>
          <div className="prompt-text" data-testid={TID.userBlock} ref={textRef}>{children}</div>
        </div>
        {clamped && (
          <button type="button" className="prompt-toggle" onClick={() => setExpanded(!lifted)} aria-expanded={lifted}>
            {lifted ? "Show less" : "Show all"}
          </button>
        )}
      </div>
    </Enter>
    {footer}
    </>
  );
}
