import { IconClock, IconCopy, IconRefresh } from "../../lib/icons.ts";
import { TID } from "../../testids.ts";

/** The per-reply bar: turn duration on the left, copy and retry on the right. Revealed on hover or focus. */
export function ReplyActions({ duration, onCopy, onRetry }: { duration?: string; onCopy: () => void; onRetry?: () => void }) {
  return (
    <div className="reply-actions" data-testid={TID.replyActions}>
      <span className="reply-duration">{duration ? <><IconClock className="size-3" aria-hidden="true" /> {duration}</> : null}</span>
      <span className="reply-buttons">
        <button type="button" className="reply-btn" onClick={onCopy} aria-label="Copy message" title="Copy">
          <IconCopy className="size-3.5" aria-hidden="true" />
        </button>
        {onRetry && (
          <button type="button" className="reply-btn" onClick={onRetry} aria-label="Try again" title="Send the last message again">
            <IconRefresh className="size-3.5" aria-hidden="true" />
          </button>
        )}
      </span>
    </div>
  );
}
