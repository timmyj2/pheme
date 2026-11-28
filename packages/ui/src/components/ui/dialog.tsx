// Adapted from hermes-agent (MIT, Copyright (c) 2025 Nous Research), apps/desktop/src/components/ui/dialog.tsx @ 5688461d
// Trimmed: no i18n (the close label is English), no banner, no nested portal context.
import { Dialog as DialogPrimitive } from "radix-ui";
import * as React from "react";
import { IconX } from "../../lib/icons";
import { cn } from "../../lib/utils";
import { Button } from "./button";

function Dialog({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({ ...props }: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({ className, blur = true, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay> & { blur?: boolean }) {
  return (
    <DialogPrimitive.Overlay
      className={cn(
        "fixed inset-0 z-(--z-modal-backdrop) pointer-events-auto bg-black/22 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
        blur && "backdrop-blur-[0.125rem]",
        className,
      )}
      data-slot="dialog-overlay"
      {...props}
    />
  );
}

/** The top-right X. Radix Close routes through onOpenChange, the same path as Escape. */
function DialogCloseButton() {
  return (
    <DialogPrimitive.Close asChild data-slot="dialog-close-button">
      <Button aria-label="Close" className="absolute top-2.5 right-2.5 z-20 text-(--ui-text-tertiary) hover:text-foreground" size="icon-xs" variant="ghost">
        <IconX className="size-4" />
      </Button>
    </DialogPrimitive.Close>
  );
}

function DialogContent({
  className,
  bodyClassName,
  children,
  showCloseButton = true,
  blurBackdrop = true,
  overlayClassName,
  overlayProps,
  onOpenAutoFocus,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean;
  overlayClassName?: string;
  overlayProps?: Record<`data-${string}`, string>;
  blurBackdrop?: boolean;
  bodyClassName?: string;
}) {
  return (
    <DialogPortal>
      <DialogOverlay blur={blurBackdrop} className={overlayClassName} {...overlayProps} />
      <DialogPrimitive.Content
        className={cn(
          // Position only. The skin (size, padding, surface) comes from the caller's class, see Pheme's `.dialog`.
          "fixed top-1/2 left-1/2 z-(--z-modal) flex max-h-[86vh] -translate-x-1/2 -translate-y-1/2 flex-col pointer-events-auto data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
          className,
        )}
        data-slot="dialog-content"
        onOpenAutoFocus={onOpenAutoFocus}
        {...props}
      >
        <div className={cn("grid min-h-0 grid-cols-[minmax(0,1fr)] gap-3 overflow-y-auto", bodyClassName)}>{children}</div>
        {showCloseButton ? <DialogCloseButton /> : null}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1 text-left", className)} data-slot="dialog-header" {...props} />;
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)} data-slot="dialog-footer" {...props} />;
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn("text-[0.9375rem] font-semibold tracking-tight text-foreground", className)} data-slot="dialog-title" {...props} />;
}

function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn("text-xs leading-5 text-(--ui-text-tertiary)", className)} data-slot="dialog-description" {...props} />;
}

export {
  Dialog,
  DialogClose,
  DialogCloseButton,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
