/** Open chat tabs: the pure rules behind the tab strip (App.tsx keeps the state, this file decides). */
export const TABS_KEY = "pheme-open-tabs";

/** The open tab ids in tab order, from this browser's storage. Blocked or corrupt storage gives no tabs. */
export function readOpenTabs(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(TABS_KEY) || "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Saves the open tab ids. A failed write only means the tabs are not remembered after a reload. */
export function writeOpenTabs(ids: string[]): void {
  try { localStorage.setItem(TABS_KEY, JSON.stringify(ids)); } catch { /* private mode: tabs last only this visit */ }
}

/** Opening a chat adds its tab at the end, unless it already has one. */
export function withTab(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids : [...ids, id];
}

/** Drops tabs whose chat no longer exists (deleted elsewhere). Returns the same array when nothing changed. */
export function pruneTabs(ids: string[], known: ReadonlySet<string>): string[] {
  return ids.every((id) => known.has(id)) ? ids : ids.filter((id) => known.has(id));
}

/** The tab that takes over when `id` closes: the one to its right, else the one to its left, else none (a new chat). */
export function neighbourTab(ids: string[], id: string): string | null {
  const i = ids.indexOf(id);
  if (i < 0) return null;
  return ids[i + 1] ?? ids[i - 1] ?? null;
}
