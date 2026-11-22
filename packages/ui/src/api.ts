import type { BootstrapState, ChatEvent, ChatMeta, MemoryState, ModelOption, SeqEvent, Settings, SkillSummary, ApprovalDecision, Job, JobSchedule, AgentProfile, AgentRun, CuratorState } from "../../server/src/protocol.ts";

export type { CuratorState, AgentProfile, AgentRun, Job, JobSchedule, ChatEvent, ChatMeta, SeqEvent, Settings, BootstrapState, MemoryState, SkillSummary, ModelOption, ApprovalDecision };
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

/** An API failure. status 0 means the server could not be reached at all. */
export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function call<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch("/api" + path, {
      method,
      headers: { "x-pheme-token": token(), "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Can't reach Pheme. Is it still running?");
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, (data as { error?: string }).error ?? `HTTP ${r.status}`);
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
  jobs: () => call<Job[]>("/jobs"),
  createJob: (j: { name: string; prompt: string; schedule: JobSchedule; allowActions: boolean }) => call<Job>("/jobs", "POST", j),
  updateJob: (id: string, patch: Partial<Pick<Job, "enabled" | "name" | "prompt">>) => call<Job>(`/jobs/${id}`, "PUT", patch),
  runJob: (id: string) => call<{ ok: boolean }>(`/jobs/${id}/run`, "POST", {}),
  deleteJob: (id: string) => call<{ ok: boolean }>(`/jobs/${id}`, "DELETE"),
  agentRuns: () => call<AgentRun[]>("/agents"),
  agentProfiles: () => call<AgentProfile[]>("/agent-profiles"),
  saveAgentProfile: (p: AgentProfile) => call<AgentProfile>(`/agent-profiles/${encodeURIComponent(p.name)}`, "PUT", p),
  archiveAgentProfile: (name: string) => call<{ ok: boolean }>(`/agent-profiles/${encodeURIComponent(name)}`, "DELETE"),
  curator: () => call<CuratorState>("/curator"),
  runCurator: () => call<{ ok: boolean }>("/curator/run", "POST", {}),
  eventsUrl: (id: string, after: number) => `/api/chats/${id}/events?after=${after}&token=${encodeURIComponent(token())}`,
};
