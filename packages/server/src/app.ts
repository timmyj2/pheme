import { randomUUID } from "node:crypto";
import { AgentStore, Semaphore } from "./agents.ts";
import { AttachmentStore, readForEngine, type AttachmentRef } from "./attachments.ts";
import type { Engine, EngineEvent, EngineSession, PermissionAnswer, PermissionRequest } from "./engine.ts";
import { Curator } from "./curator.ts";
import { checkProjectDir } from "./git.ts";
import { HttpError } from "./http-error.ts";
import { JobStore, Scheduler } from "./jobs.ts";
import { Loops } from "./loops.ts";
import { MemoryStore } from "./memory.ts";
import type { AgentRun, ApprovalDecision, ChatMeta, Settings } from "./protocol.ts";
import { SettingsStore } from "./settings.ts";
import { SkillStore } from "./skills.ts";
import { ChatStore } from "./store.ts";
import { agentTool, memoryTool, skillTools } from "./tools.ts";

const PERSONA = `You are Pheme, an assistant running in a local app on the user's computer.
You keep long-term memory with the memory tool and reusable procedures as skills (skill_view, skill_manage).
Use memory for durable facts about the user or environment. When a skill in the index matches the task, load it with skill_view before you start.`;

interface Turn {
  abort: AbortController;
  approvals: Map<string, (d: ApprovalDecision) => void>;
  /** Abort controllers of sub-agent sessions started during this turn. */
  children: Set<AbortController>;
  done: Promise<void>;
}

/** Cached engine sessions kept open at once; idle ones beyond this are closed and resumed on demand. */
const MAX_OPEN_SESSIONS = 8;

