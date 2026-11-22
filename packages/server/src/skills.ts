import fs from "node:fs";
import path from "node:path";
import type { SkillSummary } from "./protocol.ts";
import { readJson, writeJson } from "./settings.ts";

const NAME_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export function parseFrontmatter(text: string): { name?: string; description?: string; tools?: string; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) return { body: text };
  const out: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_-]+):\s*(.*)$/.exec(line);
    if (kv) out[kv[1]] = kv[2].replace(/^["']|["']$/g, "").trim();
  }
  return { name: out.name, description: out.description, tools: out.tools, body: m[2] };
}

/** Skills live in Pheme's own folder: <data>/skills/<name>/SKILL.md (+ optional supporting files). */
export class SkillStore {
  private dir: string;
  private usageFile: string;
  constructor(dataDir: string) {
    this.dir = path.join(dataDir, "skills");
    this.usageFile = path.join(dataDir, "skill-usage.json");
  }

  /** Record that the agent loaded a skill (used by the curator to find unused ones). */
  recordView(name: string, now = Date.now()): void {
    const u = readJson<Record<string, { views: number; lastViewedAt: number }>>(this.usageFile, {});
    u[name] = { views: (u[name]?.views ?? 0) + 1, lastViewedAt: now };
    writeJson(this.usageFile, u);
  }

  /** Skills with no use for `days` days. A skill counts from its last view, else from its last edit. */
  stale(days: number, now = Date.now()): string[] {
    const u = readJson<Record<string, { lastViewedAt: number }>>(this.usageFile, {});
    const cutoff = now - days * 86_400_000;
    return this.list().filter((sk) => {
      const edited = fs.statSync(path.join(this.dir, sk.name, "SKILL.md")).mtimeMs;
      return Math.max(edited, u[sk.name]?.lastViewedAt ?? 0) < cutoff;
    }).map((sk) => sk.name);
  }
  private skillDir(name: string) {
    if (!NAME_RE.test(name)) throw new Error("skill name must be lowercase letters, digits, - or _ (max 64)");
    return path.join(this.dir, name);
  }
  private inside(name: string, rel: string) {
    const root = this.skillDir(name);
    const full = path.resolve(root, rel);
    if (full !== root && !full.startsWith(root + path.sep)) throw new Error("path escapes the skill folder");
    return full;
  }

  list(): SkillSummary[] {
    if (!fs.existsSync(this.dir)) return [];
    const out: SkillSummary[] = [];
    for (const e of fs.readdirSync(this.dir, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name.startsWith(".")) continue;
      const f = path.join(this.dir, e.name, "SKILL.md");
      if (!fs.existsSync(f)) continue;
      const fm = parseFrontmatter(fs.readFileSync(f, "utf8"));
      out.push({ name: e.name, description: fm.description ?? "" });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  view(name: string, filePath?: string): string {
    const f = this.inside(name, filePath ?? "SKILL.md");
    if (!fs.existsSync(f)) throw new Error(`not found: ${name}${filePath ? "/" + filePath : ""}`);
    return fs.readFileSync(f, "utf8");
  }

  files(name: string): string[] {
    const root = this.skillDir(name);
    const out: string[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else out.push(path.relative(root, p).split(path.sep).join("/"));
      }
    };
    if (fs.existsSync(root)) walk(root);
    return out;
  }

  private validate(content: string) {
    const fm = parseFrontmatter(content);
    if (!fm.description) throw new Error("SKILL.md needs front matter with a description:\n---\nname: x\ndescription: Use when ... \n---");
  }

  /** Implements the `skill_manage` tool. */
  manage(a: { action: string; name: string; content?: string; old_string?: string; new_string?: string; file_path?: string; file_content?: string }): string {
    const root = this.skillDir(a.name);
    const skillFile = path.join(root, "SKILL.md");
    switch (a.action) {
      case "create": {
        if (fs.existsSync(skillFile)) throw new Error("skill exists; use patch to update it");
        if (!a.content) throw new Error("content required");
        this.validate(a.content);
        fs.mkdirSync(root, { recursive: true });
        fs.writeFileSync(skillFile, a.content);
        return `Created skill ${a.name}.`;
      }
      case "edit": {
        if (!fs.existsSync(skillFile)) throw new Error("no such skill");
        if (!a.content) throw new Error("content required");
        this.validate(a.content);
        fs.writeFileSync(skillFile, a.content);
        return `Rewrote skill ${a.name}.`;
      }
      case "patch": {
        const f = this.inside(a.name, a.file_path ?? "SKILL.md");
        if (!fs.existsSync(f)) throw new Error("not found");
        const text = fs.readFileSync(f, "utf8");
        const old = a.old_string ?? "";
        if (!old) throw new Error("old_string required");
        const n = text.split(old).length - 1;
        if (n !== 1) throw new Error(n ? "old_string matches more than once; add context" : "old_string not found");
        const next = text.replace(old, () => a.new_string ?? "");
        if (!a.file_path || a.file_path === "SKILL.md") this.validate(next);
        fs.writeFileSync(f, next);
        return `Patched ${a.name}.`;
      }
      case "write_file": {
        if (!fs.existsSync(skillFile)) throw new Error("no such skill");
        if (!a.file_path || a.file_path === "SKILL.md") throw new Error("file_path required (not SKILL.md)");
        const f = this.inside(a.name, a.file_path);
        fs.mkdirSync(path.dirname(f), { recursive: true });
        fs.writeFileSync(f, a.file_content ?? "");
        return `Wrote ${a.file_path}.`;
      }
      case "remove_file": {
        if (!a.file_path || a.file_path === "SKILL.md") throw new Error("file_path required (not SKILL.md)");
        fs.rmSync(this.inside(a.name, a.file_path), { force: true });
        return `Removed ${a.file_path}.`;
      }
      case "delete": {
        // Never destroy a skill: move it to .archive.
        if (!fs.existsSync(skillFile)) throw new Error("no such skill");
        const arch = path.join(this.dir, ".archive");
        fs.mkdirSync(arch, { recursive: true });
        fs.renameSync(root, path.join(arch, `${a.name}-${Date.now()}`));
        return `Archived skill ${a.name}.`;
      }
      default:
        throw new Error("action must be create, edit, patch, write_file, remove_file or delete");
    }
  }

  index(): string {
    const skills = this.list();
    if (!skills.length) return "<skills>\n(none yet)\n</skills>";
    return `<skills>\nLoad a skill with skill_view(name) when its description matches the task.\n${skills.map((s) => `- ${s.name}: ${s.description}`).join("\n")}\n</skills>`;
  }
}
