import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { Engine, EngineSession, SessionOptions } from "./engine.ts";
import type { ModelOption } from "./protocol.ts";

// Reads the todo rows over RPC. Never throws and never hangs the turn: a CLI without rpc.plan, a synchronous throw
// or a read that does not settle within the timeout resolves to undefined, so idle is not held for long.
const TODO_READ_TIMEOUT_MS = 3000;
type TodoRow = Record<string, unknown>;
async function readTodoRows(session: unknown, timeoutMs = TODO_READ_TIMEOUT_MS): Promise<TodoRow[] | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const plan = (session as { rpc?: { plan?: { readSqlTodosWithDependencies?: () => Promise<{ rows?: TodoRow[] }> } } } | undefined)?.rpc?.plan;
    if (typeof plan?.readSqlTodosWithDependencies !== "function") return undefined;
    const timeout = new Promise<undefined>((resolve) => {
      timer = setTimeout(() => resolve(undefined), timeoutMs);
    });
    const result = await Promise.race([plan.readSqlTodosWithDependencies(), timeout]);
    return Array.isArray(result?.rows) ? result.rows : undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/** Find the user's installed Copilot CLI. Returns a path the SDK can launch (a binary or npm-loader.js). */
export function findCopilotCli(env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (env.COPILOT_CLI_PATH && fs.existsSync(env.COPILOT_CLI_PATH)) return env.COPILOT_CLI_PATH;
  const win = process.platform === "win32";
  const dirs = (env.PATH ?? env.Path ?? "").split(path.delimiter).filter(Boolean);
  for (const d of dirs) {
    if (win) {
      // npm installs copilot.cmd next to node_modules/@github/copilot
      if (fs.existsSync(path.join(d, "copilot.cmd")) || fs.existsSync(path.join(d, "copilot.ps1"))) {
        const loader = path.join(d, "node_modules", "@github", "copilot", "npm-loader.js");
        if (fs.existsSync(loader)) return loader;
      }
      const exe = path.join(d, "copilot.exe");
      if (fs.existsSync(exe)) return exe;
    } else {
      const f = path.join(d, "copilot");
      if (fs.existsSync(f)) return fs.realpathSync(f);
    }
  }
  return undefined;
}

export function copilotVersion(cli: string): string | undefined {
  const isJs = cli.endsWith(".js");
  const r = spawnSync(isJs ? process.execPath : cli, isJs ? [cli, "--version"] : ["--version"], { encoding: "utf8", timeout: 20000, windowsHide: true });
  const out = `${r.stdout ?? ""}`.trim().split("\n")[0];
  return r.status === 0 && out ? out : undefined;
}

/** Turn raw SDK start-up errors into advice the user can act on. */
export function explainCopilotError(e: Error): string {
  const m = /SDK supports versions (\d+)-(\d+), but server reports version (\d+)/.exec(e.message);
  if (m) {
    return `Your Copilot CLI is newer than this Pheme build understands (it speaks protocol ${m[3]}, Pheme supports ${m[1]}-${m[2]}). Install the CLI version Pheme was built against: npm i -g @github/copilot@${COPILOT_CLI_TESTED}, or update Pheme.`;
  }
  return e.message;
}

/** Copilot CLI release bundled with the SDK version Pheme builds against (protocol-compatible). */
export const COPILOT_CLI_TESTED = "1.0.112";

type Sdk = typeof import("@github/copilot-sdk");

export class CopilotEngine implements Engine {
  readonly name = "copilot";
  private client: InstanceType<Sdk["CopilotClient"]> | undefined;
  private sdk: Sdk | undefined;

  constructor(private cliPath?: string, private workingDirectory?: string) {}

  private async ensure() {
    if (this.client) return { client: this.client, sdk: this.sdk! };
    this.sdk = await import("@github/copilot-sdk");
    const cli = this.cliPath ?? findCopilotCli();
    if (!cli) throw new Error("Copilot CLI not found. Install it (npm i -g @github/copilot) and sign in, or set COPILOT_CLI_PATH.");
    this.client = new this.sdk.CopilotClient({
      connection: this.sdk.RuntimeConnection.forStdio({ path: cli }),
      workingDirectory: this.workingDirectory,
    });
    try {
      await this.client.start();
    } catch (e) {
      this.client = undefined;
      throw new Error(explainCopilotError(e as Error));
    }
    return { client: this.client, sdk: this.sdk };
  }

  async authStatus() {
    const { client } = await this.ensure();
    return client.getAuthStatus();
  }

  /** Effort levels per model, from the last model listing (the SDK reports them per model). */
  private efforts = new Map<string, string[]>();

