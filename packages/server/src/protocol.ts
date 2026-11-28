import type { AttachmentRef } from "./attachments.ts";
// Types shared by the server and the browser UI. Keep this file dependency-free.

export interface ChatMeta {
  id: string;
  title: string;
  pinned: boolean;
  archived: boolean;
  hidden?: boolean;
  createdAt: number;
  updatedAt: number;
  /** Number of user messages sent in this chat. */
  userMessages: number;
  /** Value of `userMessages` when the memory review last ran. */
  lastMemoryReviewAt: number;
  model?: string;
  /** Manual tab-strip order. Absent means "sort by recency". Does not change which day a chat belongs to. */
  tabOrder?: number;
  /** Folder the engine works in for this chat (and where the Git panel looks). Absolute path. */
  projectDir?: string;
}

export type ChatEvent =
  | { type: "user"; text: string; attachments?: AttachmentRef[] }
  | { type: "delta"; text: string }
  | { type: "message"; text: string }
  | { type: "tool_start"; id: string; name: string; args: unknown }
  | { type: "tool_end"; id: string; name: string; ok: boolean; result: string }
  | { type: "approval_request"; id: string; kind: string; title: string; detail: string }
  | { type: "approval_resolved"; id: string; decision: ApprovalDecision }
  | { type: "notice"; text: string; kind: "skill" | "memory" | "info" }
  | { type: "agent_update"; run: AgentRun }
  | { type: "turn_start" }
  | { type: "idle" }
  | { type: "usage"; used: number; limit: number }
  | { type: "error"; message: string }
  | ActivityEvent;

/**
 * Events the Copilot SDK defines (pinned 1.0.34 types) but that no real run has confirmed yet. Mapped from:
 * assistant.reasoning_delta / assistant.reasoning (reasoningId), assistant.intent, session.todos_changed (signal only:
 * the rows come from session.rpc.plan.readSqlTodosWithDependencies), tool.execution_progress and
 * tool.execution_partial_result (toolCallId), session.title_changed. The UI shows each piece only when its event arrives.
 */
export type ActivityEvent =
  /** Live reasoning text. Streamed, not persisted. */
  | { type: "reasoning_delta"; id: string; text: string }
  /** The final reasoning block. `ms` is measured from its first delta (absent when no delta was seen). */
  | { type: "reasoning"; id: string; text: string; ms?: number }
  /** What the model is doing right now, one short line. */
  | { type: "intent"; text: string }
  /** The full todo list as of now (replaces the previous list). */
  | { type: "todos"; items: TodoItem[] }
  /** Progress or partial output of a running tool. Streamed, not persisted. `partial` means output, not a status line. */
  | { type: "progress"; id: string; text: string; partial?: boolean }
  /** The title the engine gave the session. */
  | { type: "title"; title: string };

export interface TodoItem {
  id: string;
  title: string;
  /** As the engine reports it, e.g. "pending", "in_progress", "done". */
  status: string;
}

/** An event as stored/streamed, numbered per chat. */
export type SeqEvent = ChatEvent & { seq: number; ts: number };

export type ApprovalDecision = "once" | "chat" | "deny";

export interface Settings {
  model: string; // "auto" or a model id
  /** Reasoning effort for new sessions (global). "" = the model's own default. Only sent to models that report support. */
  reasoningEffort: string;
  reviewModel: string; // "" = cheapest available
  theme: string;
  autoApproveAll: boolean;
  loopsEnabled: boolean;
  curatorEnabled: boolean;
  curatorEveryDays: number;
  /** Archive skills not used for this many days. */
  curatorStaleDays: number;
  skillReviewMinToolSteps: number;
  memoryReviewEveryUserMessages: number;
  memoryLimit: number;
  userLimit: number;
  /** Hide the live reasoning preview; the finished thinking block stays collapsed. */
  collapseThinking: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  model: "auto",
  reasoningEffort: "",
  reviewModel: "",
  theme: "pheme-gold-dark",
  autoApproveAll: false,
  loopsEnabled: true,
  curatorEnabled: true,
  curatorEveryDays: 7,
  curatorStaleDays: 90,
  skillReviewMinToolSteps: 10,
  memoryReviewEveryUserMessages: 10,
  memoryLimit: 2200,
  userLimit: 1375,
  collapseThinking: false,
};

export interface Usage {
  turns: number;
  reviews: number;
  toolSteps: number;
}

export interface BootstrapState {
  engine: string;
  fake: boolean;
  settings: Settings;
  usage: Usage;
  version: string;
}

export interface MemoryState {
  memory: string[];
  user: string[];
  memoryLimit: number;
  userLimit: number;
}

export interface SkillSummary {
  name: string;
  description: string;
}

export interface ModelOption {
  id: string;
  name: string;
  /** Reasoning effort levels the model accepts, when the engine reports them. Absent or empty = no effort control. */
  reasoningEfforts?: string[];
  defaultReasoningEffort?: string;
}

export type JobSchedule =
  | { kind: "interval"; everyMinutes: number }
  | { kind: "daily"; time: string } // local "HH:MM"
  | { kind: "once"; at: number };

export interface Job {
  id: string;
  name: string;
  prompt: string;
  schedule: JobSchedule;
  /** Fixed at creation: may the job run shell commands and edit files? */
  allowActions: boolean;
  enabled: boolean;
  createdAt: number;
  nextRunAt: number | null;
  lastRunAt: number | null;
  lastChatId: string | null;
  lastStatus: "ok" | "error" | "skipped" | null;
}

export interface AgentProfile {
  name: string;
  description: string;
  /** System instructions for this agent. */
  instructions: string;
  /** Copilot tool names it may use; empty = all. */
  tools: string[];
}

export interface AgentRun {
  id: string;
  parentChatId: string;
  name: string;
  task: string;
  /** "session" = a parallel Pheme session started by the agent tool; "copilot" = delegated by the CLI to a custom agent. */
  source: "session" | "copilot";
  status: "running" | "done" | "error" | "cancelled";
  startedAt: number;
  endedAt: number | null;
  result: string;
  /** Hidden chat holding the transcript (session runs only). */
  childChatId?: string;
}

export interface CuratorState {
  lastRunAt: number | null;
  running: boolean;
  /** Plain-language lines describing what the last run did. */
  report: string[];
}
