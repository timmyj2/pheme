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
