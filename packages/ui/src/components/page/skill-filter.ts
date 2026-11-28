import type { SkillSummary } from "../../api.ts";

/** Pheme keeps no categories or tags, so a category is the first word of a skill name ("apple-notes" -> "apple"). */
export function skillCategory(name: string): string | null {
  const m = /^([a-z0-9]+)[-_]/.exec(name);
  return m ? m[1] : null;
}

/** Categories worth a filter chip: at least two skills share the word. Most common first. */
export function skillCategories(list: SkillSummary[]): string[] {
  const counts = new Map<string, number>();
  for (const s of list) {
    const c = skillCategory(s.name);
    if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([c]) => c);
}

/** Every word of the query must appear in the name or description; a category, when chosen, must match. */
export function filterSkills(list: SkillSummary[], query: string, category: string | "All"): SkillSummary[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return list.filter((s) => {
    if (category !== "All" && skillCategory(s.name) !== category) return false;
    const hay = `${s.name}\n${s.description}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

export interface SkillGroup { title: string; items: SkillSummary[] }

const cap = (c: string) => c.charAt(0).toUpperCase() + c.slice(1);

/** With the All chip and at least one category, skills are grouped under their category; a chosen category is one group named for it; otherwise one group. */
export function groupSkills(list: SkillSummary[], categories: string[], category: string | "All"): SkillGroup[] {
  if (category !== "All") return [{ title: cap(category), items: list }];
  if (categories.length === 0) return [{ title: "Your skills", items: list }];
  const groups: SkillGroup[] = categories.map((c) => ({ title: cap(c), items: list.filter((s) => skillCategory(s.name) === c) }));
  const rest = list.filter((s) => !categories.includes(skillCategory(s.name) ?? ""));
  if (rest.length) groups.push({ title: "Other", items: rest });
  return groups.filter((g) => g.items.length > 0);
}
