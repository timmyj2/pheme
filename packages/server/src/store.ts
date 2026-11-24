import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { ChatEvent, ChatMeta, SeqEvent } from "./protocol.ts";
import { readJson, writeJson } from "./settings.ts";

/** Chats live as <dir>/sessions/<id>.meta.json plus an append-only <id>.jsonl event log. */
export class ChatStore {
  private dir: string;
  private seqs = new Map<string, number>();
  /** Chats deleted in this process: late events from a still-running turn must not recreate their files. */
  private removed = new Set<string>();
  private listeners = new Map<string, Set<(e: SeqEvent) => void>>();

  constructor(dataDir: string) {
    this.dir = path.join(dataDir, "sessions");
    fs.mkdirSync(this.dir, { recursive: true });
  }

  private metaFile(id: string) {
    return path.join(this.dir, `${safeId(id)}.meta.json`);
  }
  /** Path of a chat's event log (for search; callers must pass an id they got from `list()`). */
  logPath(id: string): string {
    return this.logFile(id);
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
    if (!ID_RE.test(id)) return undefined;
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

  update(id: string, patch: Partial<Pick<ChatMeta, "title" | "pinned" | "archived" | "userMessages" | "lastMemoryReviewAt" | "model" | "projectDir">>): ChatMeta | undefined {
    const m = this.get(id);
    if (!m) return undefined;
    Object.assign(m, patch, { updatedAt: Date.now() });
    if (m.projectDir === undefined) delete m.projectDir;
    if (m.model === undefined) delete m.model;
    writeJson(this.metaFile(id), m);
    return m;
  }

  /** Remember a dragged tab order without treating the drag as a new message (updatedAt stays put). */
  setTabOrder(ids: string[]): number {
    let n = 0;
    ids.forEach((id, i) => {
      const m = this.get(id);
      if (!m) return;
      m.tabOrder = i;
      writeJson(this.metaFile(id), m);
      n++;
    });
    return n;
  }

  /** Forget cached per-chat counters; call after files in the data folder were replaced from outside (a restore). */
  resetCache(): void {
    this.seqs.clear();
  }

  remove(id: string): void {
    this.removed.add(id);
    this.listeners.delete(id);
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
    if (this.removed.has(id)) return full;
    if (event.type !== "delta") {
      this.repairTail(id);
      fs.appendFileSync(this.logFile(id), JSON.stringify(full) + "\n");
    }
    for (const l of this.listeners.get(id) ?? []) l(full);
    return full;
  }

  private repaired = new Set<string>();
  /** A crash can leave a half-written last line; make sure the next event starts on its own line. */
  private repairTail(id: string): void {
    if (this.repaired.has(id)) return;
    this.repaired.add(id);
    const f = this.logFile(id);
    if (!fs.existsSync(f)) return;
    const fd = fs.openSync(f, "r");
    try {
      const size = fs.fstatSync(fd).size;
      if (!size) return;
      const last = Buffer.alloc(1);
      fs.readSync(fd, last, 0, 1, size - 1);
      if (last[0] !== 0x0a) fs.appendFileSync(f, "\n");
    } finally {
      fs.closeSync(fd);
    }
  }

  subscribe(id: string, fn: (e: SeqEvent) => void): () => void {
    let set = this.listeners.get(id);
    if (!set) this.listeners.set(id, (set = new Set()));
    set.add(fn);
    return () => set!.delete(fn);
  }
}

const ID_RE = /^[A-Za-z0-9-]{1,64}$/;

function safeId(id: string): string {
  if (!ID_RE.test(id)) throw new Error("bad id");
  return id;
}
