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
  /** Folder the engine works in for this chat (and where the Git panel looks). Absolute path. */
  projectDir?: string;
}

export type ChatEvent =
  | { type: "user"; text: string }
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
  | { type: "error"; message: string };

/** An event as stored/streamed, numbered per chat. */
export type SeqEvent = ChatEvent & { seq: number; ts: number };

export type ApprovalDecision = "once" | "chat" | "deny";

export interface Settings {
  model: string; // "auto" or a model id
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
}

export const DEFAULT_SETTINGS: Settings = {
  model: "auto",
  reviewModel: "",
  theme: "dark",
  autoApproveAll: false,
  loopsEnabled: true,
  curatorEnabled: true,
  curatorEveryDays: 7,
  curatorStaleDays: 90,
  skillReviewMinToolSteps: 10,
  memoryReviewEveryUserMessages: 10,
  memoryLimit: 2200,
  userLimit: 1375,
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
