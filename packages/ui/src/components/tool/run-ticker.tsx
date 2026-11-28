// Adapted from hermes-agent (MIT, Copyright (c) 2025 Nous Research), apps/desktop/src/components/assistant-ui/tool/run-ticker.tsx @ 5688461d
// Rewritten: one fixed-height reel of call lines; the CSS transition (240ms, none under reduced motion) does the slide.
import { TID } from "../../testids.ts";
import type { ToolItem } from "../../blocks.ts";
import { toolView } from "../../lib/tool-map.ts";
import "./tool.css";

export const TICKER_LINE_PX = 20;
/** Only the newest lines are kept in the reel, so a long run stays cheap to render. */
const KEEP = 20;

export function RunTicker({ items }: { items: ToolItem[] }) {
  const lines = items.slice(-KEEP);
  const index = lines.length - 1;
  return (
    <div className="tool-ticker" data-testid={TID.toolTicker} aria-hidden="true">
      <div className="tool-ticker-reel" data-index={index} style={{ transform: `translateY(${-index * TICKER_LINE_PX}px)` }}>
        {lines.map((item) => {
          const running = item.ok === undefined;
          const view = toolView(item.name, item.args, running);
          return (
            <div key={item.id} className="tool-ticker-line">
              <span className={`tool-title${running ? " tool-shimmer" : ""}`}>{view.title}</span>
              {view.target && <span className="tool-target">{view.target}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
