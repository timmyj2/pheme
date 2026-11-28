// Adapted from hermes-agent (MIT, Copyright (c) 2025 Nous Research), apps/desktop/src/components/chat/code-card.tsx @ 5688461d
import type { ReactNode } from "react";
import { CopyButton } from "./copy-button.tsx";
import { ExpandableBlock } from "./expandable-block.tsx";

/**
 * A fenced code block: a tinted slab with no header and no language label. It caps at 7.5rem with a fade and a chevron,
 * and a copy button appears on hover (always visible on touch screens and when focused).
 */
export function CodeCard({ code, children }: { code: string; children: ReactNode }) {
  return (
    <div className="code-card" data-slot="code-card">
      <ExpandableBlock>
        <pre>{children}</pre>
      </ExpandableBlock>
      <CopyButton text={code} />
    </div>
  );
}
