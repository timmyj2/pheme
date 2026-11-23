import fs from "node:fs";
import type { ChatMeta, SeqEvent } from "./protocol.ts";
import type { ChatStore } from "./store.ts";

const oneLine = (s: unknown, max = 200) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** A readable Markdown transcript of one chat. Tool calls are summarised, not dumped in full. */
export function chatToMarkdown(meta: ChatMeta, events: SeqEvent[], now = Date.now()): string {
  const out: string[] = [`# ${oneLine(meta.title, 120) || "Chat"}`, ""];
  out.push(`_Exported from Pheme on ${new Date(now).toISOString().slice(0, 16).replace("T", " ")} UTC · ${events.filter((e) => e.type === "user").length} messages_`, "");
  const tools = new Map<string, { name: string; args: unknown }>();
  let streaming = "";
  for (const e of events) {
    switch (e.type) {
      case "user":
        out.push("## You", "", e.text.trim(), "");
        break;
      case "delta":
        streaming += e.text;
        break;
      case "message":
        streaming = "";
        out.push("## Pheme", "", e.text.trim(), "");
        break;
      case "tool_start":
        tools.set(e.id, { name: e.name, args: e.args });
        break;
      case "tool_end": {
        const t = tools.get(e.id);
        const args = t ? oneLine(typeof t.args === "string" ? t.args : JSON.stringify(t.args), 160) : "";
        out.push(`> **Tool:** \`${oneLine(e.name, 60).replace(/`/g, "'")}\` ${args ? `(${args.replace(/`/g, "'")}) ` : ""}— ${e.ok ? "ok" : "failed"}`, "");
        break;
      }
      case "approval_resolved":
        out.push(`> _Approval: ${e.decision === "deny" ? "denied" : e.decision === "chat" ? "allowed for this chat" : "allowed once"}_`, "");
        break;
      case "notice":
        out.push(`> _${oneLine(e.text, 300)}_`, "");
        break;
      case "error":
        out.push(`> **Error:** ${oneLine(e.message, 300)}`, "");
        break;
      default:
        break;
    }
  }
  if (streaming.trim()) out.push("## Pheme (unfinished)", "", streaming.trim(), "");
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

/** A safe download file name: no path characters, no leading dots, bounded length. */
export function exportFileName(title: string): string {
  const base = [...title.normalize("NFKC")].map((c) => (c.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(c) ? " " : c)).join("").replace(/\s+/g, " ").replace(/^[.\s]+/, "").slice(0, 80).trim().replace(/[. ]+$/, "");
  return `${base || "chat"}.md`;
}

export interface SearchHit {
  id: string;
  title: string;
  updatedAt: number;
  /** A short piece of text around the match. */
  snippet: string;
  role: "you" | "pheme";
}

const MAX_FILE_BYTES = 8_000_000;
const MAX_HITS = 40;

/** Find chats whose messages contain the text. Reads the logs directly with a size cap and a time budget. */
export async function searchMessages(store: ChatStore, query: string, opts: { budgetMs?: number; logPath: (id: string) => string; cancelled?: () => boolean }): Promise<{ hits: SearchHit[]; partial: boolean }> {
  const q = query.trim().toLowerCase();
  if (q.length < 2 || q.length > 200) return { hits: [], partial: false };
  const deadline = Date.now() + (opts.budgetMs ?? 1500);
  const hits: SearchHit[] = [];
  let partial = false;
  let scanned = 0;
  for (const meta of store.list()) {
    if (Date.now() > deadline) { partial = true; break; }
    // Let other requests (typing, polling, sending) run between chats: the scan is synchronous file reading.
    if (++scanned % 8 === 0) {
      await new Promise<void>((resolve) => setImmediate(resolve));
      if (opts.cancelled?.()) return { hits, partial: true }; // the page stopped waiting (it typed another letter)
    }
    let text: string;
    try {
      const f = opts.logPath(meta.id);
      const st = fs.statSync(f);
      const fd = fs.openSync(f, "r");
      try {
        const len = Math.min(st.size, MAX_FILE_BYTES);
        const buf = Buffer.alloc(len);
        fs.readSync(fd, buf, 0, len, st.size - len); // the newest part of a huge log
        text = buf.toString("utf8");
      } finally {
        fs.closeSync(fd);
      }
    } catch { continue; }
    if (!text.toLowerCase().includes(q)) continue; // cheap reject before parsing JSON
    for (const line of text.split("\n")) {
      if (!line || !line.toLowerCase().includes(q)) continue;
      let ev: { type?: string; text?: string };
      try { ev = JSON.parse(line) as { type?: string; text?: string }; } catch { continue; }
      if ((ev.type !== "user" && ev.type !== "message") || typeof ev.text !== "string") continue;
      const at = ev.text.toLowerCase().indexOf(q);
      if (at < 0) continue;
      const from = Math.max(0, at - 40);
      const snippet = (from > 0 ? "…" : "") + ev.text.slice(from, at + q.length + 80).replace(/\s+/g, " ").trim() + (at + q.length + 80 < ev.text.length ? "…" : "");
      hits.push({ id: meta.id, title: meta.title, updatedAt: meta.updatedAt, snippet, role: ev.type === "user" ? "you" : "pheme" });
      break; // one hit per chat
    }
    if (hits.length >= MAX_HITS) { partial = true; break; }
  }
  return { hits, partial };
}

const MAX_SEARCHES = 2;
const MAX_QUEUED = 6;
let running = 0;
const queue: (() => void)[] = [];
const inflight = new Map<string, Promise<{ hits: SearchHit[]; partial: boolean }>>();

/** At most two searches scan at once, a short queue waits, the rest are told to retry; identical queries share one scan. */
export async function searchLimited(store: ChatStore, query: string, opts: { logPath: (id: string) => string; cancelled?: () => boolean }): Promise<{ hits: SearchHit[]; partial: boolean } | "busy"> {
  const key = query.trim().toLowerCase();
  const same = inflight.get(key);
  if (same) return same;
  if (running >= MAX_SEARCHES) {
    if (queue.length >= MAX_QUEUED) return "busy";
    await new Promise<void>((resolve) => queue.push(resolve));
    if (opts.cancelled?.()) { queue.shift()?.(); return { hits: [], partial: true }; }
  }
  running++;
  const p = searchMessages(store, query, opts).finally(() => {
    running--;
    inflight.delete(key);
    queue.shift()?.();
  });
  inflight.set(key, p);
  return p;
}
