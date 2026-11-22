import fs from "node:fs";
import path from "node:path";
import type { MemoryState } from "./protocol.ts";

export type MemoryStoreName = "memory" | "user";
const SEP = "\n§\n";

export class MemoryStore {
  private dir: string;
  constructor(dataDir: string, private limits: () => { memory: number; user: number }) {
    this.dir = path.join(dataDir, "memory");
  }
  private file(store: MemoryStoreName) {
    return path.join(this.dir, store === "memory" ? "MEMORY.md" : "USER.md");
  }
  read(store: MemoryStoreName): string[] {
    try {
      return fs.readFileSync(this.file(store), "utf8").split(SEP).map((s) => s.trim()).filter(Boolean);
    } catch {
      return [];
    }
  }
  limit(store: MemoryStoreName): number {
    return this.limits()[store];
  }
  write(store: MemoryStoreName, entries: string[]): void {
    const clean = entries.map((e) => e.trim()).filter(Boolean);
    if (clean.some((e) => e.includes("§"))) throw new Error("entries cannot contain the § character (it separates entries)");
    const total = clean.join(SEP).length;
    if (total > this.limit(store)) throw new Error(`over the ${this.limit(store)}-char limit (${total})`);
    fs.mkdirSync(this.dir, { recursive: true });
    fs.writeFileSync(this.file(store), clean.join(SEP));
  }
  state(): MemoryState {
    return {
      memory: this.read("memory"),
      user: this.read("user"),
      memoryLimit: this.limit("memory"),
      userLimit: this.limit("user"),
    };
  }

  /** Implements the `memory` tool. Returns a human-readable result; throws on invalid use. */
  apply(args: { action: string; store: string; content?: string; old_text?: string }): string {
    const store = args.store as MemoryStoreName;
    if (store !== "memory" && store !== "user") throw new Error('store must be "memory" or "user"');
    const entries = this.read(store);
    const used = () => entries.join(SEP).length;
    const stat = () => `${used()}/${this.limit(store)} chars used`;
    if (args.action === "add") {
      const c = (args.content ?? "").trim();
      if (!c) throw new Error("content required");
      if (entries.includes(c)) return `Already saved. ${stat()}`;
      this.write(store, [...entries, c]);
      entries.push(c);
      return `Added. ${stat()}`;
    }
    const needle = args.old_text ?? "";
    const matches = entries.map((e, i) => [e, i] as const).filter(([e]) => needle && e.includes(needle));
    if (matches.length !== 1) throw new Error(matches.length ? "old_text matches several entries; be more specific" : "old_text matches no entry");
    const idx = matches[0][1];
    if (args.action === "replace") {
      const c = (args.content ?? "").trim();
      if (!c) throw new Error("content required");
      entries[idx] = c;
      this.write(store, entries);
      return `Replaced. ${stat()}`;
    }
    if (args.action === "remove") {
      entries.splice(idx, 1);
      this.write(store, entries);
      return `Removed. ${stat()}`;
    }
    throw new Error("action must be add, replace or remove");
  }

  /** Text block injected into the system message. */
  block(): string {
    const part = (title: string, store: MemoryStoreName) => {
      const e = this.read(store);
      return e.length ? `## ${title} (${e.join(SEP).length}/${this.limit(store)} chars)\n${e.join("\n§\n")}` : `## ${title}\n(empty)`;
    };
    return `<memory>\n${part("Memory (environment and conventions)", "memory")}\n\n${part("User profile", "user")}\n</memory>`;
  }
}
