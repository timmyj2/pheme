import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { LazyMarkdown as Markdown } from "../../LazyMarkdown.tsx";
import { IconChevronRight } from "../../lib/icons.ts";
import { TID } from "../../testids.ts";

/** "12s" under a minute, then "1m 05s". */
export function spanLabel(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

/** Label of a finished block: no measured time, under a second, or the time. */
export function thoughtLabel(ms?: number): string {
  if (ms === undefined) return "Thought";
  if (ms < 1000) return "Thought briefly";
  return `Thought for ${spanLabel(ms)}`;
}

interface Props {
  text: string;
  /** Still streaming: "Thinking" with a live timer and a 10rem preview that follows the newest text. */
  live?: boolean;
  /** When the live stream began (epoch ms). */
  since?: number;
  /** Measured length of the finished block. */
  ms?: number;
  /** The "Collapse thinking by default" setting: no live preview. */
  collapseThinking?: boolean;
  /** A finished block that streamed live in this session keeps its preview open, as Hermes does. */
  keepOpen?: boolean;
}

/** The reasoning disclosure: a quiet header, and the reasoning text behind it. Renders nothing without text. */
export function Thinking({ text, live = false, since, ms, collapseThinking = false, keepOpen = false }: Props) {
  const previewing = live && !collapseThinking;
  const [open, setOpen] = useState(previewing || (!live && keepOpen));
  const [now, setNow] = useState(() => Date.now());
  const body = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const started = useRef(since ?? Date.now());

  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [live]);

  // Follow the newest text only while the reader is within 24px of the bottom of the preview.
  useLayoutEffect(() => {
    const el = body.current;
    if (el && previewing && follow.current) el.scrollTop = el.scrollHeight;
  }, [text, previewing, open]);

  if (!text.trim()) return null;
  const onScroll = () => {
    const el = body.current;
    if (el) follow.current = el.scrollHeight - el.clientHeight - el.scrollTop < 24;
  };

  return (
    <div className="thinking" data-testid={TID.thinking} data-live={live ? "true" : undefined}>
      <button type="button" className="thinking-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <IconChevronRight className={`thinking-caret${open ? " is-open" : ""}`} aria-hidden="true" />
        <span className={`thinking-label${live ? " thinking-shimmer" : ""}`}>{live ? "Thinking" : thoughtLabel(ms)}</span>
        {live && <span className="thinking-timer" aria-hidden="true">{spanLabel(now - started.current)}</span>}
      </button>
      {open && (
        <div ref={body} className={`thinking-body${previewing ? " is-preview" : ""}`} onScroll={onScroll}>
          <Markdown text={text} />
        </div>
      )}
    </div>
  );
}
