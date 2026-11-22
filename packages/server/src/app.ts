import { randomUUID } from "node:crypto";
import type { Engine, EngineEvent, EngineSession, PermissionAnswer, PermissionRequest } from "./engine.ts";
import { JobStore, Scheduler } from "./jobs.ts";
import { Loops } from "./loops.ts";
import { MemoryStore } from "./memory.ts";
import type { ApprovalDecision, ChatMeta, Settings } from "./protocol.ts";
import { SettingsStore } from "./settings.ts";
import { SkillStore } from "./skills.ts";
import { ChatStore } from "./store.ts";
import { memoryTool, skillTools } from "./tools.ts";

const PERSONA = `You are Pheme, an assistant running in a local app on the user's computer.
You keep long-term memory with the memory tool and reusable procedures as skills (skill_view, skill_manage).
Use memory for durable facts about the user or environment. When a skill in the index matches the task, load it with skill_view before you start.`;

interface Turn {
  abort: AbortController;
  approvals: Map<string, (d: ApprovalDecision) => void>;
  done: Promise<void>;
}

export class App {
  readonly store: ChatStore;
  readonly settings: SettingsStore;
  readonly memory: MemoryStore;
  readonly skills: SkillStore;
  readonly loops: Loops;
  readonly jobs: JobStore;
  readonly scheduler: Scheduler;
  /** Chats started by scheduled jobs: fixed allow/deny for actions, never asks the user. */
  readonly chatPolicy = new Map<string, "allow" | "deny">();
  private turns = new Map<string, Turn>();
  private sessions = new Map<string, EngineSession>();
  private chatAllow = new Map<string, Set<string>>();
  private pending = new Set<Promise<unknown>>();

  constructor(readonly dataDir: string, readonly engine: Engine) {
    this.store = new ChatStore(dataDir);
    this.settings = new SettingsStore(dataDir);
    this.memory = new MemoryStore(dataDir, () => {
      const s = this.settings.get();
      return { memory: s.memoryLimit, user: s.userLimit };
    });
    this.skills = new SkillStore(dataDir);
    this.loops = new Loops(this);
    this.jobs = new JobStore(dataDir);
    this.scheduler = new Scheduler(this);
  }

  /** Track a background job so tests and shutdown can wait for it. */
  background(p: Promise<unknown>): void {
    const q = p.catch(() => {}).finally(() => this.pending.delete(q));
    this.pending.add(q);
  }

  /** Resolves when no turn or background review is running. */
  async drain(): Promise<void> {
    while (this.pending.size || this.turns.size) {
      await Promise.all([...this.pending, ...[...this.turns.values()].map((t) => t.done)]);
    }
  }

  /** Resolves when the chat's current turn (if any) has finished. */
  async waitIdle(chatId: string): Promise<void> {
    await this.turns.get(chatId)?.done;
  }

  isBusy(chatId: string): boolean {
    return this.turns.has(chatId);
  }

  pendingApprovals(chatId: string): string[] {
    return [...(this.turns.get(chatId)?.approvals.keys() ?? [])];
  }

  buildSystemMessage(): string {
    return `${PERSONA}\n\n${this.memory.block()}\n\n${this.skills.index()}`;
  }

  /** Start a turn. Returns once the turn is accepted; events arrive through the store. */
  send(chatId: string, text: string): void {
    const meta = this.store.get(chatId);
    if (!meta) throw new Error("no such chat");
    if (this.turns.has(chatId)) throw new Error("this chat is still working");
    const abort = new AbortController();
    const turn: Turn = { abort, approvals: new Map(), done: Promise.resolve() };
    this.turns.set(chatId, turn);
    turn.done = this.runTurn(chatId, meta, text, turn).finally(() => this.turns.delete(chatId));
  }

  stop(chatId: string): void {
    const t = this.turns.get(chatId);
    if (!t) return;
    t.abort.abort();
    for (const resolve of t.approvals.values()) resolve("deny");
  }

  resolveApproval(chatId: string, id: string, decision: ApprovalDecision): boolean {
    const resolve = this.turns.get(chatId)?.approvals.get(id);
    if (!resolve) return false;
    resolve(decision);
    return true;
  }

  private async runTurn(chatId: string, meta: ChatMeta, text: string, turn: Turn): Promise<void> {
    const { store } = this;
    const firstTime = meta.userMessages === 0;
    store.append(chatId, { type: "user", text });
    store.update(chatId, {
      userMessages: meta.userMessages + 1,
      ...(meta.title === "New chat" ? { title: text.replace(/\s+/g, " ").slice(0, 60) } : {}),
    });
    store.append(chatId, { type: "turn_start" });
    this.settings.bumpUsage({ turns: 1 });
    let toolSteps = 0;
    try {
      const session = await this.sessionFor(chatId, !firstTime, turn);
      await session.send(
        text,
        (e: EngineEvent) => {
          if (e.type === "tool_start") toolSteps++;
          store.append(chatId, e);
        },
        turn.abort.signal,
      );
    } catch (e) {
      store.append(chatId, { type: "error", message: (e as Error).message });
    } finally {
      this.settings.bumpUsage({ toolSteps });
      store.append(chatId, { type: "idle" });
    }
    this.loops.afterTurn(chatId, toolSteps);
  }

  private async sessionFor(chatId: string, resume: boolean, turn: Turn): Promise<EngineSession> {
    const existing = this.sessions.get(chatId);
    if (existing) return existing;
    const s: Settings = this.settings.get();
    const session = await this.engine.createSession({
      id: chatId,
      resume,
      model: this.store.get(chatId)?.model ?? s.model,
      systemMessage: this.buildSystemMessage(),
      tools: [memoryTool(this.memory), ...skillTools(this.skills)],
      onPermission: (req) => this.askUser(chatId, req, this.turns.get(chatId) ?? turn),
    });
    this.sessions.set(chatId, session);
    return session;
  }

  private async askUser(chatId: string, req: PermissionRequest, turn: Turn): Promise<PermissionAnswer> {
    if (req.kind === "read") return "allow";
    const policy = this.chatPolicy.get(chatId);
    if (policy) return policy;
    if (this.settings.get().autoApproveAll) return "allow";
    if (this.chatAllow.get(chatId)?.has(req.kind)) return "allow";
    if (turn.abort.signal.aborted) return "deny";
    const id = randomUUID();
    this.store.append(chatId, { type: "approval_request", id, kind: req.kind, title: req.title, detail: req.detail });
    const decision = await new Promise<ApprovalDecision>((resolve) => turn.approvals.set(id, resolve));
    turn.approvals.delete(id);
    this.store.append(chatId, { type: "approval_resolved", id, decision });
    if (decision === "chat") {
      let set = this.chatAllow.get(chatId);
      if (!set) this.chatAllow.set(chatId, (set = new Set()));
      set.add(req.kind);
    }
    return decision === "deny" ? "deny" : "allow";
  }

  async shutdown(): Promise<void> {
    this.scheduler.stop();
    for (const id of this.turns.keys()) this.stop(id);
    await this.drain();
    for (const s of this.sessions.values()) await s.close().catch(() => {});
    await this.engine.close();
  }
}
