import fs from "node:fs";
import path from "node:path";
import { DEFAULT_SETTINGS, type Settings, type Usage } from "./protocol.ts";

/** Read a JSON file; a missing, corrupt or wrong-shaped file (e.g. `7` where an object is expected) gives the fallback. */
function readJson<T>(file: string, fallback: T): T {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
    if (fallback !== undefined && (parsed === null || typeof parsed !== typeof fallback || Array.isArray(parsed) !== Array.isArray(fallback))) return fallback;
    return parsed as T;
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

const INT_RANGES: Partial<Record<keyof Settings, [number, number]>> = {
  skillReviewMinToolSteps: [1, 1000],
  memoryReviewEveryUserMessages: [1, 1000],
  memoryLimit: [100, 100_000],
  userLimit: [100, 100_000],
  curatorEveryDays: [1, 3650],
  curatorStaleDays: [1, 3650],
};

/** Accept only values of the right type and sane size; anything else is ignored. */
export function validSetting(key: keyof Settings, v: unknown): boolean {
  if (typeof v !== typeof DEFAULT_SETTINGS[key]) return false;
  const range = INT_RANGES[key];
  if (range) return Number.isInteger(v) && (v as number) >= range[0] && (v as number) <= range[1];
  if (typeof v === "string") return v.length <= 200;
  return true;
}

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
      if (v !== undefined && validSetting(key, v)) (next as unknown as Record<string, unknown>)[key] = v;
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
