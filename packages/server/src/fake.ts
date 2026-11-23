import type { Engine, EngineAttachment, EngineEvent, EngineSession, PermissionRequest, SessionOptions } from "./engine.ts";
import type { ModelOption } from "./protocol.ts";

export type FakeStep =
  | { say: string }
  | { tool: string; args: Record<string, unknown> }
  /** Pretend the engine ran one of its own built-in tools (needs approval unless kind is "read"). */
  | { builtin: "shell" | "write" | "read"; detail: string }
  | { delayMs: number }
  /** Run several tool calls at the same time, like a model that calls a tool twice in one response. */
  | { parallel: { tool: string; args: Record<string, unknown> }[] }
  /** Pretend Copilot delegated to one of the custom agents in opts.agents. */
  | { delegate: string; task: string };

export interface FakeContext {
  prompt: string;
  opts: SessionOptions;
}
export type FakeScript = (ctx: FakeContext) => FakeStep[] | Promise<FakeStep[]>;

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "workflow";

/** Default script: enough behaviour to drive demos and the end-to-end test without a real model. */
export const defaultScript: FakeScript = ({ prompt, opts }) => {
  if (prompt.includes("[pheme:skill-review]")) {
    const first = /USER: (.+)/.exec(prompt)?.[1] ?? "workflow";
    const name = slug(first);
    if (opts.systemMessage.includes(`- ${name}:`)) {
      return [{ tool: "skill_manage", args: { action: "patch", name, old_string: "## Procedure", new_string: "## Procedure\n(refined after another run)" } }, { say: "Updated a skill." }];
    }
    return [
      {
        tool: "skill_manage",
        args: {
          action: "create",
          name,
          content: `---\nname: ${name}\ndescription: Use when asked to ${first.slice(0, 60)}. Repeats the steps that worked.\n---\n\n## Procedure\n1. Read the relevant files.\n2. Make the change.\n3. Verify it.\n\n## Pitfalls\n- Check before you edit, because blind edits are hard to undo.\n`,
        },
      },
      { say: "Saved." },
    ];
  }
  if (prompt.includes("[pheme:curator]")) {
    // Merge the first two skills: fold the second one's name into the first, then archive the second.
    const names = [...opts.systemMessage.matchAll(/^- ([a-z0-9_-]+):/gm)].map((m) => m[1]);
    if (names.length < 2) return [{ say: "No changes." }];
    return [
      { tool: "skill_manage", args: { action: "patch", name: names[0], old_string: "## Procedure", new_string: `## Procedure\n(also covers: ${names[1]})` } },
      { tool: "skill_manage", args: { action: "delete", name: names[1] } },
      { say: "Merged." },
    ];
  }
  if (prompt.includes("[pheme:memory-review]")) {
    const fact = /remember(?: that)? ([^\n.]+)/i.exec(prompt)?.[1];
    return fact ? [{ tool: "memory", args: { action: "add", store: "user", content: fact.trim() } }, { say: "Saved." }] : [{ say: "Nothing to save." }];
  }
  const ag = /^agents? (?:(\w[\w-]*): )?(.+)$/i.exec(prompt);
  if (ag) return [{ tool: "agent", args: { task: ag[2], ...(ag[1] ? { profile: ag[1] } : {}) } }, { say: "Agent finished." }];
  const par = /^parallel (.+)$/i.exec(prompt);
  if (par) return [{ parallel: par[1].split("|").map((t) => ({ tool: "agent", args: { task: t.trim() } })) }, { say: "All agents finished." }];
  const del = /^delegate (\S+) (.+)$/i.exec(prompt);
  if (del) return [{ delegate: del[1], task: del[2] }, { say: "Delegated." }];
  const steps = /\bsteps (\d+)/i.exec(prompt);
  if (steps) {
    const out: FakeStep[] = [];
    for (let i = 1; i <= Number(steps[1]); i++) out.push({ builtin: "read", detail: `file-${i}.txt` });
    out.push({ say: `Finished ${steps[1]} steps.` });
    return out;
  }
  const run = /\brun (.+)/i.exec(prompt);
  if (run) return [{ builtin: "shell", detail: run[1] }, { say: "Ran it." }];
  const edit = /\bedit (\S+)/i.exec(prompt);
  if (edit) return [{ builtin: "write", detail: edit[1] }, { say: "Edited it." }];
  const rem = /\bremember(?: that)? (.+)/i.exec(prompt);
  if (rem) return [{ tool: "memory", args: { action: "add", store: "user", content: rem[1] } }, { say: "Noted." }];
  if (/use (the |a )?skill/i.test(prompt)) {
    const name = /^- ([a-z0-9_-]+):/m.exec(opts.systemMessage)?.[1];
    if (name) return [{ tool: "skill_view", args: { name } }, { say: `Using skill ${name}.` }];
    return [{ say: "No skills available." }];
  }
  return [{ say: `Fake reply to: ${prompt.slice(0, 200)}` }];
};

