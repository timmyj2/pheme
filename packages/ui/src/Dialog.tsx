import { useEffect, type ReactNode } from "react";
import { ConfirmDialog as UiConfirmDialog } from "./components/ui/confirm-dialog.tsx";
import { Dialog as UiDialog, DialogContent, DialogTitle } from "./components/ui/dialog.tsx";
import { TID } from "./testids.ts";

/**
 * Focus goes back to whatever opened the dialog, synchronously when it unmounts. Radix returns focus on a timer,
 * so Pheme does it here and cancels Radix's own return with onCloseAutoFocus.
 */
function useReturnFocus() {
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    return () => {
      if (opener && document.contains(opener)) opener.focus();
    };
  }, []);
}

/** Accessible modal (Radix): traps Tab, closes on Esc and backdrop click, and returns focus to whatever opened it. */
export function Dialog({ label, onClose, children, className = "" }: { label: string; onClose: () => void; children: ReactNode; className?: string }) {
  useReturnFocus();
  return (
    <UiDialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        aria-describedby={undefined}
        aria-label={label}
        aria-modal="true"
        className={`dialog ${className}`}
        overlayProps={{ "data-testid": TID.dialogOverlay }}
        onCloseAutoFocus={(event) => event.preventDefault()}
        showCloseButton={false}
        onOpenAutoFocus={(event) => {
          // Callers mark the control to focus first with data-autofocus; otherwise Radix picks the first focusable.
          const target = (event.currentTarget as HTMLElement).querySelector<HTMLElement>("[data-autofocus]");
          if (target) {
            event.preventDefault();
            target.focus();
          }
        }}
      >
        <DialogTitle className="sr-only">{label}</DialogTitle>
        {children}
      </DialogContent>
    </UiDialog>
  );
}

/** Confirmation for destructive or leaving actions. Keeps the old props; the body is the description. */
export function ConfirmDialog({ title, body, confirmLabel, danger, onConfirm, onClose }: { title: string; body: string; confirmLabel: string; danger?: boolean; onConfirm: () => void; onClose: () => void }) {
  useReturnFocus();
  return (
    <UiConfirmDialog
      cancelLabel="Cancel"
      confirmLabel={confirmLabel}
      description={body}
      destructive={danger}
      dismissOnConfirm
      overlayProps={{ "data-testid": TID.dialogOverlay }}
      onClose={onClose}
      onCloseAutoFocus={(event) => event.preventDefault()}
      onConfirm={onConfirm}
      open
      title={title}
    />
  );
}
