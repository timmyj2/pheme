import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { HttpError } from "./http-error.ts";
import { looksSecret } from "./git.ts";

export interface AttachmentRef {
  id: string;
  /** The name the user's file had (cleaned up). Shown in the chat and given to Copilot. */
  name: string;
  kind: "image" | "text";
  mime: string;
  size: number;
}

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_TEXT_BYTES = 512 * 1024;
export const MAX_PER_MESSAGE = 5;
const MAX_PER_CHAT_BYTES = 50 * 1024 * 1024;
const UNSENT_TTL_MS = 24 * 60 * 60 * 1000;

const IMAGE_TYPES: Record<string, { mime: string; ext: string }> = {
  png: { mime: "image/png", ext: ".png" },
  jpg: { mime: "image/jpeg", ext: ".jpg" },
  jpeg: { mime: "image/jpeg", ext: ".jpg" },
  gif: { mime: "image/gif", ext: ".gif" },
  webp: { mime: "image/webp", ext: ".webp" },
};

/** Plain-text kinds Pheme will hand to Copilot. A short, explicit list: anything else is refused rather than guessed at. */
const TEXT_EXT = new Set(("txt md markdown rst json jsonc csv tsv log yaml yml toml ini cfg conf xml html htm css scss less js mjs cjs jsx ts tsx py rb go rs java kt swift c h cpp hpp cc cs php sh bash zsh ps1 bat cmd sql graphql gql proto diff patch tf vue svelte lua r pl ex exs hs scala dart").split(" "));
const TEXT_NAMES = new Set(["dockerfile", "makefile", "license", "readme", "changelog", "gemfile", "rakefile", "procfile"]);

/** What the bytes really are, whatever the file claims to be. */
export function sniffImage(b: Buffer): "png" | "jpg" | "gif" | "webp" | null {
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.length >= 6 && (b.subarray(0, 6).toString("latin1") === "GIF87a" || b.subarray(0, 6).toString("latin1") === "GIF89a")) return "gif";
  if (b.length >= 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
  return null;
}

