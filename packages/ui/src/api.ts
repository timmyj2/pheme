import type { BootstrapState, ChatEvent, ChatMeta, MemoryState, ModelOption, SeqEvent, Settings, SkillSummary, ApprovalDecision, Job, JobSchedule, AgentProfile, AgentRun, CuratorState } from "../../server/src/protocol.ts";

export type { BackupPreview } from "../../server/src/backup.ts";
import type { AttachmentRef } from "../../server/src/attachments.ts";
export type { Prompt } from "../../server/src/prompts.ts";
export type { AttachmentRef } from "../../server/src/attachments.ts";
export type { BranchList, BranchInfo, StashEntry } from "../../server/src/gitbranch.ts";
export type { GitStatus, ChangedFile, FileDiff, RemoteInfo, PrInfo, PrDetail, PrCheck } from "../../server/src/git.ts";
export type { CuratorState, AgentProfile, AgentRun, Job, JobSchedule, ChatEvent, ChatMeta, SeqEvent, Settings, BootstrapState, MemoryState, SkillSummary, ModelOption, ApprovalDecision };
export type ChatRow = ChatMeta & { busy?: boolean; /** A tool is waiting for the user's approval. */ waiting?: boolean };

const KEY = "pheme-token";

/**
 * The launcher opens /?token=...; keep it for this tab and take it out of the address bar. A copy is also kept in this
 * browser's local storage, so an installed Pheme window (which starts with no address and no tab storage) can pick up the
 * key from the last time Pheme was opened. Each Pheme start makes a new key, so an old copy simply stops working.
 */
export function initToken(): string {
  const url = new URL(window.location.href);
  const t = url.searchParams.get("token");
  if (t) {
    sessionStorage.setItem(KEY, t);
    try { localStorage.setItem(KEY, t); } catch { /* private mode: this tab still works */ }
    url.searchParams.delete("token");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }
  if (!sessionStorage.getItem(KEY)) adoptSharedToken();
  return sessionStorage.getItem(KEY) ?? "";
}

