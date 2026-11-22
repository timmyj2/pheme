import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { Engine, EngineSession, SessionOptions } from "./engine.ts";
import type { ModelOption } from "./protocol.ts";

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

  async listModels(): Promise<ModelOption[]> {
    const { client } = await this.ensure();
    const models = await client.listModels();
    return [{ id: "auto", name: "Auto" }, ...models.map((m) => ({ id: m.id, name: m.name ?? m.id }))];
  }

  async createSession(opts: SessionOptions): Promise<EngineSession> {
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
    if (opts.customToolsOnly) config.availableTools = opts.tools.map((t) => t.name);
    const session = opts.resume
      ? await client.resumeSession(opts.id, config as never).catch(() => client.createSession({ ...config, sessionId: opts.id } as never))
      : await client.createSession({ ...config, sessionId: opts.id } as never);

    return {
      async send(prompt, onEvent, signal) {
        const names = new Map<string, string>();
        await new Promise<void>((resolve, reject) => {
          const off = session.on(((raw: unknown) => {
            const ev = raw as { type: string; data?: Record<string, unknown> };
            const d = ev.data ?? {};
            switch (ev.type) {
              case "assistant.message_delta":
                onEvent({ type: "delta", text: String(d.deltaContent ?? "") });
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
              case "session.error":
                onEvent({ type: "error", message: String(d.message ?? "Copilot error") });
                break;
              case "session.idle":
                off();
                resolve();
                break;
            }
          }) as never);
          signal?.addEventListener("abort", () => {
            session.abort().catch(() => {});
            off();
            resolve();
          });
          session.send({ prompt }).catch((e: Error) => {
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
