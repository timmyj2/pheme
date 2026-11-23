import type { ModelOption } from "./protocol.ts";

export interface ToolDef {
  name: string;
  description: string;
  /** JSON schema for the arguments. */
  parameters: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<string> | string;
}

export interface PermissionRequest {
  /** "shell" | "write" | "read" | "url" | "mcp" | "custom-tool" | other */
  kind: string;
  title: string;
  detail: string;
}
export type PermissionAnswer = "allow" | "deny";

export type EngineEvent =
  | { type: "delta"; text: string }
  | { type: "message"; text: string }
  | { type: "tool_start"; id: string; name: string; args: unknown }
  | { type: "tool_end"; id: string; name: string; ok: boolean; result: string }
  | { type: "subagent"; phase: "start" | "end"; id: string; name: string; task?: string; ok?: boolean; result?: string }
  | { type: "error"; message: string };

export interface SessionOptions {
  /** Pheme chat id; also the engine session id so it can be resumed. */
  id: string;
  resume: boolean;
  model: string;
  /** Appended to the engine's own system prompt: persona, memory block, skills index. */
  systemMessage: string;
  tools: ToolDef[];
  /** Called for every action that may need the user's approval. */
  onPermission: (req: PermissionRequest) => Promise<PermissionAnswer>;
  /** Restrict the session to the custom tools only (used for hidden review sessions). */
  customToolsOnly?: boolean;
  /** Folder tool calls (shell, file edits) run in. Defaults to the engine's own. */
  workingDirectory?: string;
  /** Custom agent profiles the engine may delegate to (Copilot `customAgents`). */
  agents?: { name: string; description: string; prompt: string; tools?: string[] }[];
}

export interface EngineSession {
  /** Run one turn; resolves when the engine is idle. Events are delivered through onEvent. */
  send(prompt: string, onEvent: (e: EngineEvent) => void, signal?: AbortSignal): Promise<void>;
  close(): Promise<void>;
}

export interface Engine {
  readonly name: string;
  listModels(): Promise<ModelOption[]>;
  createSession(opts: SessionOptions): Promise<EngineSession>;
  close(): Promise<void>;
}