/** Take the newest key another window of this Pheme saved. Returns true when it differs from the one this tab has. */
export function adoptSharedToken(): boolean {
  let shared: string | null = null;
  try { shared = localStorage.getItem(KEY); } catch { return false; }
  if (!shared || shared === sessionStorage.getItem(KEY)) return false;
  sessionStorage.setItem(KEY, shared);
  return true;
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

export interface SearchHit { id: string; title: string; updatedAt: number; snippet: string; role: "you" | "pheme" }

/** Download a chat as Markdown: returns the file contents and the name the server suggested. */
async function exportChat(id: string): Promise<{ blob: Blob; name: string }> {
  let r: Response;
  try {
    r = await fetch(`/api/chats/${id}/export`, { headers: { "x-pheme-token": token() } });
  } catch {
    throw new ApiError(0, "Can't reach Pheme. Is it still running?");
  }
  if (!r.ok) throw new ApiError(r.status, ((await r.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${r.status}`);
  const cd = r.headers.get("content-disposition") ?? "";
  const star = /filename\*=UTF-8''([^;]+)/i.exec(cd)?.[1];
  let name = "chat.md";
  try { if (star) name = decodeURIComponent(star); } catch { /* keep the default */ }
  return { blob: await r.blob(), name };
}

/** Send a file as the raw request body (used for restore). */
async function postFile<T>(path: string, file: File): Promise<T> {
  let r: Response;
  try {
    r = await fetch("/api" + path, { method: "POST", headers: { "x-pheme-token": token(), "content-type": "application/octet-stream" }, body: file });
  } catch {
    throw new ApiError(0, "Can't reach Pheme. Is it still running?");
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, (data as { error?: string }).error ?? (r.status === 413 ? "That file is too large." : `HTTP ${r.status}`));
  return data as T;
}

async function downloadBackup(): Promise<{ blob: Blob; name: string }> {
  let r: Response;
  try {
    r = await fetch("/api/backup", { headers: { "x-pheme-token": token() } });
  } catch {
    throw new ApiError(0, "Can't reach Pheme. Is it still running?");
  }
  if (!r.ok) throw new ApiError(r.status, ((await r.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${r.status}`);
  const name = /filename="([^"]+)"/.exec(r.headers.get("content-disposition") ?? "")?.[1] ?? "pheme.pheme-backup";
  return { blob: await r.blob(), name };
}

export const api = {
  downloadBackup,
  previewRestore: (file: File) => postFile<import("../../server/src/backup.ts").BackupPreview>("/restore/preview", file),
  restore: (file: File, overwrite: boolean) => postFile<{ written: number; skipped: number; safetyBackup?: string }>(`/restore${overwrite ? "?overwrite=1" : ""}`, file),
  exportChat,
  search: (q: string) => call<{ hits: SearchHit[]; partial: boolean }>(`/search?q=${encodeURIComponent(q)}`),
  state: () => call<BootstrapState>("/state"),
  models: () => call<ModelOption[]>("/models"),
  settings: (patch: Partial<Settings>) => call<Settings>("/settings", "PUT", patch),
  chats: () => call<ChatRow[]>("/chats"),
  newChat: () => call<ChatMeta>("/chats", "POST", {}),
  chat: (id: string) => call<{ meta: ChatMeta; busy: boolean; events: SeqEvent[] }>(`/chats/${id}`),
  patchChat: (id: string, patch: Partial<Pick<ChatMeta, "title" | "pinned" | "archived">> & { projectDir?: string | null; model?: string | null }) => call<ChatMeta>(`/chats/${id}`, "PATCH", patch),
  gitStatus: (id: string) => call<import("../../server/src/git.ts").GitStatus>(`/chats/${id}/git`),
  gitDiff: (id: string, path: string) => call<import("../../server/src/git.ts").FileDiff>(`/chats/${id}/git/diff?path=${encodeURIComponent(path)}`),
  gitCommit: (id: string, body: { message: string; paths: string[]; branch?: string; allowRisky?: string[] }) => call<{ sha: string; short: string; branch: string; summary: string; files: number }>(`/chats/${id}/git/commit`, "POST", body),
  gitUndo: (id: string, sha: string) => call<{ undone: string }>(`/chats/${id}/git/undo`, "POST", { sha }),
  gitBranches: (id: string) => call<import("../../server/src/gitbranch.ts").BranchList>(`/chats/${id}/git/branches`),
  gitSwitch: (id: string, b: { name: string; create?: boolean; stash?: boolean }) => call<{ branch: string; created: boolean; stashed: boolean }>(`/chats/${id}/git/switch`, "POST", b),
  gitStashes: (id: string) => call<{ stashes: import("../../server/src/gitbranch.ts").StashEntry[]; more: number }>(`/chats/${id}/git/stash`),
  gitStashPush: (id: string, b: { message?: string; includeUntracked?: boolean }) => call<{ stashed: true }>(`/chats/${id}/git/stash`, "POST", b),
  gitStashApply: (id: string, sha: string, drop: boolean) => call<{ applied: true; dropped: boolean }>(`/chats/${id}/git/stash/apply`, "POST", { sha, drop }),
  gitStashDrop: (id: string, sha: string) => call<{ dropped: true }>(`/chats/${id}/git/stash/drop`, "POST", { sha }),
  gitPrDetail: (id: string) => call<{ pr: import("../../server/src/git.ts").PrDetail | null }>(`/chats/${id}/git/pr`),
  gitRemote: (id: string) => call<import("../../server/src/git.ts").RemoteInfo>(`/chats/${id}/git/remote`),
  gitPush: (id: string) => call<{ branch: string; remote: string; output: string }>(`/chats/${id}/git/push`, "POST", {}),
  gitPr: (id: string, body: { title: string; body?: string; base?: string; draft?: boolean }) => call<{ url: string; number?: number }>(`/chats/${id}/git/pr`, "POST", body),
  deleteChat: (id: string) => call<{ ok: boolean }>(`/chats/${id}`, "DELETE"),
  send: (id: string, text: string, attachments?: string[]) => call<{ ok: boolean }>(`/chats/${id}/messages`, "POST", attachments?.length ? { text, attachments } : { text }),
  uploadAttachment: (id: string, file: File) => postFile<AttachmentRef>(`/chats/${id}/attachments?name=${encodeURIComponent(file.name || "file")}`, file),
  attachmentBlob: async (id: string, attId: string): Promise<Blob> => {
    let r: Response;
    try { r = await fetch(`/api/chats/${id}/attachments/${attId}`, { headers: { "x-pheme-token": token() } }); } catch { throw new ApiError(0, "Can't reach Pheme. Is it still running?"); }
    if (!r.ok) throw new ApiError(r.status, r.status === 404 ? "This file is no longer available." : `HTTP ${r.status}`);
    return r.blob();
  },
  stop: (id: string) => call<{ ok: boolean }>(`/chats/${id}/stop`, "POST", {}),
  approve: (id: string, approvalId: string, decision: ApprovalDecision) => call<{ ok: boolean }>(`/chats/${id}/approvals/${approvalId}`, "POST", { decision }),
  memory: () => call<MemoryState>("/memory"),
  saveMemory: (store: "memory" | "user", entries: string[]) => call<MemoryState>("/memory", "PUT", { store, entries }),
  skills: () => call<SkillSummary[]>("/skills"),
  skill: (name: string) => call<{ name: string; content: string; files: string[] }>(`/skills/${encodeURIComponent(name)}`),
  saveSkill: (name: string, content: string) => call<{ ok: boolean }>(`/skills/${encodeURIComponent(name)}`, "PUT", { content }),
  archiveSkill: (name: string) => call<{ ok: boolean }>(`/skills/${encodeURIComponent(name)}`, "DELETE"),
  prompts: () => call<import("../../server/src/prompts.ts").Prompt[]>("/prompts"),
  createPrompt: (b: { name: string; text: string; projectDir?: string }) => call<import("../../server/src/prompts.ts").Prompt>("/prompts", "POST", b),
  updatePrompt: (id: string, b: { name?: string; text?: string; projectDir?: string }) => call<import("../../server/src/prompts.ts").Prompt>(`/prompts/${id}`, "PUT", b),
  deletePrompt: (id: string) => call<{ ok: boolean }>(`/prompts/${id}`, "DELETE"),
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
