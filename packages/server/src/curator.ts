import path from "node:path";
import type { App } from "./app.ts";
import type { CuratorState } from "./protocol.ts";
import { readJson, writeJson } from "./settings.ts";
import { skillTools } from "./tools.ts";

const DAY = 86_400_000;
const MIN_SKILLS_TO_CONSOLIDATE = 3;

const CURATOR_PROMPT = `[pheme:curator]
You are the curator of the user's skill library. Your job is to keep it small, non-overlapping and useful. The skills index is in your system message.

Rules:
- Find skills that cover the same class of task. Merge them: pick the best one (the umbrella), use skill_view to read the others, move any procedure steps or pitfalls worth keeping into the umbrella with skill_manage patch, then archive the redundant ones with skill_manage delete (delete only archives; nothing is lost).
- Never merge skills that are about different tasks just because their names look alike.
- Do not rewrite a skill that is fine. Do not create new skills.
- Keep procedures first and pitfalls as "rule - why".
- When finished, reply with one short line per change. If nothing needs merging, reply "No changes."`;

/** Periodic skill consolidation. Archives, never deletes. */
export class Curator {
  private file: string;
  private running = false;
  constructor(private app: App) {
    this.file = path.join(app.dataDir, "curator.json");
  }

  state(): CuratorState {
    const s = readJson<{ lastRunAt: number | null; report: string[] }>(this.file, { lastRunAt: null, report: [] });
    return { ...s, running: this.running };
  }

  /** Called from the scheduler tick. Starts a run when one is due. */
  maybeRun(now = Date.now()): void {
    const s = this.app.settings.get();
    if (!s.curatorEnabled || this.running) return;
    const last = this.state().lastRunAt;
    if (last !== null && now - last < s.curatorEveryDays * DAY) return;
    if (last === null) {
      // First time: start the clock instead of curating a library the user has barely built.
      writeJson(this.file, { lastRunAt: now, report: [] });
      return;
    }
    this.app.background(this.run(now));
  }

  async run(now = Date.now()): Promise<string[]> {
    if (this.running) return this.state().report;
    this.running = true;
    const report: string[] = [];
    try {
      const s = this.app.settings.get();
      for (const name of this.app.skills.stale(s.curatorStaleDays, now)) {
        this.app.skills.manage({ action: "delete", name });
        report.push(`Archived "${name}": not used for ${s.curatorStaleDays}+ days.`);
      }
      if (this.app.skills.list().length >= MIN_SKILLS_TO_CONSOLIDATE) report.push(...(await this.consolidate()));
      if (!report.length) report.push("No changes.");
    } catch (e) {
      report.push(`Curator failed: ${(e as Error).message}`);
    } finally {
      this.running = false;
      writeJson(this.file, { lastRunAt: now, report });
      this.app.settings.bumpUsage({ reviews: 1 });
    }
    return report;
  }

  private async consolidate(): Promise<string[]> {
    const before = new Set(this.app.skills.list().map((x) => x.name));
    const hidden = this.app.store.create({ hidden: true, title: "curator" });
    const lines: string[] = [];
    try {
      const session = await this.app.engine.createSession({
        id: hidden.id,
        resume: false,
        model: await this.app.loops.cheapestModel(),
        systemMessage: `You are a background curator inside the Pheme app. You have only skill tools. You cannot ask questions; act on your own judgement, then stop.\n\n${this.app.skills.index()}`,
        tools: skillTools(this.app.skills),
        customToolsOnly: true,
        onPermission: async () => "deny",
      });
      const calls = new Map<string, { name: string; args: Record<string, unknown> }>();
      await session.send(CURATOR_PROMPT, (e) => {
        if (e.type === "tool_start") calls.set(e.id, { name: e.name, args: (e.args ?? {}) as Record<string, unknown> });
        if (e.type === "tool_end" && e.ok) {
          const c = calls.get(e.id);
          if (c?.name === "skill_manage") {
            const a = c.args;
            if (a.action === "delete") lines.push(`Archived "${String(a.name)}" (merged into another skill).`);
            else if (a.action === "patch" || a.action === "edit" || a.action === "write_file") lines.push(`Updated "${String(a.name)}" with merged content.`);
          }
        }
      });
      await session.close();
    } finally {
      this.app.store.remove(hidden.id);
    }
    // Trust the files, not the model's say-so: keep only changes that really happened.
    const after = new Set(this.app.skills.list().map((x) => x.name));
    return lines.filter((l) => {
      const n = /"([^"]+)"/.exec(l)?.[1] ?? "";
      return l.startsWith("Archived") ? before.has(n) && !after.has(n) : after.has(n);
    });
  }
}
