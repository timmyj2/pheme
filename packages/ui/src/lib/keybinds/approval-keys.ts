// Adapted from hermes-agent (MIT, Copyright (c) 2025 Nous Research), apps/desktop/src/lib/keybinds/approval-keys.ts @ 5688461d
// Rewritten: no stores, composer focus or pane helpers. The gate is plain state; the window listener lives in components/tool/approval.tsx.
export type ApprovalAction = "run" | "reject";

export interface KeyLike {
  key: string;
  repeat: boolean;
  isComposing?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  defaultPrevented?: boolean;
}

export interface KeyContext {
  /** The key was pressed in a text field (the composer, a rename box). */
  editable: boolean;
  /** That text field is empty, so Enter may still run the card. */
  emptyEditable: boolean;
}

const ACTIONS: Record<string, ApprovalAction> = { Enter: "run", Escape: "reject" };

/**
 * Turns keydowns into approval answers. A key that answered stays held until its keyup, so holding Enter (auto-repeat
 * keydowns, or a press that never released) cannot approve the next card: there is no implicit allow-all.
 */
export class ApprovalKeyGate {
  private held = new Set<string>();

  keyDown(e: KeyLike, ctx: KeyContext): ApprovalAction | null {
    const action = ACTIONS[e.key];
    if (!action || e.repeat || e.isComposing || e.altKey || e.shiftKey) return null;
    if (this.held.has(e.key)) return null;
    // Enter in an empty composer runs the card even though the composer prevents its default; other keys yield to handled events.
    if (e.defaultPrevented && !ctx.editable) return null;
    if (ctx.editable && !(e.key === "Enter" && ctx.emptyEditable)) return null;
    this.held.add(e.key);
    return action;
  }

  keyUp(e: { key: string }): void {
    this.held.delete(e.key);
  }

  reset(): void {
    this.held.clear();
  }
}
