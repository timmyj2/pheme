import type { App } from "./app.ts";
import type { ChatEvent, SeqEvent } from "./protocol.ts";
import { memoryTool, skillTools } from "./tools.ts";

/** Render the tail of a chat as plain text for a reviewer. */
export function renderTranscript(events: SeqEvent[], maxChars = 12000): string {
  const lines: string[] = [];
  for (const e of events) {
    if (e.type === "user") lines.push(`USER: ${e.text}`);
    else if (e.type === "message") lines.push(`ASSISTANT: ${e.text}`);
    else if (e.type === "tool_start") lines.push(`TOOL ${e.name} ${JSON.stringify(e.args ?? {}).slice(0, 200)}`);
    else if (e.type === "tool_end") lines.push(`  -> ${e.ok ? "ok" : "failed"}: ${e.result.slice(0, 160).replace(/\n/g, " ")}`);
  }
  let text = lines.join("\n");
  if (text.length > maxChars) text = "...\n" + text.slice(text.length - maxChars);
  return text;
}

const SKILL_REVIEW = `[pheme:skill-review]
You are reviewing a finished conversation to keep the user's skill library useful. A skill is a short, reusable procedure for a CLASS of tasks (not this one task).

Rules:
- Look at the transcript below. Decide what a future run of a similar task would want to know: the steps that worked, in order, and the traps that cost time.
- Prefer improving an existing skill (skill_manage patch) over creating a new one. Check the skills index in your system message first; call skill_view to read a candidate before patching.
- If nothing fits, create one skill with skill_manage create. Name it for the class of task. Front matter needs name and description; start the description with "Use when".
- Write the procedure first. Write pitfalls as "rule - why". Do not narrate what happened in this chat.
- Never record failures that came from this particular machine or setup, and never write claims that a tool "does not work".
- Most conversations with many tool steps deserve at least a small update. If truly nothing is reusable, reply "Nothing to save." and stop.

--- transcript ---
`;

const MEMORY_REVIEW = `[pheme:memory-review]
You are reviewing a conversation to update the user's long-term memory. Save only facts that the conversation itself states or clearly shows.

Rules:
- Two stores, and each fact goes in exactly one: "user" = who the user is, their preferences and how they like to work; "memory" = facts about their environment and standing conventions.
- Do not save task progress, one-off requests or anything that will be stale within a week.
- Check the memory block in your system message first. Replace an entry that is outdated rather than adding a duplicate.
- Keep entries short and declarative.
- If there is nothing worth saving, reply "Nothing to save." and stop.

--- transcript ---
`;

const REVIEW_PERSONA = "You are a background reviewer inside the Pheme app. You have only memory and skill tools. You cannot ask questions; act on your own judgement, then stop.";

export class Loops {
  constructor(private app: App) {}

  /** Called after each finished turn. Starts any due reviews in the background. */
  afterTurn(chatId: string, toolSteps: number): void {
    const s = this.app.settings.get();
    if (!s.loopsEnabled) return;
    const meta = this.app.store.get(chatId);
    if (!meta || meta.hidden) return;
    if (toolSteps >= s.skillReviewMinToolSteps) this.app.background(this.review(chatId, "skill"));
    if (meta.userMessages - meta.lastMemoryReviewAt >= s.memoryReviewEveryUserMessages) {
      this.app.store.update(chatId, { lastMemoryReviewAt: meta.userMessages });
      this.app.background(this.review(chatId, "memory"));
    }
  }

  async cheapestModel(): Promise<string> {
    const configured = this.app.settings.get().reviewModel;
    if (configured) return configured;
    try {
      const models = await this.app.engine.listModels();
      const cheap = models.find((m) => /mini|haiku|flash|lite|nano/i.test(m.id));
      return cheap?.id ?? "auto";
    } catch {
      return "auto";
    }
  }

  async review(chatId: string, kind: "skill" | "memory"): Promise<void> {
    const events = this.app.store.events(chatId);
    const transcript = renderTranscript(events);
    if (!transcript) return;
    const hidden = this.app.store.create({ hidden: true, title: `${kind} review of ${chatId}` });
    const tools = kind === "skill" ? skillTools(this.app.skills) : [memoryTool(this.app.memory)];
    const results: string[] = [];
    const changes: ChatEvent[] = [];
    try {
      const session = await this.app.engine.createSession({
        id: hidden.id,
        resume: false,
        model: await this.cheapestModel(),
        systemMessage: `${REVIEW_PERSONA}\n\n${kind === "skill" ? this.app.skills.index() : this.app.memory.block()}`,
        tools,
        customToolsOnly: true,
        onPermission: async () => "deny",
      });
      const names = new Map<string, { name: string; args: Record<string, unknown> }>();
      await session.send((kind === "skill" ? SKILL_REVIEW : MEMORY_REVIEW) + transcript, (e) => {
        if (e.type === "tool_start") names.set(e.id, { name: e.name, args: (e.args ?? {}) as Record<string, unknown> });
        if (e.type === "tool_end" && e.ok) {
          const t = names.get(e.id);
          if (t && (t.name === "skill_manage" || t.name === "memory")) {
            const a = t.args;
            const what = t.name === "memory" ? `memory (${a.store}): ${String(a.action)}` : `skill ${String(a.name)}: ${String(a.action)}`;
            results.push(what);
          }
        }
      });
      await session.close();
      this.app.settings.bumpUsage({ reviews: 1 });
      if (results.length) {
        changes.push({ type: "notice", kind, text: `${kind === "skill" ? "Skill" : "Memory"} review: ${results.join("; ")}` });
      }
    } catch (e) {
      changes.push({ type: "notice", kind: "info", text: `${kind} review failed: ${(e as Error).message}` });
    } finally {
      this.app.store.remove(hidden.id);
    }
    for (const c of changes) this.app.store.append(chatId, c);
  }
}
