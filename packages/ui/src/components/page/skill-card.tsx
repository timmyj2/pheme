import type * as React from "react";
import type { SkillSummary } from "../../api.ts";

// Unlayered global button rules (app.css, styles.css) draw a box that Tailwind utilities cannot override, so the card's plain controls reset it inline.
const plain: React.CSSProperties = { border: 0, background: "none", boxShadow: "none", padding: 0, minHeight: 0, borderRadius: 0 };

/** One skill as a card. Pheme has no enable switch for skills (the server only creates, edits and archives them), so the card offers Archive, not a fake toggle. */
export function SkillCard({ skill, onOpen, onArchive }: { skill: SkillSummary; onOpen: () => void; onArchive: () => void }) {
  return (
    <article className="flex min-h-40 flex-col gap-2 rounded-[6px] border border-(--ui-stroke-secondary) bg-(--ui-bg-card) p-4">
      <span className="text-xs text-muted-foreground">Yours</span>
      <h3 className="m-0 text-lg font-semibold leading-tight">
        <button type="button" onClick={onOpen} className="cursor-pointer break-all border-0 bg-transparent p-0 text-left text-inherit shadow-none outline-none focus-visible:ring-2 focus-visible:ring-ring/40">{skill.name}</button>
      </h3>
      <p className="m-0 line-clamp-3 text-[13px] leading-5 text-muted-foreground">{skill.description}</p>
      <div className="mt-auto flex items-center justify-between pt-2">
        <button type="button" aria-label={`Archive ${skill.name}`} onClick={onArchive} className="text-xs text-muted-foreground hover:text-destructive" style={plain}>Archive</button>
        <button type="button" aria-label={`Open ${skill.name}`} onClick={onOpen} className="text-xs text-primary" style={plain}>Edit</button>
      </div>
    </article>
  );
}
