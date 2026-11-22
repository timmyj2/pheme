import fs from "node:fs";
import path from "node:path";
import type { AgentProfile, AgentRun } from "./protocol.ts";
import { parseFrontmatter } from "./skills.ts";
import { readJson, writeJson } from "./settings.ts";

const NAME_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const MAX_RUNS = 200;

/** Profiles: <data>/agents/<name>.md (front matter name/description/tools + instructions). Runs: <data>/agent-runs.json. */
export class AgentStore {
  private dir: string;
  private runsFile: string;
  constructor(dataDir: string) {
    this.dir = path.join(dataDir, "agents");
    this.runsFile = path.join(dataDir, "agent-runs.json");
  }
  private file(name: string) {
    if (!NAME_RE.test(name)) throw new Error("agent name must be lowercase letters, digits, - or _ (max 64)");
    return path.join(this.dir, `${name}.md`);
  }
  listProfiles(): AgentProfile[] {
    if (!fs.existsSync(this.dir)) return [];
    const out: AgentProfile[] = [];
    for (const f of fs.readdirSync(this.dir)) {
      if (!f.endsWith(".md")) continue;
      const p = this.getProfile(f.slice(0, -3));
      if (p) out.push(p);
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }
  getProfile(name: string): AgentProfile | undefined {
    const f = this.file(name);
    if (!fs.existsSync(f)) return undefined;
    const fm = parseFrontmatter(fs.readFileSync(f, "utf8"));
    return { name, description: fm.description ?? "", instructions: fm.body.trim(), tools: (fm.tools ?? "").split(",").map((t) => t.trim()).filter(Boolean) };
  }
  saveProfile(p: AgentProfile): AgentProfile {
    const f = this.file(p.name);
    const description = p.description.replace(/\s+/g, " ").trim();
    if (!description) throw new Error("description is required (it tells the model when to use this agent)");
    if (!p.instructions.trim()) throw new Error("instructions are required");
    fs.mkdirSync(this.dir, { recursive: true });
    const tools = p.tools.map((t) => t.trim()).filter(Boolean);
    fs.writeFileSync(f, `---\nname: ${p.name}\ndescription: ${description}\ntools: ${tools.join(", ")}\n---\n\n${p.instructions.trim()}\n`);
    return this.getProfile(p.name)!;
  }
  /** Never destroys data: moves the profile to agents/.archive. */
  archiveProfile(name: string): void {
    const f = this.file(name);
    if (!fs.existsSync(f)) throw new Error("no such agent");
    const arch = path.join(this.dir, ".archive");
    fs.mkdirSync(arch, { recursive: true });
    fs.renameSync(f, path.join(arch, `${name}-${Date.now()}.md`));
  }

  listRuns(): AgentRun[] {
    return readJson<AgentRun[]>(this.runsFile, []).sort((a, b) => b.startedAt - a.startedAt);
  }
  upsertRun(run: AgentRun): void {
    const runs = readJson<AgentRun[]>(this.runsFile, []);
    const i = runs.findIndex((r) => r.id === run.id);
    if (i >= 0) runs[i] = run;
    else runs.push(run);
    runs.sort((a, b) => b.startedAt - a.startedAt);
    writeJson(this.runsFile, runs.slice(0, MAX_RUNS));
  }
}

/** Limits how many agent sessions run at once. */
export class Semaphore {
  private waiting: (() => void)[] = [];
  private active = 0;
  constructor(private max: number) {}
  async acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active++;
      return;
    }
    await new Promise<void>((r) => this.waiting.push(r));
  }
  release(): void {
    const next = this.waiting.shift();
    if (next) next();
    else this.active--;
  }
}
