/** Remembers when each chat was last viewed, so the sidebar can mark chats with new activity. */
const KEY = "pheme-seen";

export function loadSeen(): Record<string, number> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "{}") as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, number>) : {};
  } catch {
    return {};
  }
}

export function saveSeen(seen: Record<string, number>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(seen));
  } catch {
    /* ignore */
  }
}

/**
 * Chats that changed after they were last viewed. A chat never seen before counts as seen (so the first
 * run does not flag everything), and the open chat is always seen.
 */
export function computeUnread(chats: { id: string; updatedAt: number }[], seen: Record<string, number>, activeId: string | null): { unread: Set<string>; seen: Record<string, number> } {
  const next = { ...seen };
  const unread = new Set<string>();
  const ids = new Set(chats.map((c) => c.id));
  for (const id of Object.keys(next)) if (!ids.has(id)) delete next[id];
  for (const c of chats) {
    if (c.id === activeId || next[c.id] === undefined) next[c.id] = c.updatedAt;
    else if (c.updatedAt > next[c.id]) unread.add(c.id);
  }
  return { unread, seen: next };
}
