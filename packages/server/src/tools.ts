import type { ToolDef } from "./engine.ts";
import type { MemoryStore } from "./memory.ts";
import type { SkillStore } from "./skills.ts";

const wrap = (fn: (a: Record<string, unknown>) => string) => (a: Record<string, unknown>) => {
  try {
    return fn(a);
  } catch (e) {
    // Tool errors go back to the model as text so it can correct itself.
    return `Error: ${(e as Error).message}`;
  }
};

export function memoryTool(memory: MemoryStore): ToolDef {
  return {
    name: "memory",
    description:
      "Save durable facts that should be remembered in every future chat. Two stores: 'user' = who the user is (name, role, preferences, style); 'memory' = environment facts and standing conventions. Never save task progress or temporary state. Actions: add, replace (needs old_text identifying one entry), remove (old_text).",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["add", "replace", "remove"] },
        store: { type: "string", enum: ["memory", "user"] },
        content: { type: "string", description: "Entry text for add/replace." },
        old_text: { type: "string", description: "Substring identifying the existing entry for replace/remove." },
      },
      required: ["action", "store"],
    },
    handler: wrap((a) => memory.apply(a as never)),
  };
}

export function skillTools(skills: SkillStore): ToolDef[] {
  return [
    {
      name: "skill_view",
      description: "Read a skill's SKILL.md (or a supporting file with file_path). Call with no name to list skills.",
      parameters: {
        type: "object",
        properties: { name: { type: "string" }, file_path: { type: "string" } },
      },
      handler: wrap((a) => {
        if (!a.name) return skills.index();
        const text = skills.view(String(a.name), a.file_path ? String(a.file_path) : undefined);
        const extra = a.file_path ? "" : skills.files(String(a.name)).filter((f) => f !== "SKILL.md");
        return Array.isArray(extra) && extra.length ? `${text}\n\n[supporting files: ${extra.join(", ")}]` : text;
      }),
    },
    {
      name: "skill_manage",
      description:
        "Create or update skills (reusable procedures). Actions: create (name, content = full SKILL.md with front matter name/description), patch (name, old_string, new_string, optional file_path), edit (full rewrite), write_file / remove_file (file_path), delete (archives). Prefer patch over create when a skill already covers the topic.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["create", "edit", "patch", "write_file", "remove_file", "delete"] },
          name: { type: "string" },
          content: { type: "string" },
          old_string: { type: "string" },
          new_string: { type: "string" },
          file_path: { type: "string" },
          file_content: { type: "string" },
        },
        required: ["action", "name"],
      },
      handler: wrap((a) => skills.manage(a as never)),
    },
  ];
}
