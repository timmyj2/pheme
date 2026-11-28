import type { Block } from "../../blocks.ts";

/** One user prompt and the replies, tool rows and approvals that follow it, until the next prompt. */
export interface Turn {
  key: string;
  /** The prompt that opens the turn. Undefined only for replies before the first prompt. */
  user?: Extract<Block, { kind: "user" }>;
  body: Block[];
}

/** Group the flat block list into turns, so the prompt can stick to the top of its own turn. */
export function groupTurns(blocks: Block[]): Turn[] {
  const turns: Turn[] = [];
  let cur: Turn | null = null;
  for (const b of blocks) {
    if (b.kind === "user" || !cur) {
      cur = { key: b.key, body: [] };
      if (b.kind === "user") cur.user = b;
      else cur.body.push(b);
      turns.push(cur);
    } else {
      cur.body.push(b);
    }
  }
  return turns;
}

/** Milliseconds from the prompt to the last finished reply or tool call, if the turn has ended. */
export function turnMs(turn: Turn): number | undefined {
  if (!turn.user) return undefined;
  let end = 0;
  for (const b of turn.body) {
    if (b.kind === "assistant") end = Math.max(end, b.ts);
    if (b.kind === "tools") for (const t of b.items) if (t.endTs) end = Math.max(end, t.endTs);
  }
  return end > turn.user.ts ? end - turn.user.ts : undefined;
}

/** 1:05 for a minute and five seconds, 1:02:03 past an hour. */
export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}
