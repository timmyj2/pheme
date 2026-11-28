import type * as React from "react";
import type { SkillSummary } from "../../api.ts";

// Unlayered global button rules (app.css, styles.css) draw a box that Tailwind utilities cannot override, so the card's plain controls reset it inline.
const plain: React.CSSProperties = { border: 0, background: "none", boxShadow: "none", padding: 0, minHeight: 0, borderRadius: 0 };

// Sampled from the reference capabilities cards: navy top-left to faint warm brown bottom-right.
const cardFill: React.CSSProperties = { backgroundImage: "linear-gradient(135deg, #272d36 0%, #2a2a2b 50%, #2b261e 100%)", borderColor: "rgba(255, 255, 255, 0.08)" };
const chipFill: React.CSSProperties = { background: "#2c293a" };

/** Display only: "apple-notes" -> "Apple Notes". The real name stays in the title attribute and aria labels. */
export function skillDisplayName(name: string): string {
  return name.split(/[-_\s]+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

/** One skill as a card. Pheme has no enable switch for skills (the server only creates, edits and archives them), so the card offers Archive, not a fake toggle. */
export function SkillCard({ skill, onOpen, onArchive }: { skill: SkillSummary; onOpen: () => void; onArchive: () => void }) {
  const display = skillDisplayName(skill.name);
  return (
    <article className="flex min-h-40 flex-col gap-2 rounded-[6px] border p-4" style={cardFill}>
      <span className="self-start rounded-[3px] px-1.5 py-0.5 text-[11px] leading-none text-muted-foreground" style={chipFill}>Yours</span>
      <h3 className="m-0 mt-2 text-[18px] font-semibold leading-tight" title={skill.name}>
        <button type="button" onClick={onOpen} aria-label={`Open ${skill.name}`} className="cursor-pointer break-words border-0 bg-transparent p-0 text-left text-inherit shadow-none outline-none focus-visible:ring-2 focus-visible:ring-ring/40" style={plain}>{display}</button>
      </h3>
      <p className="m-0 line-clamp-3 text-[13px] leading-5 text-muted-foreground">{skill.description}</p>
      <div className="mt-auto flex items-center justify-between pt-3">
        <span className="rounded-[3px] px-1.5 py-0.5 text-[11px] leading-none text-muted-foreground" style={chipFill}>Yours</span>
        <div className="flex items-center gap-3">
          <button type="button" aria-label={`Archive ${skill.name}`} onClick={onArchive} className="text-xs text-muted-foreground hover:text-destructive" style={plain}>Archive</button>
          <button type="button" aria-label={`Edit ${skill.name}`} onClick={onOpen} className="text-xs text-primary" style={plain}>Edit</button>
        </div>
      </div>
    </article>
  );
}
