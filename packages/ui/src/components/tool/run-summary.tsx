// Adapted from hermes-agent (MIT, Copyright (c) 2025 Nous Research), apps/desktop/src/components/assistant-ui/tool/run-summary.tsx @ 5688461d
// Rewritten: the category table and wording come from lib/tool-map.ts, and it takes Pheme's ToolItem shape.
import { toolTarget, toolSpec, CATEGORY_ORDER, CATEGORY_WORDS } from "../../lib/tool-map.ts";

export interface SummaryItem {
  name: string;
  args: unknown;
  ok?: boolean;
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * "Explored 3 files, ran 5 commands". Categories appear in a fixed order; later clauses are lowercased. A single call
 * names its target ("Explored wiring.tsx"). A category with a call still running uses the present tense.
 */
export function summarizeRun(items: SummaryItem[]): string {
  const clauses: string[] = [];
  for (const category of CATEGORY_ORDER) {
    const group = items.filter((i) => toolSpec(i.name).category === category);
    if (!group.length) continue;
    const words = CATEGORY_WORDS[category];
    const live = group.some((i) => i.ok === undefined);
    const verb = live ? upperFirst(words.present) : words.past;
    const target = group.length === 1 ? toolTarget(group[0].args) : "";
    if (target) {
      clauses.push(`${verb} ${category === "search" ? `“${target}”` : target}`);
      continue;
    }
    clauses.push(`${verb} ${group.length} ${group.length === 1 ? words.one : words.many}`);
  }
  return clauses.map((c, i) => (i === 0 ? c : lowerFirst(c))).join(", ");
}
