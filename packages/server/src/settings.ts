import fs from "node:fs";
import path from "node:path";
import { DEFAULT_SETTINGS, type Settings, type Usage } from "./protocol.ts";

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

export { readJson, writeJson };

export class SettingsStore {
  private file: string;
  private usageFile: string;
  constructor(dir: string) {
    this.file = path.join(dir, "settings.json");
    this.usageFile = path.join(dir, "usage.json");
  }
  get(): Settings {
    return { ...DEFAULT_SETTINGS, ...readJson<Partial<Settings>>(this.file, {}) };
  }
  update(patch: Partial<Settings>): Settings {
    const next: Settings = { ...this.get() };
    for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
      const v = patch[key];
      if (v !== undefined && typeof v === typeof DEFAULT_SETTINGS[key]) (next as unknown as Record<string, unknown>)[key] = v;
    }
    writeJson(this.file, next);
    return next;
  }
  usage(): Usage {
    return { turns: 0, reviews: 0, toolSteps: 0, ...readJson<Partial<Usage>>(this.usageFile, {}) };
  }
  bumpUsage(delta: Partial<Usage>): Usage {
    const u = this.usage();
    for (const k of Object.keys(delta) as (keyof Usage)[]) u[k] += delta[k] ?? 0;
    writeJson(this.usageFile, u);
    return u;
  }
}
