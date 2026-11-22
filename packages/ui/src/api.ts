import type { BootstrapState, ChatEvent, ChatMeta, MemoryState, ModelOption, SeqEvent, Settings, SkillSummary, ApprovalDecision } from "../../server/src/protocol.ts";

export type { ChatEvent, ChatMeta, SeqEvent, Settings, BootstrapState, MemoryState, SkillSummary, ModelOption, ApprovalDecision };
export type ChatRow = ChatMeta & { busy?: boolean };

const KEY = "pheme-token";

/** The launcher opens /?token=...; keep it for this tab and take it out of the address bar. */
export function initToken(): string {
  const url = new URL(window.location.href);
  const t = url.searchParams.get("token");
  if (t) {
    sessionStorage.setItem(KEY, t);
    url.searchParams.delete("token");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }
  return sessionStorage.getItem(KEY) ?? "";
}
export const token = () => sessionStorage.getItem(KEY) ?? "";

async function call<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const r = await fetch("/api" + path, {
    method,
    headers: { "x-pheme-token": token(), "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${r.status}`);
  return data as T;
}

export const api = {
  state: () => call<BootstrapState>("/state"),
  models: () => call<ModelOption[]>("/models"),
  settings: (patch: Partial<Settings>) => call<Settings>("/settings", "PUT", patch),
  chats: () => call<ChatRow[]>("/chats"),
  newChat: () => call<ChatMeta>("/chats", "POST", {}),
  chat: (id: string) => call<{ meta: ChatMeta; busy: boolean; events: SeqEvent[] }>(`/chats/${id}`),
  patchChat: (id: string, patch: Partial<Pick<ChatMeta, "title" | "pinned" | "archived">>) => call<ChatMeta>(`/chats/${id}`, "PATCH", patch),
  deleteChat: (id: string) => call<{ ok: boolean }>(`/chats/${id}`, "DELETE"),
  send: (id: string, text: string) => call<{ ok: boolean }>(`/chats/${id}/messages`, "POST", { text }),
  stop: (id: string) => call<{ ok: boolean }>(`/chats/${id}/stop`, "POST", {}),
  approve: (id: string, approvalId: string, decision: ApprovalDecision) => call<{ ok: boolean }>(`/chats/${id}/approvals/${approvalId}`, "POST", { decision }),
  memory: () => call<MemoryState>("/memory"),
  saveMemory: (store: "memory" | "user", entries: string[]) => call<MemoryState>("/memory", "PUT", { store, entries }),
  skills: () => call<SkillSummary[]>("/skills"),
  skill: (name: string) => call<{ name: string; content: string; files: string[] }>(`/skills/${encodeURIComponent(name)}`),
  saveSkill: (name: string, content: string) => call<{ ok: boolean }>(`/skills/${encodeURIComponent(name)}`, "PUT", { content }),
  archiveSkill: (name: string) => call<{ ok: boolean }>(`/skills/${encodeURIComponent(name)}`, "DELETE"),
  eventsUrl: (id: string, after: number) => `/api/chats/${id}/events?after=${after}&token=${encodeURIComponent(token())}`,
};
