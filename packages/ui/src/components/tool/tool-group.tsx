// Adapted from hermes-agent (MIT, Copyright (c) 2025 Nous Research), apps/desktop/src/components/assistant-ui/tool/fallback.tsx @ 5688461d
// (ToolRun / ToolRunHeader split). Rewritten: runs and cards are split in lib/tool-map.ts terms, not assistant-ui ranges.
import { memo, useState } from "react";
import { DisclosureCaret } from "../ui/disclosure-caret.tsx";
import { TID } from "../../testids.ts";
import type { ToolItem } from "../../blocks.ts";
import { CARD_CATEGORIES, toolSpec } from "../../lib/tool-map.ts";
import { RunTicker } from "./run-ticker.tsx";
import { summarizeRun } from "./run-summary.tsx";
import { ToolRow } from "./tool-row.tsx";
import "./tool.css";

type Segment = { kind: "card"; item: ToolItem } | { kind: "run"; items: ToolItem[] };

/** Consecutive calls fold into one run; a file edit or a delegation breaks the run and stands alone. */
export function segmentRuns(items: ToolItem[]): Segment[] {
  const out: Segment[] = [];
  for (const item of items) {
    if (CARD_CATEGORIES.has(toolSpec(item.name).category)) {
      out.push({ kind: "card", item });
      continue;
    }
    const last = out[out.length - 1];
    if (last?.kind === "run") last.items.push(item);
    else out.push({ kind: "run", items: [item] });
  }
  return out;
}

function RunView({ items }: { items: ToolItem[] }) {
  const [open, setOpen] = useState(false);
  if (items.length === 1) return <ToolRow item={items[0]} />;
  const live = items.some((i) => i.ok === undefined);
  const failed = items.filter((i) => i.ok === false).length;
  return (
    <div className="tool-run">
      <button type="button" className="tool-run-head" data-testid={TID.runSummary} aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="tool-run-text">{summarizeRun(items)}</span>
        {failed > 0 && <span className="tool-run-failed">· {failed} failed</span>}
        <DisclosureCaret open={open} className="tool-caret" size="0.7rem" />
      </button>
      {open ? <div className="tool-run-body">{items.map((it) => <ToolRow key={it.id} item={it} />)}</div> : live ? <RunTicker items={items} /> : null}
    </div>
  );
}

export const ToolGroup = memo(function ToolGroup({ items }: { items: ToolItem[] }) {
  const segments = segmentRuns(items);
  return (
    <div className="tool-group" data-testid={TID.toolGroup}>
      {segments.map((s) => (s.kind === "card" ? <ToolRow key={s.item.id} item={s.item} /> : <RunView key={s.items[0].id} items={s.items} />))}
    </div>
  );
});
