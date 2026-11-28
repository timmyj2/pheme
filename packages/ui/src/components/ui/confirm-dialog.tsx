// Adapted from hermes-agent (MIT, Copyright (c) 2025 Nous Research), apps/desktop/src/components/ui/confirm-dialog.tsx @ 5688461d
// Trimmed: no i18n (English defaults), and ActionStatus is replaced by plain text labels.
import * as React from "react";
import { IconAlertTriangle } from "../../lib/icons";
import { Button } from "./button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./dialog";

export interface ConfirmSecondaryAction {
  label: string;
  onClick: () => void;
}

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  /** Does the work. Throw to show an inline error and keep the dialog open. */
  onConfirm: () => Promise<void> | void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  confirmLabel?: string;
  busyLabel?: string;
  doneLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** Close as soon as onConfirm resolves. */
  dismissOnConfirm?: boolean;
  /** A third, non-destructive way out, between Cancel and Confirm. Closes on click. */
  secondaryAction?: ConfirmSecondaryAction;
  /** Props for the backdrop, e.g. a test id. */
  overlayProps?: Record<`data-${string}`, string>;
  onCloseAutoFocus?: (event: Event) => void;
}

/** Confirmation dialog. Opens focused on Confirm, Enter confirms from anywhere in the dialog, Esc and Cancel dismiss. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  children,
  confirmLabel = "Confirm",
  busyLabel = "Working…",
  doneLabel = "Done",
  cancelLabel = "Cancel",
  destructive = false,
  dismissOnConfirm = false,
  secondaryAction,
  overlayProps,
  onCloseAutoFocus,
}: ConfirmDialogProps) {
  const confirmRef = React.useRef<HTMLButtonElement>(null);
  const closeTimerRef = React.useRef<number | null>(null);
  const [status, setStatus] = React.useState<"done" | "idle" | "saving">("idle");
  const [error, setError] = React.useState<string | null>(null);
  const busy = status === "saving" || status === "done";

  React.useEffect(() => {
    if (open) {
      setStatus("idle");
      setError(null);
    }
  }, [open]);

  React.useEffect(
    () => () => {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    },
    [],
  );

  async function run() {
    if (busy) return;
    setError(null);
    if (dismissOnConfirm) {
      try {
        await onConfirm();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
      return;
    }
    setStatus("saving");
    try {
      await onConfirm();
      setStatus("done");
      closeTimerRef.current = window.setTimeout(() => {
        closeTimerRef.current = null;
        onClose();
      }, 600);
    } catch (err) {
      setStatus("idle");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <Dialog onOpenChange={(value) => !value && !busy && onClose()} open={open}>
      <DialogContent
        aria-modal="true"
        className="dialog max-w-md"
        onCloseAutoFocus={onCloseAutoFocus}
        overlayProps={overlayProps}
        showCloseButton={false}
        onKeyDown={(event) => {
          // Enter and Space confirm wherever focus is inside the dialog.
          if ((event.key === "Enter" || event.key === " ") && !busy) {
            event.preventDefault();
            void run();
          }
        }}
        onOpenAutoFocus={(event) => {
          // Focus must land inside the dialog or the key handler above never sees Enter.
          event.preventDefault();
          confirmRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription className="whitespace-pre-line">{description}</DialogDescription> : null}
        </DialogHeader>
        {children}
        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <IconAlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <DialogFooter>
          <Button disabled={busy} onClick={onClose} type="button" variant="ghost">
            {cancelLabel}
          </Button>
          {secondaryAction && (
            <Button
              disabled={busy}
              onClick={() => {
                secondaryAction.onClick();
                onClose();
              }}
              type="button"
              variant="secondary"
            >
              {secondaryAction.label}
            </Button>
          )}
          <Button disabled={busy} onClick={() => void run()} ref={confirmRef} variant={destructive ? "destructive" : "default"}>
            {status === "saving" ? busyLabel : status === "done" ? doneLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
