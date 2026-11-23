/**
 * What can be attached, checked in the browser before anything is uploaded. The server checks again (by looking at the real
 * bytes, and for secret-looking names), so these rules only save a round trip; they never replace the server's.
 * Kept in step with packages/server/src/attachments.ts (a test compares them).
 */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_TEXT_BYTES = 512 * 1024;
export const MAX_PER_MESSAGE = 5;
export const IMAGE_EXT = ["png", "jpg", "jpeg", "gif", "webp"];
export const TEXT_EXT = ("txt md markdown rst json jsonc csv tsv log yaml yml toml ini cfg conf xml html htm css scss less js mjs cjs jsx ts tsx py rb go rs java kt swift c h cpp hpp cc cs php sh bash zsh ps1 bat cmd sql graphql gql proto diff patch tf vue svelte lua r pl ex exs hs scala dart").split(" ");
export const TEXT_NAMES = ["dockerfile", "makefile", "license", "readme", "changelog", "gemfile", "rakefile", "procfile"];
/** For the file picker's filter. */
export const ACCEPT = [...IMAGE_EXT, ...TEXT_EXT].map((e) => `.${e}`).join(",");

export const DEFAULT_TEXT = (n: number) => (n === 1 ? "Please take a look at the attached file." : "Please take a look at the attached files.");

const kb = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.ceil(n / 1024))} KB`);
export const sizeLabel = kb;

export function isImage(f: { name: string; type?: string }): boolean {
  const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXT.includes(ext) || /^image\/(png|jpeg|gif|webp)$/.test(f.type ?? "");
}

/** Pasted screenshots often arrive with a generic name or none; give them a useful one with the right extension. */
export function nameForPasted(f: File, n: number): File {
  const ext = ({ "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" } as Record<string, string>)[f.type];
  if (!ext || (f.name && /\.[a-z0-9]+$/i.test(f.name) && f.name !== "image.png")) return f;
  return new File([f], `pasted-image${n > 1 ? `-${n}` : ""}.${ext}`, { type: f.type });
}

export interface FileCheck { accepted: File[]; problems: string[] }

/** Split a drop or pick into the files we can attach and a plain-language list of the ones we cannot. */
export function checkFiles(incoming: File[], alreadyAttached: number): FileCheck {
  const accepted: File[] = [];
  const problems: string[] = [];
  for (const f of incoming) {
    const name = f.name || "file";
    const ext = name.includes(".") ? (name.split(".").pop() ?? "").toLowerCase() : "";
    const base = (name.includes(".") ? name.slice(0, name.lastIndexOf(".")) : name).toLowerCase();
    if (alreadyAttached + accepted.length >= MAX_PER_MESSAGE) { problems.push(`Only ${MAX_PER_MESSAGE} files per message. "${name}" was left out.`); continue; }
    if (f.size === 0) { problems.push(`"${name}" is empty.`); continue; }
    if (isImage(f)) {
      if (f.size > MAX_IMAGE_BYTES) { problems.push(`"${name}" is ${kb(f.size)}. Images can be up to ${MAX_IMAGE_BYTES / 1048576} MB.`); continue; }
    } else if (TEXT_EXT.includes(ext) || (ext === "" && TEXT_NAMES.includes(base))) {
      if (f.size > MAX_TEXT_BYTES) { problems.push(`"${name}" is ${kb(f.size)}. Text files can be up to ${MAX_TEXT_BYTES / 1024} KB; attach the relevant part instead.`); continue; }
    } else {
      problems.push(`"${name}" can't be attached. Pheme takes images (PNG, JPG, GIF, WebP) and plain-text files such as .txt, .md, .json, .csv or code.`);
      continue;
    }
    if (accepted.some((a) => a.name === f.name && a.size === f.size) ) continue; // the same file dropped twice
    accepted.push(f);
  }
  return { accepted, problems };
}
