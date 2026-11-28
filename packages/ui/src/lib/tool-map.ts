// Maps the tool names the engines emit (GitHub Copilot CLI built-ins, Pheme's own tools and the fake engine) onto the
// categories the transcript groups by. Names come from the pinned @github/copilot-sdk types (bash, view, edit, create,
// grep, glob, task, web_fetch, web_search) and packages/server/src/fake.ts. Anything unknown is "Used tool", never an error.
export type ToolCategory = "explore" | "search" | "browse" | "run" | "edit" | "delegate" | "other";

interface ToolSpec {
  category: ToolCategory;
  past: string;
  present: string;
}

const SPECS: Record<string, ToolSpec> = {
  bash: { category: "run", past: "Ran command", present: "Running command" },
  shell: { category: "run", past: "Ran command", present: "Running command" },
  terminal: { category: "run", past: "Ran command", present: "Running command" },
  view: { category: "explore", past: "Read file", present: "Reading file" },
  read_file: { category: "explore", past: "Read file", present: "Reading file" },
  list_files: { category: "explore", past: "Listed files", present: "Listing files" },
  glob: { category: "explore", past: "Listed files", present: "Listing files" },
  grep: { category: "search", past: "Searched files", present: "Searching files" },
  search_files: { category: "search", past: "Searched files", present: "Searching files" },
  web_search: { category: "search", past: "Searched web", present: "Searching web" },
  web_fetch: { category: "browse", past: "Read webpage", present: "Reading webpage" },
  edit: { category: "edit", past: "Edited file", present: "Editing file" },
  str_replace_editor: { category: "edit", past: "Edited file", present: "Editing file" },
  patch: { category: "edit", past: "Patched file", present: "Patching file" },
  create: { category: "edit", past: "Wrote file", present: "Writing file" },
  write_file: { category: "edit", past: "Wrote file", present: "Writing file" },
  task: { category: "delegate", past: "Delegated task", present: "Delegating task" },
  agent: { category: "delegate", past: "Delegated task", present: "Delegating task" },
  memory: { category: "other", past: "Updated memory", present: "Updating memory" },
  skill_view: { category: "other", past: "Viewed skill", present: "Viewing skill" },
  skill_manage: { category: "other", past: "Updated skill", present: "Updating skill" },
};

const FALLBACK: ToolSpec = { category: "other", past: "Used tool", present: "Using tool" };

/** Summary wording per category: the verb (past and present) and the noun for a count. Order is the order clauses appear. */
export const CATEGORY_ORDER: ToolCategory[] = ["edit", "explore", "search", "browse", "run", "delegate", "other"];
export const CATEGORY_WORDS: Record<ToolCategory, { past: string; present: string; one: string; many: string }> = {
  edit: { past: "Edited", present: "editing", one: "file", many: "files" },
  explore: { past: "Explored", present: "exploring", one: "file", many: "files" },
  search: { past: "Searched", present: "searching", one: "search", many: "searches" },
  browse: { past: "Read", present: "reading", one: "page", many: "pages" },
  run: { past: "Ran", present: "running", one: "command", many: "commands" },
  delegate: { past: "Delegated", present: "delegating", one: "task", many: "tasks" },
  other: { past: "Used", present: "using", one: "tool", many: "tools" },
};

/** Cards break a run of calls and render on their own: file edits (their diff shows) and delegations. */
export const CARD_CATEGORIES: ReadonlySet<ToolCategory> = new Set<ToolCategory>(["edit", "delegate"]);

export function toolSpec(name: string): ToolSpec {
  return SPECS[name.toLowerCase()] ?? FALLBACK;
}

const TARGET_KEYS = ["command", "cmd", "path", "file_path", "filePath", "fileName", "url", "query", "pattern", "task", "goal", "detail", "description", "name"] as const;

/** The most descriptive argument of a call as one short line: the command, file, query or URL. */
export function toolTarget(args: unknown): string {
  if (!args || typeof args !== "object") return "";
  const a = args as Record<string, unknown>;
  for (const k of TARGET_KEYS) {
    const v = a[k];
    if (typeof v === "string" && v.trim()) return v.replace(/\s+/g, " ").trim().slice(0, 160);
  }
  return "";
}

export interface ToolView {
  category: ToolCategory;
  /** The verb phrase for the row: present tense while the call runs. */
  title: string;
  target: string;
}

export function toolView(name: string, args: unknown, running: boolean): ToolView {
  const spec = toolSpec(name);
  return { category: spec.category, title: running ? spec.present : spec.past, target: toolTarget(args) };
}