  async listModels(): Promise<ModelOption[]> {
    const { client } = await this.ensure();
    const models = await client.listModels();
    const out: ModelOption[] = [{ id: "auto", name: "Auto" }];
    this.efforts.clear();
    for (const m of models) {
      const levels = (m as { supportedReasoningEfforts?: unknown }).supportedReasoningEfforts;
      const efforts = Array.isArray(levels) ? levels.filter((x): x is string => typeof x === "string" && /^[a-z]{1,20}$/.test(x)) : [];
      const def = (m as { defaultReasoningEffort?: unknown }).defaultReasoningEffort;
      if (efforts.length) this.efforts.set(m.id, efforts);
      out.push({ id: m.id, name: m.name ?? m.id, ...(efforts.length ? { reasoningEfforts: efforts, defaultReasoningEffort: typeof def === "string" ? def : efforts[0] } : {}) });
    }
    return out;
  }

  async createSession(opts: SessionOptions): Promise<EngineSession> {
    try {
      return await this.createSessionInner(opts);
    } catch (e) {
      // If the CLI process died, the cached client is useless; drop it so the next try starts a new one.
      const old = this.client;
      this.client = undefined;
      void old?.stop().catch(() => {});
      throw e;
    }
  }

  private async createSessionInner(opts: SessionOptions): Promise<EngineSession> {
    const { client, sdk } = await this.ensure();
    const tools = opts.tools.map((t) =>
      sdk.defineTool(t.name, {
        description: t.description,
        parameters: t.parameters,
        // Pheme's own tools are safe by design (they only touch Pheme's data folder).
        skipPermission: true,
        handler: async (args: unknown) => t.handler((args ?? {}) as Record<string, unknown>),
      }),
    );
    // The CLI can ask more than once for the same tool call; remember what the user already allowed.
    const allowedCalls = new Set<string>();
    const onPermissionRequest = async (req: { kind: string; [k: string]: unknown }) => {
      const kind = String(req.kind);
      if (kind === "read") return { kind: "approve-once" as const };
      const callKey = `${String(req.toolCallId ?? "")}|${kind}|${String(req.fullCommandText ?? req.fileName ?? req.url ?? "")}`;
      if (req.toolCallId && allowedCalls.has(callKey)) return { kind: "approve-once" as const };
      const detail = String(req.fullCommandText ?? req.fileName ?? req.url ?? req.toolName ?? req.toolTitle ?? "");
      const title = kind === "shell" ? "Run shell command" : kind === "write" ? "Edit file" : kind === "url" ? "Fetch URL" : kind === "mcp" ? "Use MCP tool" : `Permission: ${kind}`;
      const answer = await opts.onPermission({ kind, title, detail });
      if (answer === "allow") allowedCalls.add(callKey);
      return answer === "allow" ? { kind: "approve-once" as const } : { kind: "reject" as const, feedback: "Denied by the user." };
    };
    const config: Record<string, unknown> = {
      model: opts.model === "auto" ? undefined : opts.model,
      systemMessage: { mode: "append", content: opts.systemMessage },
      tools,
      onPermissionRequest,
      streaming: true,
    };
    if (opts.workingDirectory) config.workingDirectory = opts.workingDirectory;
    if (opts.agents?.length) {
      config.customAgents = opts.agents.map((a) => ({ name: a.name, displayName: a.name, description: a.description, prompt: a.prompt, tools: a.tools ?? null, infer: true }));
    }
    // Only send an effort the model reports; the list is fetched once if this engine has not seen it yet.
    if (opts.reasoningEffort && opts.model !== "auto") {
      if (!this.efforts.size) await this.listModels();
      if (this.efforts.get(opts.model)?.includes(opts.reasoningEffort)) config.reasoningEffort = opts.reasoningEffort;
    }
    if (opts.customToolsOnly) config.availableTools = opts.tools.map((t) => t.name);
    const session = opts.resume
      ? await client.resumeSession(opts.id, config as never).catch(() => client.createSession({ ...config, sessionId: opts.id } as never))
      : await client.createSession({ ...config, sessionId: opts.id } as never);

    return {
      async send(prompt, onEvent, signal, attachments) {
        const names = new Map<string, string>();
        const reasoningStart = new Map<string, number>(); // first delta time per reasoning block, for "Thought for Ns"
        const todoReads: Promise<void>[] = [];
        await new Promise<void>((resolve, reject) => {
          let lastUsage: { used: number; limit: number } | undefined;
          const off = session.on(((raw: unknown) => {
            const ev = raw as { type: string; data?: Record<string, unknown> };
            const d = ev.data ?? {};
            switch (ev.type) {
              case "assistant.message_delta":
                onEvent({ type: "delta", text: String(d.deltaContent ?? "") });
                break;
              case "assistant.reasoning_delta": {
                const id = String(d.reasoningId ?? "");
                if (!reasoningStart.has(id)) reasoningStart.set(id, Date.now());
                onEvent({ type: "reasoning_delta", id, text: String(d.deltaContent ?? "") });
                break;
              }
              case "assistant.reasoning": {
                const id = String(d.reasoningId ?? "");
                const started = reasoningStart.get(id);
                if (d.content) onEvent({ type: "reasoning", id, text: String(d.content), ...(started !== undefined ? { ms: Date.now() - started } : {}) });
                break;
              }
              case "assistant.intent":
                if (d.intent) onEvent({ type: "intent", text: String(d.intent) });
                break;
              case "session.todos_changed":
                // Signal only: the rows are read back over RPC. Idle waits for these reads so the list lands inside the turn.
                todoReads.push(
                  readTodoRows(session).then((rows) => {
                    if (!rows) return;
                    const items = rows
                      .map((row) => ({ id: String(row.id ?? ""), title: String(row.title ?? ""), status: String(row.status ?? "pending") }))
                      .filter((t) => t.title);
                    onEvent({ type: "todos", items });
                  }),
                );
                break;
              case "tool.execution_progress":
                if (d.progressMessage) onEvent({ type: "progress", id: String(d.toolCallId), text: String(d.progressMessage) });
                break;
              case "tool.execution_partial_result":
                if (d.partialOutput) onEvent({ type: "progress", id: String(d.toolCallId), text: String(d.partialOutput), partial: true });
                break;
              case "session.title_changed":
                if (typeof d.title === "string" && d.title.trim()) onEvent({ type: "title", title: d.title.trim() });
                break;
              case "assistant.message":
                if (d.content) onEvent({ type: "message", text: String(d.content) });
                break;
              case "tool.execution_start":
                names.set(String(d.toolCallId), String(d.toolName));
                onEvent({ type: "tool_start", id: String(d.toolCallId), name: String(d.toolName), args: d.arguments });
                break;
              case "tool.execution_complete": {
                const result = d.result as { content?: string } | undefined;
                const err = d.error as { message?: string } | undefined;
                onEvent({ type: "tool_end", id: String(d.toolCallId), name: names.get(String(d.toolCallId)) ?? String(d.toolName ?? ""), ok: d.success !== false, result: String(result?.content ?? err?.message ?? "") });
                break;
              }
              case "subagent.started":
                onEvent({ type: "subagent", phase: "start", id: String(d.toolCallId), name: String(d.agentDisplayName ?? d.agentName), task: String(d.agentDescription ?? "") });
                break;
              case "subagent.completed":
                onEvent({ type: "subagent", phase: "end", id: String(d.toolCallId), name: String(d.agentDisplayName ?? d.agentName), ok: !d.cancelled });
                break;
              case "subagent.failed":
                onEvent({ type: "subagent", phase: "end", id: String(d.toolCallId), name: String(d.agentDisplayName ?? d.agentName), ok: false, result: String(d.error ?? "") });
                break;
              case "session.error":
                onEvent({ type: "error", message: String(d.message ?? "Copilot error") });
                break;
              case "session.usage_info": {
                const used = Number(d.currentTokens), limit = Number(d.tokenLimit);
                if (Number.isFinite(used) && Number.isFinite(limit) && used >= 0 && limit > 0) lastUsage = { used: Math.round(used), limit: Math.round(limit) };
                break;
              }
              case "session.idle":
                if (lastUsage) onEvent({ type: "usage", ...lastUsage }); // once per turn: the log stays small
                void Promise.allSettled(todoReads).then(() => {
                  off();
                  resolve();
                });
                break;
            }
          }) as never);
          signal?.addEventListener("abort", () => {
            session.abort().catch(() => {});
            off();
            resolve();
          });
          const sdkAttachments = (attachments ?? []).map((a) => ({ type: "blob" as const, data: a.data, mimeType: a.mime, displayName: a.name }));
          session.send(sdkAttachments.length ? { prompt, attachments: sdkAttachments } : { prompt }).catch((e: Error) => {
            off();
            reject(e);
          });
        });
      },
      async close() {
        await session.disconnect().catch(() => {});
      },
    };
  }

  async close() {
    await this.client?.stop().catch(() => {});
    this.client = undefined;
  }
}