/** A short chat title from the first message: first real line, markdown marks removed, cut on a word. */
export function titleFrom(text: string): string {
  const strip = (line: string) =>
    line
      .trim()
      .replace(/^(#{1,6}\s+|>\s*|[-*+]\s+|\d+[.)]\s+)/, "")
      .replace(/^```\w*\s*/, "")
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/[*_`~]+/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const plain = text.split(/\r?\n/).map(strip).find((l) => /[\p{L}\p{N}]/u.test(l));
  if (!plain) return "New chat";
  if (plain.length <= 60) return plain;
  const cut = plain.slice(0, 60);
  return cut.slice(0, Math.max(30, cut.lastIndexOf(" "))).trimEnd() + "…";
}

export class App {
  readonly store: ChatStore;
  readonly attachments: AttachmentStore;
  readonly settings: SettingsStore;
  readonly memory: MemoryStore;
  readonly skills: SkillStore;
  readonly loops: Loops;
  readonly jobs: JobStore;
  readonly agents: AgentStore;
  readonly curator: Curator;
  private agentSlots = new Semaphore(3);
  readonly scheduler: Scheduler;
  /** Chats started by scheduled jobs: fixed allow/deny for actions, never asks the user. */
  readonly chatPolicy = new Map<string, "allow" | "deny">();
  private turns = new Map<string, Turn>();
  private sessions = new Map<string, EngineSession>();
  private chatAllow = new Map<string, Set<string>>();
  private pending = new Set<Promise<unknown>>();

  constructor(readonly dataDir: string, readonly engine: Engine) {
    this.store = new ChatStore(dataDir);
    this.attachments = new AttachmentStore(dataDir);
    try { this.attachments.sweepAll(); } catch { /* a stuck cleanup must never stop the app starting */ }
    this.settings = new SettingsStore(dataDir);
    this.memory = new MemoryStore(dataDir, () => {
      const s = this.settings.get();
      return { memory: s.memoryLimit, user: s.userLimit };
    });
    this.skills = new SkillStore(dataDir);
    this.loops = new Loops(this);
    this.jobs = new JobStore(dataDir);
    this.agents = new AgentStore(dataDir);
    this.curator = new Curator(this);
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

  openSessionCount(): number {
    return this.sessions.size;
  }

  /** Close one chat's engine session so the next message creates a fresh (resumed) one. */
  private async dropSession(chatId: string): Promise<void> {
    const s = this.sessions.get(chatId);
    this.sessions.delete(chatId);
    await s?.close().catch(() => {});
  }

  /** Keep the number of open engine sessions bounded: close the least recently used idle ones. */
  private async evictIdleSessions(): Promise<void> {
    for (const id of [...this.sessions.keys()]) {
      if (this.sessions.size <= MAX_OPEN_SESSIONS) return;
      if (!this.turns.has(id)) await this.dropSession(id);
    }
  }

  /** Delete a chat for good: stop its turn, close its session, forget its permissions. */
  async removeChat(chatId: string): Promise<void> {
    this.stop(chatId);
    this.store.remove(chatId);
    this.attachments.removeChat(chatId);
    this.chatAllow.delete(chatId);
    this.chatPolicy.delete(chatId);
    await this.dropSession(chatId);
  }

  /** Point a chat at a project folder (or clear it with null). The next message opens a fresh session there. */
  async setProjectDir(chatId: string, dir: string | null): Promise<ChatMeta> {
    const meta = this.store.get(chatId);
    if (!meta) throw new HttpError(404, "no such chat");
    if (this.isBusy(chatId)) throw new HttpError(409, "Wait for the current reply to finish (or stop it) before changing the folder.");
    const projectDir = dir === null ? undefined : checkProjectDir(dir);
    const updated = this.store.update(chatId, { projectDir })!;
    await this.dropSession(chatId);
    return updated;
  }

  /** Pick the model for one chat ("" or null = follow the default in Settings). Takes effect from the next message. */
  async setChatModel(chatId: string, model: string | null): Promise<ChatMeta> {
    const meta = this.store.get(chatId);
    if (!meta) throw new HttpError(404, "no such chat");
    if (this.isBusy(chatId)) throw new HttpError(409, "Wait for the current reply to finish (or stop it) before changing the model.");
    const clean = model === null || model === "" ? undefined : String(model).trim();
    if (clean !== undefined && (clean.length > 100 || [...clean].some((c) => c.charCodeAt(0) < 32))) throw new HttpError(400, "That is not a valid model name.");
    const updated = this.store.update(chatId, { model: clean })!;
    await this.dropSession(chatId);
    return updated;
  }

  /** Number of chats with a reply in progress. */
  busyCount(): number {
    return this.turns.size;
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
  send(chatId: string, text: string, attached: { ref: AttachmentRef; path: string }[] = []): void {
    const meta = this.store.get(chatId);
    if (!meta || meta.hidden) throw new Error("no such chat");
    if (this.turns.has(chatId)) throw new Error("this chat is still working");
    const abort = new AbortController();
    const turn: Turn = { abort, approvals: new Map(), children: new Set(), done: Promise.resolve() };
    this.turns.set(chatId, turn);
    turn.done = this.runTurn(chatId, meta, text, turn, attached).finally(() => this.turns.delete(chatId));
  }

  stop(chatId: string): void {
    const t = this.turns.get(chatId);
    if (!t) return;
    t.abort.abort();
    for (const c of t.children) c.abort();
    for (const resolve of t.approvals.values()) resolve("deny");
  }

  resolveApproval(chatId: string, id: string, decision: ApprovalDecision): boolean {
    const resolve = this.turns.get(chatId)?.approvals.get(id);
    if (!resolve) return false;
    resolve(decision);
    return true;
  }

  private async runTurn(chatId: string, meta: ChatMeta, text: string, turn: Turn, attached: { ref: AttachmentRef; path: string }[] = []): Promise<void> {
    const { store } = this;
    const firstTime = meta.userMessages === 0;
    store.append(chatId, attached.length ? { type: "user", text, attachments: attached.map((a) => a.ref) } : { type: "user", text });
    this.attachments.markSent(chatId, attached.map((a) => a.ref.id));
    store.update(chatId, {
      userMessages: meta.userMessages + 1,
      ...(meta.title === "New chat" ? { title: titleFrom(text) } : {}),
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
          if (e.type === "subagent") this.recordCopilotAgent(chatId, e);
          else store.append(chatId, e);
        },
        turn.abort.signal,
        attached.length ? attached.map(readForEngine) : undefined,
      );
    } catch (e) {
      store.append(chatId, { type: "error", message: (e as Error).message });
      // The session may be broken (for example the CLI process died); start fresh next time.
      await this.dropSession(chatId);
    } finally {
      this.settings.bumpUsage({ toolSteps });
      store.append(chatId, { type: "idle" });
    }
    await this.evictIdleSessions();
    this.loops.afterTurn(chatId, toolSteps);
  }

  private async sessionFor(chatId: string, resume: boolean, turn: Turn): Promise<EngineSession> {
    const existing = this.sessions.get(chatId);
    if (existing) {
      this.sessions.delete(chatId); // re-insert: most recently used goes last
      this.sessions.set(chatId, existing);
      return existing;
    }
    const s: Settings = this.settings.get();
    const session = await this.engine.createSession({
      id: chatId,
      resume,
      workingDirectory: this.store.get(chatId)?.projectDir,
      model: this.store.get(chatId)?.model ?? s.model,
      systemMessage: this.buildSystemMessage(),
      tools: [memoryTool(this.memory), ...skillTools(this.skills), agentTool((task, profile) => this.runAgent(chatId, task, profile))],
      agents: this.agents.listProfiles().map((p) => ({ name: p.name, description: p.description, prompt: p.instructions, tools: p.tools.length ? p.tools : undefined })),
      onPermission: (req) => this.askUser(chatId, req, this.turns.get(chatId) ?? turn),
    });
    this.sessions.set(chatId, session);
    return session;
  }

  private emitRun(run: AgentRun): void {
    this.agents.upsertRun(run);
    this.store.append(run.parentChatId, { type: "agent_update", run: { ...run } });
  }

  /** Copilot delegated to one of the custom agents (subagent.* events). */
  private recordCopilotAgent(chatId: string, e: Extract<EngineEvent, { type: "subagent" }>): void {
    const id = `copilot-${e.id}`;
    const prev = this.agents.listRuns().find((r) => r.id === id);
    if (e.phase === "start") {
      this.emitRun({ id, parentChatId: chatId, name: e.name, task: e.task ?? "", source: "copilot", status: "running", startedAt: Date.now(), endedAt: null, result: "" });
    } else if (prev) {
      this.emitRun({ ...prev, status: e.ok === false ? "error" : "done", endedAt: Date.now(), result: e.result ?? "" });
    }
  }

  /** Run a task in a separate engine session (the `agent` tool). Returns the sub-agent's final answer. */
  async runAgent(parentChatId: string, task: string, profileName?: string): Promise<string> {
    const parent = this.turns.get(parentChatId);
    if (!parent) throw new Error("no active turn to attach the agent to");
    if (!task.trim()) throw new Error("task is required");
    const profile = profileName ? this.agents.getProfile(profileName) : undefined;
    if (profileName && !profile) {
      const known = this.agents.listProfiles().map((p) => p.name).join(", ") || "none saved";
      throw new Error(`unknown agent profile "${profileName}" (available: ${known})`);
    }
    const run: AgentRun = { id: randomUUID(), parentChatId, name: profile?.name ?? "agent", task: task.slice(0, 2000), source: "session", status: "running", startedAt: Date.now(), endedAt: null, result: "" };
    this.emitRun(run);
    const abort = new AbortController();
    parent.children.add(abort);
    await this.agentSlots.acquire();
    let session: EngineSession | undefined;
    try {
      if (abort.signal.aborted) throw new Error("cancelled");
      const child = this.store.create({ hidden: true, title: `Agent: ${run.name}` });
      run.childChatId = child.id;
      this.emitRun(run);
      const persona = `${PERSONA}\n\nYou are a sub-agent started by another Pheme chat to do one task. Do the task, then reply with only the final answer; the parent will read it.${profile ? `\n\n${profile.instructions}` : ""}`;
      session = await this.engine.createSession({
        id: child.id,
        resume: false,
        model: this.settings.get().model,
        systemMessage: `${persona}\n\n${this.skills.index()}`,
        tools: skillTools(this.skills).filter((t) => t.name === "skill_view"),
        onPermission: (req) => this.askUser(parentChatId, req, parent),
      });
      this.store.append(child.id, { type: "user", text: task });
      let last = "";
      await session.send(
        task,
        (e) => {
          if (e.type === "message") last = e.text;
          if (e.type !== "subagent") this.store.append(child.id, e);
        },
        abort.signal,
      );
      this.store.append(child.id, { type: "idle" });
      if (abort.signal.aborted) {
        this.emitRun({ ...run, status: "cancelled", endedAt: Date.now() });
        return "Cancelled by the user.";
      }
      const result = last.slice(0, 8000);
      this.emitRun({ ...run, status: "done", endedAt: Date.now(), result });
      return result || "(the sub-agent returned no text)";
    } catch (e) {
      const cancelled = abort.signal.aborted;
      this.emitRun({ ...run, status: cancelled ? "cancelled" : "error", endedAt: Date.now(), result: cancelled ? "" : (e as Error).message });
      throw e;
    } finally {
      this.agentSlots.release();
      parent.children.delete(abort);
      await session?.close().catch(() => {});
    }
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
