// Adapted from hermes-agent (MIT, Copyright (c) 2025 Nous Research), apps/desktop/src/components/assistant-ui/tool/fallback.tsx @ 5688461d
// Rewritten: no fallback-model view builder. The title, target and category come from lib/tool-map.ts; the copy button
// copies the command or output. Copilot reports no exit code or stderr split, so the exit chip shows only when the
// output states one, and the error block shows the whole result.
import { memo, useMemo, useState, type ReactNode } from "react";
import { IconAlertTriangle } from "../../lib/icons.ts";
import { DisclosureCaret } from "../ui/disclosure-caret.tsx";
import { GlyphSpinner } from "../ui/glyph-spinner.tsx";
import { TID } from "../../testids.ts";
import { toolDuration, type ToolItem } from "../../blocks.ts";
import { diffFromEdit, diffStats } from "../../lib/diff.ts";
import { toolTarget, toolView } from "../../lib/tool-map.ts";
import { DiffLines } from "./diff-lines.tsx";
import "./tool.css";

/** The exit status the output states ("<exited with exit code 2>", "exit status: 0"). Undefined when it says nothing. */
export function exitCode(result: string | undefined): number | undefined {
  const m = result?.match(/exit(?:ed)?(?: with)?(?: exit)? (?:code|status)[: ]*(-?\d+)/i);
  return m ? Number(m[1]) : undefined;
}

function copy(text: string) {
  void navigator.clipboard?.writeText(text).catch(() => {});
}

function ErrorBlock({ result }: { result: string }) {
  const at = result.indexOf("\n\n");
  const summary = at > 0 ? result.slice(0, at) : result;
  const rest = at > 0 ? result.slice(at + 2) : "";
  return (
    <>
      <p className="tool-error-summary">{summary.slice(0, 300)}</p>
      {rest && <pre className="tool-error-body">{rest}</pre>}
    </>
  );
}

export const ToolRow = memo(function ToolRow({ item, defaultOpen = false }: { item: ToolItem; defaultOpen?: boolean }) {
  const running = item.ok === undefined;
  const state = running ? "running" : item.ok ? "ok" : "failed";
  const view = toolView(item.name, item.args, running);
  const diff = useMemo(() => (view.category === "edit" ? diffFromEdit(item.args) : undefined), [view.category, item.args]);
  const stats = diff ? diffStats(diff) : null;
  const duration = toolDuration(item);
  const [open, setOpen] = useState(defaultOpen || !!diff);
  const command = toolTarget(item.args);
  const code = view.category === "run" ? exitCode(item.result) : undefined;

  let body: ReactNode = null;
  if (open) {
    if (diff) {
      body = (
        <div className="tool-detail">
          <button type="button" className="tool-copy" onClick={() => copy(diff)}>Copy diff</button>
          <DiffLines diff={diff} />
          {item.ok === false && item.result ? <ErrorBlock result={item.result} /> : null}
        </div>
      );
    } else if (view.category === "run") {
      body = (
        <div className="tool-detail">
          <button type="button" className="tool-copy" onClick={() => copy(item.result ?? command)}>{item.result ? "Copy output" : "Copy command"}</button>
          <div className="tool-cmd">
            <span className="tool-prompt" aria-hidden="true">$</span>
            <code>{command}</code>
            {code !== undefined && <span className="tool-chip" data-ok={code === 0}>exit {code}</span>}
          </div>
          {item.ok === false && item.result ? <ErrorBlock result={item.result} /> : item.result ? <pre className="tool-output">{item.result}</pre> : null}
        </div>
      );
    } else if (command || item.result) {
      body = (
        <div className="tool-detail">
          <button type="button" className="tool-copy" onClick={() => copy(item.result || command)}>{item.result ? "Copy output" : "Copy"}</button>
          {command && <div className="tool-cmd"><code>{command}</code></div>}
          {item.ok === false && item.result ? <ErrorBlock result={item.result} /> : item.result ? <pre className="tool-output">{item.result}</pre> : null}
        </div>
      );
    }
  }

  return (
    <div className="tool-line" data-testid={TID.toolRow} data-state={state} data-category={view.category}>
      <button type="button" className="tool-line-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="tool-glyph">
          {running ? <GlyphSpinner ariaLabel="Running" /> : item.ok === false ? <IconAlertTriangle size={12} aria-hidden="true" /> : null}
        </span>
        <span className={`tool-title${running ? " tool-shimmer" : ""}`}>{view.title}</span>
        {view.target && <span className="tool-target">{view.target}</span>}
        <span className="tool-meta">
          {stats && (stats.added || stats.removed) ? <><span className="add">+{stats.added}</span> <span className="del">−{stats.removed}</span>{duration ? " · " : ""}</> : null}
          {duration}
        </span>
        <DisclosureCaret open={open} className="tool-caret" size="0.7rem" />
      </button>
      {body}
    </div>
  );
});
