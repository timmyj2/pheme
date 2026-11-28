// Builds a unified-style diff from an edit call's arguments, so an edit row can show what changed. Copilot's edit tools
// pass old and new text rather than a diff; this is the Pheme-side synthesis.
export interface DiffStats {
  added: number;
  removed: number;
}

/** Above this many lines on either side the diff is shown as a full replacement, which keeps the cost bounded. */
const MAX_LCS_LINES = 400;
const CONTEXT = 2;

type Op = { t: " " | "+" | "-"; s: string };

function lineOps(oldText: string, newText: string): Op[] {
  const a = oldText === "" ? [] : oldText.split("\n");
  const b = newText === "" ? [] : newText.split("\n");
  if (a.length > MAX_LCS_LINES || b.length > MAX_LCS_LINES) return [...a.map((s): Op => ({ t: "-", s })), ...b.map((s): Op => ({ t: "+", s }))];
  const n = a.length;
  const m = b.length;
  // lcs[i][j] = length of the longest common subsequence of a[i..] and b[j..]
  const lcs: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ t: " ", s: a[i++] });
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) ops.push({ t: "-", s: a[i++] });
    else ops.push({ t: "+", s: b[j++] });
  }
  while (i < n) ops.push({ t: "-", s: a[i++] });
  while (j < m) ops.push({ t: "+", s: b[j++] });
  return ops;
}

/** A unified diff of two texts for one file. Unchanged lines more than two away from a change are left out; "@@" marks a gap. */
export function unifiedDiff(path: string, oldText: string, newText: string): string {
  const ops = lineOps(oldText, newText);
  const changed = ops.map((o) => o.t !== " ");
  const keep = ops.map((_, k) => changed.some((c, c2) => c && Math.abs(c2 - k) <= CONTEXT));
  const out: string[] = [`--- ${path}`, `+++ ${path}`];
  let gap = false;
  ops.forEach((o, k) => {
    if (!keep[k]) {
      gap = true;
      return;
    }
    if (gap && out.length > 2) out.push("@@");
    gap = false;
    out.push(`${o.t}${o.s}`);
  });
  return out.join("\n");
}

const pickString = (a: Record<string, unknown>, keys: string[]): string | undefined => {
  for (const k of keys) if (typeof a[k] === "string") return a[k] as string;
  return undefined;
};

/** The diff for an edit call, from its old and new text (or its full content for a new file). Undefined when the call has no text. */
export function diffFromEdit(args: unknown): string | undefined {
  if (!args || typeof args !== "object") return undefined;
  const a = args as Record<string, unknown>;
  const path = pickString(a, ["path", "file_path", "filePath", "fileName"]) ?? "file";
  const oldText = pickString(a, ["old_str", "old_string", "oldString", "old_text", "oldText"]);
  const newText = pickString(a, ["new_str", "new_string", "newString", "new_text", "newText"]);
  if (newText !== undefined) return unifiedDiff(path, oldText ?? "", newText);
  const content = pickString(a, ["content", "file_text", "fileText"]);
  if (content !== undefined) return unifiedDiff(path, "", content);
  return undefined;
}

export function diffStats(diff: string): DiffStats {
  let added = 0;
  let removed = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) added++;
    else if (line.startsWith("-")) removed++;
  }
  return { added, removed };
}