export class FakeEngine implements Engine {
  readonly name = "fake";
  /** Every session ever created, for assertions. */
  readonly sessions: SessionOptions[] = [];
  /** Ids of sessions that were closed. */
  readonly closed: string[] = [];
  /** Every prompt sent, with the session options it was sent to. */
  readonly prompts: { prompt: string; opts: SessionOptions; attachments?: EngineAttachment[] }[] = [];
  constructor(private script: FakeScript = defaultScript, private streamDelayMs = 0) {}

  async listModels(): Promise<ModelOption[]> {
    return [
      { id: "auto", name: "Auto" },
      { id: "fake-mini", name: "Fake Mini (cheap)" },
      { id: "fake-large", name: "Fake Large" },
    ];
  }

  async createSession(opts: SessionOptions): Promise<EngineSession> {
    this.sessions.push(opts);
    const self = this;
    let chars = 0; // a rough stand-in for how much the conversation holds
    let boost = 0; // a prompt containing [context:N] pretends the conversation holds N more tokens (for trying the meter)
    return {
      async send(prompt, onEvent, signal, attachments) {
        chars += prompt.length + opts.systemMessage.length;
        const ctx = /\[context:(\d{1,9})\]/.exec(prompt);
        if (ctx) boost = Number(ctx[1]);
        self.prompts.push({ prompt, opts, attachments });
        const steps = await self.script({ prompt, opts });
        let n = 0;
        const runTool = async (step: { tool: string; args: Record<string, unknown> }) => {
          const id = `t${++n}-${Math.random().toString(36).slice(2, 7)}`;
          onEvent({ type: "tool_start", id, name: step.tool, args: step.args });
          const tool = opts.tools.find((t) => t.name === step.tool);
          if (!tool) return onEvent({ type: "tool_end", id, name: step.tool, ok: false, result: "unknown tool" });
          try {
            const result = await tool.handler(step.args);
            onEvent({ type: "tool_end", id, name: step.tool, ok: !result.startsWith("Error:"), result });
          } catch (e) {
            onEvent({ type: "tool_end", id, name: step.tool, ok: false, result: (e as Error).message });
          }
        };
        for (const step of steps) {
          if (signal?.aborted) return;
          if ("delayMs" in step) await sleep(step.delayMs, signal);
          else if ("say" in step) await say(step.say, onEvent, self.streamDelayMs, signal);
          else if ("tool" in step) await runTool(step);
          else if ("parallel" in step) await Promise.all(step.parallel.map(runTool));
          else if ("delegate" in step) {
            const id = `d${++n}`;
            const known = opts.agents?.some((x) => x.name === (step as { delegate: string }).delegate);
            onEvent({ type: "subagent", phase: "start", id, name: step.delegate, task: step.task });
            onEvent({ type: "subagent", phase: "end", id, name: step.delegate, ok: !!known, result: known ? "" : "unknown agent" });
          } else if ("builtin" in step) {
            const id = `b${++n}-${Math.random().toString(36).slice(2, 7)}`;
            const name = step.builtin === "shell" ? "bash" : step.builtin === "write" ? "edit" : "view";
            if (step.builtin !== "read") {
              const req: PermissionRequest = { kind: step.builtin, title: step.builtin === "shell" ? "Run shell command" : "Edit file", detail: step.detail };
              if ((await opts.onPermission(req)) === "deny") {
                onEvent({ type: "tool_start", id, name, args: { detail: step.detail } });
                onEvent({ type: "tool_end", id, name, ok: false, result: "Denied by user" });
                continue;
              }
            }
            onEvent({ type: "tool_start", id, name, args: { detail: step.detail } });
            onEvent({ type: "tool_end", id, name, ok: true, result: `(fake ${step.builtin}) ${step.detail}` });
          }
        }
        onEvent({ type: "usage", used: Math.ceil(chars / 4) + boost + (self.usageBoost ?? 0), limit: self.usageLimit ?? 128_000 });
      },
      async close() {
        self.closed.push(opts.id);
      },
    };
  }
  /** Tests and the stress script can push the meter up (extra tokens) or change the limit. */
  usageBoost?: number;
  usageLimit?: number;
  async close() {}
}

/** Wait `ms`, or less if the turn is aborted. */
const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      resolve();
    });
  });

async function say(text: string, onEvent: (e: EngineEvent) => void, delay: number, signal?: AbortSignal) {
  for (const w of text.match(/\S+\s*/g) ?? []) {
    if (signal?.aborted) return;
    onEvent({ type: "delta", text: w });
    if (delay) await sleep(delay);
  }
  onEvent({ type: "message", text });
}
