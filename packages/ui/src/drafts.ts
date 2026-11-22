/** Per-chat unsent text and sent-message history, kept in localStorage (all calls are failure-safe). */
const DRAFT = "pheme-draft:";
const HISTORY = "pheme-history";
const MAX_HISTORY = 50;

function get(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function set(k: string, v: string | null) {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* storage full or blocked: drafts are a convenience only */
  }
}

export const draftKey = (chatId: string | null) => DRAFT + (chatId ?? "new");
export const loadDraft = (chatId: string | null) => get(draftKey(chatId)) ?? "";
export const saveDraft = (chatId: string | null, text: string) => set(draftKey(chatId), text ? text : null);

export function loadHistory(): string[] {
  try {
    const v = JSON.parse(get(HISTORY) ?? "[]") as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
export function pushHistory(text: string) {
  const h = loadHistory().filter((x) => x !== text);
  h.push(text);
  set(HISTORY, JSON.stringify(h.slice(-MAX_HISTORY)));
}
