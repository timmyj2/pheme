import { randomUUID } from "node:crypto";
import path from "node:path";
import { HttpError } from "./http-error.ts";
import { readJson, writeJson } from "./settings.ts";

export interface Prompt {
  id: string;
  name: string;
  text: string;
  /** When set, the prompt is offered only in chats whose project folder is this one. */
  projectDir?: string;
  createdAt: number;
  updatedAt: number;
}

export const MAX_PROMPTS = 200;
export const MAX_NAME = 80;
export const MAX_TEXT = 20_000;

/** A folder path as stored: trimmed, without a trailing slash (except a bare root). Empty means "all chats". */
export function normalizeDir(raw: unknown): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "string") throw new HttpError(400, "The project folder must be text.");
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(raw)) throw new HttpError(400, "The project folder has characters that cannot be in a path.");
  let d = raw.trim();
  if (!d) return undefined;
  if (d.length > 500) throw new HttpError(400, "That folder path is too long.");
  while (d.length > 1 && /[\\/]$/.test(d) && !/^[A-Za-z]:[\\/]$/.test(d)) d = d.slice(0, -1);
  return d;
}

const sameScope = (a?: string, b?: string) => (a ?? "") === (b ?? "");

function clean(name: unknown, text: unknown): { name: string; text: string } {
  if (typeof name !== "string" || typeof text !== "string") throw new HttpError(400, "A prompt needs a name and some text.");
  // eslint-disable-next-line no-control-regex
  const n = name.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!n) throw new HttpError(400, "Give the prompt a name.");
  if (n.length > MAX_NAME) throw new HttpError(400, `The name can be at most ${MAX_NAME} characters.`);
  if (!text.trim()) throw new HttpError(400, "The prompt has no text.");
  if (text.length > MAX_TEXT) throw new HttpError(400, `The prompt can be at most ${MAX_TEXT.toLocaleString()} characters.`);
  if (text.includes("\u0000")) throw new HttpError(400, "The prompt has a character that cannot be saved.");
  return { name: n, text: text.replace(/\r\n/g, "\n") };
}

/** Saved prompts: <data>/prompts.json. */
export class PromptStore {
  private file: string;
  constructor(dataDir: string) {
    this.file = path.join(dataDir, "prompts.json");
  }

  list(): Prompt[] {
    const raw = readJson<unknown>(this.file, []);
    if (!Array.isArray(raw)) return [];
    const out: Prompt[] = [];
    for (const p of raw as Partial<Prompt>[]) {
      // a hand-edited or damaged file must never break the app: skip anything that is not a whole prompt
      if (p && typeof p.id === "string" && typeof p.name === "string" && typeof p.text === "string" && p.name && p.text) {
        out.push({ id: p.id, name: p.name, text: p.text, ...(typeof p.projectDir === "string" && p.projectDir ? { projectDir: p.projectDir } : {}), createdAt: Number(p.createdAt) || 0, updatedAt: Number(p.updatedAt) || 0 });
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || a.createdAt - b.createdAt);
  }

  get(id: string): Prompt | undefined {
    return this.list().find((p) => p.id === id);
  }

  create(input: { name?: unknown; text?: unknown; projectDir?: unknown }, now = Date.now()): Prompt {
    const { name, text } = clean(input.name, input.text);
    const projectDir = normalizeDir(input.projectDir);
    const all = this.list();
    if (all.length >= MAX_PROMPTS) throw new HttpError(409, `You have ${MAX_PROMPTS} prompts already. Delete some you no longer use.`);
    if (all.some((p) => sameScope(p.projectDir, projectDir) && p.name.toLowerCase() === name.toLowerCase())) throw new HttpError(409, `You already have a prompt called "${name}" ${projectDir ? "for this project" : "for all chats"}.`);
    const p: Prompt = { id: randomUUID(), name, text, ...(projectDir ? { projectDir } : {}), createdAt: now, updatedAt: now };
    writeJson(this.file, [...all, p]);
    return p;
  }

  update(id: string, input: { name?: unknown; text?: unknown; projectDir?: unknown }, now = Date.now()): Prompt {
    const all = this.list();
    const cur = all.find((p) => p.id === id);
    if (!cur) throw new HttpError(404, "That prompt no longer exists.");
    const { name, text } = clean(input.name ?? cur.name, input.text ?? cur.text);
    const projectDir = "projectDir" in input ? normalizeDir(input.projectDir) : cur.projectDir;
    if (all.some((p) => p.id !== id && sameScope(p.projectDir, projectDir) && p.name.toLowerCase() === name.toLowerCase())) throw new HttpError(409, `You already have a prompt called "${name}" ${projectDir ? "for that project" : "for all chats"}.`);
    const next: Prompt = { id, name, text, ...(projectDir ? { projectDir } : {}), createdAt: cur.createdAt, updatedAt: now };
    writeJson(this.file, all.map((p) => (p.id === id ? next : p)));
    return next;
  }

  remove(id: string): void {
    const all = this.list();
    if (!all.some((p) => p.id === id)) throw new HttpError(404, "That prompt no longer exists.");
    writeJson(this.file, all.filter((p) => p.id !== id));
  }
}
