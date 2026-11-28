// Adapted from hermes-agent (MIT, Copyright (c) 2025 Nous Research), apps/desktop/src/components/chat/diff-lines.tsx @ 5688461d
// Rewritten: plain text lines only (no syntax highlighter), so file contents can never inject markup.
import { TID } from "../../testids.ts";
import "./tool.css";

export type DiffKind = "hunk" | "add" | "del" | "ctx";

export function diffKind(line: string): DiffKind {
  if (line.startsWith("@@")) return "hunk";
  if (line.startsWith("+")) return "add";
  if (line.startsWith("-")) return "del";
  return "ctx";
}

/** One line per row, each with a left rule and tint for additions and removals. The panel scrolls inside its 12rem cap. */
export function DiffLines({ diff }: { diff: string }) {
  return (
    <div className="tool-diff" data-testid={TID.diff} aria-label="Diff">
      {diff.split("\n").map((line, i) => {
        const kind = diffKind(line);
        return (
          <span key={i} className={`tool-diff-line ${kind}`} data-testid={TID.diffLine} data-kind={kind}>
            {line || " "}
          </span>
        );
      })}
    </div>
  );
}
