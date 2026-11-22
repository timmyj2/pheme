import type { AgentRun, ApprovalDecision, SeqEvent } from "./api.ts";

export interface ToolItem {
  id: string;
  name: string;
  args: unknown;
  ok?: boolean;
  result?: string;
  startTs: number;
  endTs?: number;
}

export type Block =
  | { kind: "user"; key: string; text: string; ts: number }
  | { kind: "assistant"; key: string; text: string; ts: number }
  | { kind: "tools"; key: string; items: ToolItem[] }
  | { kind: "approval"; key: string; id: string; title: string; detail: string; approvalKind: string; decision?: ApprovalDecision }
  | { kind: "agent"; key: string; run: AgentRun }
  | { kind: "notice"; key: string; text: string; tone: "skill" | "memory" | "info" | "error" };

/** Turn the raw event log into what the transcript shows: consecutive tool calls grouped, tool results merged into their call. */
export function buildBlocks(events: SeqEvent[]): Block[] {
  const blocks: Block[] = [];
  const tools = new Map<string, ToolItem>();
  const decisions = new Map<string, ApprovalDecision>();
  const latestRun = new Map<string, AgentRun>();
  for (const e of events) {
    if (e.type === "approval_resolved") decisions.set(e.id, e.decision);
    if (e.type === "agent_update") latestRun.set(e.run.id, e.run);
  }
  const seenRuns = new Set<string>();
  for (const e of events) {
    switch (e.type) {
      case "user":
        blocks.push({ kind: "user", key: `u${e.seq}`, text: e.text, ts: e.ts });
        break;
      case "message":
        blocks.push({ kind: "assistant", key: `a${e.seq}`, text: e.text, ts: e.ts });
        break;
      case "tool_start": {
        const item: ToolItem = { id: e.id, name: e.name, args: e.args, startTs: e.ts };
        tools.set(e.id, item);
        const last = blocks[blocks.length - 1];
        if (last?.kind === "tools") last.items.push(item);
        else blocks.push({ kind: "tools", key: `t${e.seq}`, items: [item] });
        break;
      }
      case "tool_end": {
        const item = tools.get(e.id);
        if (item) Object.assign(item, { ok: e.ok, result: e.result, endTs: e.ts });
        break;
      }
      case "approval_request":
        blocks.push({ kind: "approval", key: `p${e.seq}`, id: e.id, title: e.title, detail: e.detail, approvalKind: e.kind, decision: decisions.get(e.id) });
        break;
      case "agent_update":
        if (!seenRuns.has(e.run.id)) {
          seenRuns.add(e.run.id);
          blocks.push({ kind: "agent", key: `g${e.run.id}`, run: latestRun.get(e.run.id)! });
        }
        break;
      case "notice":
        blocks.push({ kind: "notice", key: `n${e.seq}`, text: e.text, tone: e.kind });
        break;
      case "error":
        blocks.push({ kind: "notice", key: `e${e.seq}`, text: e.message, tone: "error" });
        break;
      default:
        break;
    }
  }
  return blocks;
}

/** One short line describing a tool call's arguments. */
export function toolSummary(name: string, args: unknown): string {
  const a = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;
  const pick = a.command ?? a.detail ?? a.path ?? a.fileName ?? a.file_path ?? a.url ?? a.query ?? a.task ?? a.description;
  if (typeof pick === "string") return pick.replace(/\s+/g, " ").slice(0, 120);
  if (name === "memory") return `${String(a.action ?? "")} ${String(a.store ?? "")}`.trim();
  if (name.startsWith("skill_")) return String(a.name ?? a.action ?? "");
  return "";
}

export function toolDuration(t: ToolItem): string {
  if (!t.endTs) return "";
  const ms = Math.max(0, t.endTs - t.startTs);
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export const APPROVAL_LABEL: Record<ApprovalDecision, string> = { once: "Allowed once", chat: "Allowed for this chat", deny: "Denied" };