/** A safe display name: no folders, no control characters, no leading dots or spaces, at most 100 characters (extension kept). */
export function cleanName(raw: string): string {
  // eslint-disable-next-line no-control-regex
  let n = String(raw ?? "").replace(/[\u0000-\u001f\u007f]/g, "").replace(/[\\/]+/g, "/").split("/").pop() ?? "";
  n = n.replace(/[<>:"|?*]/g, "_").replace(/^[. ]+/, "").replace(/[. ]+$/, "").trim();
  if (n.length > 100) {
    const ext = path.extname(n).slice(0, 12);
    n = n.slice(0, 100 - ext.length) + ext;
  }
  return n || "file";
}

function isUtf8Text(b: Buffer): boolean {
  if (b.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(b);
    return true;
  } catch {
    return false;
  }
}

export interface Checked { kind: "image" | "text"; mime: string; ext: string; name: string }

/** Decide whether a file can be attached, from its name and its actual bytes. Throws a 4xx with a plain reason. */
export function checkAttachment(rawName: string, data: Buffer): Checked {
  const name = cleanName(rawName);
  if (data.length === 0) throw new HttpError(400, `"${name}" is empty.`);
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  const base = (dot > 0 ? name.slice(0, dot) : name).toLowerCase();
  const sniffed = sniffImage(data);
  if (IMAGE_TYPES[ext] || sniffed) {
    if (!sniffed) throw new HttpError(415, `"${name}" is named like an image but is not one.`);
    if (IMAGE_TYPES[ext] && IMAGE_TYPES[ext].mime !== IMAGE_TYPES[sniffed].mime) throw new HttpError(415, `"${name}" says it is a .${ext} but its contents are ${sniffed.toUpperCase()}. Rename it and try again.`);
    if (data.length > MAX_IMAGE_BYTES) throw new HttpError(413, `"${name}" is ${(data.length / 1048576).toFixed(1)} MB. Images can be up to ${MAX_IMAGE_BYTES / 1048576} MB.`);
    return { kind: "image", mime: IMAGE_TYPES[sniffed].mime, ext: IMAGE_TYPES[sniffed].ext, name };
  }
  // Check the name as the user's file really was too: cleaning strips a leading dot, which would turn ".env" into "env".
  const original = String(rawName ?? "").split(/[\\/]/).pop() ?? "";
  if (looksSecret(name) || looksSecret(original) || /\.env$/i.test(original)) throw new HttpError(422, `"${name}" looks like it holds a secret (a key, a password or credentials). Pheme will not send it to Copilot.`);
  if (!TEXT_EXT.has(ext) && !(ext === "" && TEXT_NAMES.has(base))) {
    throw new HttpError(415, `Pheme can attach images (PNG, JPG, GIF, WebP) and plain-text files such as .txt, .md, .json, .csv or code. "${name}" is neither.`);
  }
  if (data.length > MAX_TEXT_BYTES) throw new HttpError(413, `"${name}" is ${Math.round(data.length / 1024)} KB. Text files can be up to ${MAX_TEXT_BYTES / 1024} KB; send the relevant part instead.`);
  if (!isUtf8Text(data)) throw new HttpError(415, `"${name}" is not plain text (it is binary or in an unsupported encoding).`);
  return { kind: "text", mime: "text/plain", ext: ext ? `.${ext}` : "", name };
}

interface Meta extends AttachmentRef { file: string; createdAt: number; sent: boolean }
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const isAttachmentId = (s: unknown): s is string => typeof s === "string" && ID.test(s);

/** Files attached to chats, kept under <data>/attachments/<chat id>/. */
export class AttachmentStore {
  readonly root: string;
  constructor(dataDir: string) {
    this.root = path.join(dataDir, "attachments");
  }
  private dir(chatId: string): string {
    if (!/^[A-Za-z0-9-]{1,64}$/.test(chatId)) throw new HttpError(400, "bad chat id");
    return path.join(this.root, chatId);
  }

  save(chatId: string, rawName: string, data: Buffer): AttachmentRef {
    const c = checkAttachment(rawName, data);
    const dir = this.dir(chatId);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    this.sweep(chatId);
    let used = 0;
    for (const f of fs.readdirSync(dir)) { try { used += fs.statSync(path.join(dir, f)).size; } catch { /* gone */ } }
    if (used + data.length > MAX_PER_CHAT_BYTES) throw new HttpError(413, "This chat already holds a lot of attachments. Start a new chat, or delete this one's attachments by deleting the chat.");
    const id = randomUUID();
    const file = `${id}${c.ext}`;
    fs.writeFileSync(path.join(dir, file), data, { mode: 0o600 });
    const meta: Meta = { id, name: c.name, kind: c.kind, mime: c.mime, size: data.length, file, createdAt: Date.now(), sent: false };
    fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(meta), { mode: 0o600 });
    return { id, name: c.name, kind: c.kind, mime: c.mime, size: data.length };
  }

  private meta(chatId: string, id: string): Meta | null {
    if (!isAttachmentId(id)) return null;
    try {
      const m = JSON.parse(fs.readFileSync(path.join(this.dir(chatId), `${id}.json`), "utf8")) as Meta;
      // never trust a stored file name: it must be this id plus a plain extension, nothing else
      if (m.id !== id || path.basename(m.file) !== m.file || !m.file.startsWith(id)) return null;
      return m;
    } catch {
      return null;
    }
  }

  /** The stored file for an attachment of this chat, or null. */
  open(chatId: string, id: string): { ref: AttachmentRef; path: string } | null {
    const m = this.meta(chatId, id);
    if (!m) return null;
    const p = path.join(this.dir(chatId), m.file);
    return fs.existsSync(p) ? { ref: { id: m.id, name: m.name, kind: m.kind, mime: m.mime, size: m.size }, path: p } : null;
  }

  /** Look up what a message wants to send. Every id must belong to this chat. */
  resolve(chatId: string, ids: unknown): { ref: AttachmentRef; path: string }[] {
    if (ids === undefined || ids === null) return [];
    if (!Array.isArray(ids)) throw new HttpError(400, "attachments must be a list");
    if (ids.length > MAX_PER_MESSAGE) throw new HttpError(400, `At most ${MAX_PER_MESSAGE} attachments per message.`);
    const seen = new Set<string>();
    const out: { ref: AttachmentRef; path: string }[] = [];
    for (const id of ids) {
      if (!isAttachmentId(id)) throw new HttpError(400, "bad attachment id");
      if (seen.has(id)) continue;
      seen.add(id);
      const f = this.open(chatId, id);
      if (!f) throw new HttpError(404, "An attachment is missing. Attach it again.");
      out.push(f);
    }
    return out;
  }

  markSent(chatId: string, ids: string[]): void {
    for (const id of ids) {
      const m = this.meta(chatId, id);
      if (!m) continue;
      m.sent = true;
      try { fs.writeFileSync(path.join(this.dir(chatId), `${id}.json`), JSON.stringify(m), { mode: 0o600 }); } catch { /* best effort */ }
    }
  }

  /** Remove files that were uploaded but never sent in a message, once they are a day old. */
  sweep(chatId: string, now = Date.now()): number {
    let n = 0;
    let dir: string;
    try { dir = this.dir(chatId); } catch { return 0; }
    let names: string[];
    try { names = fs.readdirSync(dir); } catch { return 0; }
    for (const f of names) {
      if (!f.endsWith(".json")) continue;
      const id = f.slice(0, -5);
      const m = this.meta(chatId, id);
      if (m && !m.sent && now - m.createdAt > UNSENT_TTL_MS) {
        fs.rmSync(path.join(dir, m.file), { force: true });
        fs.rmSync(path.join(dir, f), { force: true });
        n++;
      }
    }
    return n;
  }

  sweepAll(now = Date.now()): number {
    let n = 0;
    try { for (const c of fs.readdirSync(this.root)) n += this.sweep(c, now); } catch { /* no folder yet */ }
    return n;
  }

  removeChat(chatId: string): void {
    try { fs.rmSync(this.dir(chatId), { recursive: true, force: true }); } catch { /* nothing to remove */ }
  }
}

/** Bytes to give the engine for an image (inline data) or the path of a text file. */
export function readForEngine(f: { ref: AttachmentRef; path: string }): { kind: "image"; name: string; mime: string; data: string } | { kind: "file"; name: string; path: string } {
  if (f.ref.kind === "image") return { kind: "image", name: f.ref.name, mime: f.ref.mime, data: fs.readFileSync(f.path).toString("base64") };
  return { kind: "file", name: f.ref.name, path: f.path };
}
