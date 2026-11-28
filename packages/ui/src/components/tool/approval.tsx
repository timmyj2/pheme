// Adapted from hermes-agent (MIT, Copyright (c) 2025 Nous Research), apps/desktop/src/components/assistant-ui/tool/approval.tsx @ 5688461d
// Rewritten: props instead of the gateway and approval stores; no permanent-allow dialog (Pheme has no allowlist); the deny
// reason field is skipped because the engine's permission answer has no reason. Stale cards after a restart stay "expired".
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { ApprovalDecision } from "../../api.ts";
import { APPROVAL_LABEL, type Block } from "../../blocks.ts";
import { IconTerminal2 } from "../../lib/icons.ts";
import { ApprovalKeyGate } from "../../lib/keybinds/approval-keys.ts";
import { TID } from "../../testids.ts";
import { CardStack } from "./card-stack.tsx";
import "./tool.css";

export type ApprovalBlock = Extract<Block, { kind: "approval" }>;

/** Header words per permission kind. Anything else keeps the engine's own title. */
const KIND_LABEL: Record<string, string> = { shell: "Command", write: "Edit file", url: "Website access", mcp: "Tool" };
export const approvalLabel = (b: ApprovalBlock) => KIND_LABEL[b.approvalKind] ?? b.title;

/** A settled approval in the transcript: what was decided, and what it was about. */
export function ApprovalDone({ b }: { b: ApprovalBlock }) {
  return (
    <div className="approval-done muted small" data-testid={TID.approvalDone}>
      {b.decision ? APPROVAL_LABEL[b.decision] : "Approval expired"} · {b.title}: <code>{b.detail.slice(0, 140)}</code>
    </div>
  );
}

/**
 * Enter runs the top card and Escape rejects it, from anywhere except a text field with text in it and an open dialog.
 * The gate ignores auto-repeat, so holding a key never answers the next card.
 */
function useApprovalKeys(enabled: boolean, onRun: () => void, onReject: () => void) {
  const gate = useRef<ApprovalKeyGate | null>(null);
  if (!gate.current) gate.current = new ApprovalKeyGate();
  const latest = useRef({ onRun, onReject });
  latest.current = { onRun, onReject };
  useEffect(() => {
    if (!enabled) return;
    const g = gate.current as ApprovalKeyGate;
    const down = (e: KeyboardEvent) => {
      if (document.querySelector('[aria-modal="true"]')) return;
      const t = e.target instanceof HTMLElement ? e.target : null;
      const editable = !!t && (t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT");
      const text = t && "value" in t ? String((t as HTMLInputElement).value) : (t?.textContent ?? "");
      const action = g.keyDown(e, { editable, emptyEditable: editable && !text.trim() });
      if (!action) return;
      e.preventDefault();
      if (action === "run") latest.current.onRun();
      else latest.current.onReject();
    };
    const up = (e: KeyboardEvent) => g.keyUp(e);
    const blur = () => g.reset();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      g.reset();
    };
  }, [enabled]);
}

/** A swipe to the left past the threshold (min(96px, 22% of the card)) rejects; anything shorter springs back. */
const SWIPE_MAX_PX = 96;
const SWIPE_FRACTION = 0.22;

function ApprovalCard({ b, total, onAnswer }: { b: ApprovalBlock; total: number; onAnswer: (id: string, d: ApprovalDecision) => void }) {
  const [dx, setDx] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const drag = useRef<{ id: number; x: number; width: number } | null>(null);
  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
    drag.current = { id: e.pointerId, x: e.clientX, width: e.currentTarget.offsetWidth };
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const delta = Math.min(0, e.clientX - d.x);
    if (delta < -4) setSwiping(true);
    setDx(delta);
  };
  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    setSwiping(false);
    setDx(0);
    if (!d || d.id !== e.pointerId) return;
    const delta = Math.min(0, e.clientX - d.x);
    if (delta < -Math.min(SWIPE_MAX_PX, d.width * SWIPE_FRACTION)) onAnswer(b.id, "deny");
  };
  const label = approvalLabel(b);
  return (
    <div
      className="approval-card"
      data-testid={TID.approval}
      data-approval-pending="true"
      data-swiping={swiping ? "true" : undefined}
      role="group"
      aria-label={label}
      style={{ transform: `translateX(${dx}px)`, opacity: 1 - Math.min(0.5, -dx / 300) }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={() => { drag.current = null; setDx(0); setSwiping(false); }}
    >
      <div className="approval-head">
        {b.approvalKind === "shell" && <IconTerminal2 size={14} aria-hidden="true" />}
        <span>{label}</span>
        {total > 1 && <span className="approval-count" data-testid={TID.approvalCounter}>1 / {total}</span>}
      </div>
      <pre className="approval-command">{b.detail}</pre>
      <div className="approval-actions">
        <button type="button" className="btn ghost" data-testid={TID.approvalDeny} data-approval-deny onClick={() => onAnswer(b.id, "deny")}>Reject</button>
        <button type="button" className="btn" data-testid={TID.approvalAllowChat} onClick={() => onAnswer(b.id, "chat")}>Allow this session</button>
        <button type="button" className="btn primary approval-run" data-testid={TID.approvalAllowOnce} data-approval-run onClick={() => onAnswer(b.id, "once")}>
          Run <kbd aria-hidden="true">↵</kbd>
        </button>
      </div>
    </div>
  );
}

/** The pending approvals as a stack at the bottom of the thread. Only the front card is live; the rest are peeks. */
export function ApprovalStack({ items, onAnswer }: { items: ApprovalBlock[]; onAnswer: (id: string, d: ApprovalDecision) => void }) {
  const top = items[0];
  useApprovalKeys(!!top, () => top && onAnswer(top.id, "once"), () => top && onAnswer(top.id, "deny"));
  if (!top) return null;
  const activity = top.approvalKind === "shell" ? `Running ${top.detail.replace(/\s+/g, " ").slice(0, 120)}` : "Approval needed";
  return (
    <>
      <div className="approval-activity" data-testid={TID.approvalActivity}>{activity}</div>
      <section className="approval-stack" data-testid={TID.approvalStack} aria-label="Pending approvals">
        <CardStack behind={items.length - 1}>
          <ApprovalCard key={top.id} b={top} total={items.length} onAnswer={onAnswer} />
        </CardStack>
      </section>
    </>
  );
}
