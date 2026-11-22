import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { ChatEvent, ChatMeta, SeqEvent } from "./protocol.ts";
import { readJson, writeJson } from "./settings.ts";

/** Chats live as <dir>/sessions/<id>.meta.json plus an append-only <id>.jsonl event log. */
export class ChatStore {
  private dir: string;
  private seqs = new Map<string, number>();
  private listeners = new Map<string, Set<(e: SeqEvent) => void>>();

  constructor(dataDir: string) {
    this.dir = path.join(dataDir, "sessions");
    fs.mkdirSync(this.dir, { recursive: true });
  }

  private metaFile(id: string) {
    return path.join(this.dir, `${safeId(id)}.meta.json`);
  }
  private logFile(id: string) {
    return path.join(this.dir, `${safeId(id)}.jsonl`);
  }

  create(opts: { hidden?: boolean; title?: string; model?: string } = {}): ChatMeta {
    const now = Date.now();
    const meta: ChatMeta = {
      id: randomUUID(),
      title: opts.title ?? "New chat",
      pinned: false,
      archived: false,
      hidden: opts.hidden,
      createdAt: now,
      updatedAt: now,
      userMessages: 0,
      lastMemoryReviewAt: 0,
      model: opts.model,
    };
    writeJson(this.metaFile(meta.id), meta);
    return meta;
  }

  get(id: string): ChatMeta | undefined {
    const f = this.metaFile(id);
    if (!fs.existsSync(f)) return undefined;
    return readJson<ChatMeta | undefined>(f, undefined);
  }

  list(): ChatMeta[] {
    const out: ChatMeta[] = [];
    for (const f of fs.readdirSync(this.dir)) {
      if (!f.endsWith(".meta.json")) continue;
      const m = readJson<ChatMeta | undefined>(path.join(this.dir, f), undefined);
      if (m && !m.hidden) out.push(m);
    }
    return out.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  update(id: string, patch: Partial<Pick<ChatMeta, "title" | "pinned" | "archived" | "userMessages" | "lastMemoryReviewAt" | "model">>): ChatMeta | undefined {
    const m = this.get(id);
    if (!m) return undefined;
    Object.assign(m, patch, { updatedAt: Date.now() });
    writeJson(this.metaFile(id), m);
    return m;
  }

  remove(id: string): void {
    fs.rmSync(this.metaFile(id), { force: true });
    fs.rmSync(this.logFile(id), { force: true });
    this.seqs.delete(id);
  }

  events(id: string, after = 0): SeqEvent[] {
    const f = this.logFile(id);
    if (!fs.existsSync(f)) return [];
    const out: SeqEvent[] = [];
    for (const line of fs.readFileSync(f, "utf8").split("\n")) {
      if (!line) continue;
      try {
        const e = JSON.parse(line) as SeqEvent;
        if (e.seq > after) out.push(e);
      } catch {
        /* skip torn line */
      }
    }
    return out;
  }

  /** Append an event. `delta` events are streamed but not persisted. */
  append(id: string, event: ChatEvent): SeqEvent {
    let seq = this.seqs.get(id);
    if (seq === undefined) {
      const all = this.events(id);
      seq = all.length ? all[all.length - 1].seq : 0;
    }
    seq += 1;
    this.seqs.set(id, seq);
    const full = { ...event, seq, ts: Date.now() } as SeqEvent;
    if (event.type !== "delta") fs.appendFileSync(this.logFile(id), JSON.stringify(full) + "\n");
    for (const l of this.listeners.get(id) ?? []) l(full);
    return full;
  }

  subscribe(id: string, fn: (e: SeqEvent) => void): () => void {
    let set = this.listeners.get(id);
    if (!set) this.listeners.set(id, (set = new Set()));
    set.add(fn);
    return () => set!.delete(fn);
  }
}

function safeId(id: string): string {
  if (!/^[A-Za-z0-9-]+$/.test(id)) throw new Error("bad id");
  return id;
}
