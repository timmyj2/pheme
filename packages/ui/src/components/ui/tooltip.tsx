// Adapted from hermes-agent (MIT, Copyright (c) 2025 Nous Research), apps/desktop/src/components/ui/tooltip.tsx @ 5688461d
// Trimmed: no keybinding hint lookup, no input-modality tracking, no nested portal context. The bubble and its exit animation are kept.
import "./tooltip.css";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "../../lib/utils";

function TooltipProvider({ delayDuration = 350, ...props }: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return <TooltipPrimitive.Provider data-slot="tooltip-provider" delayDuration={delayDuration} {...props} />;
}

function Tooltip({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
}

function TooltipTrigger({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

/** A label, optionally followed by a key hint such as "Ctrl+K". Radix supplies the open and close timing. */
function TooltipContent({
  className,
  children,
  hint,
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content> & { hint?: React.ReactNode }) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        className={cn("tooltip-bubble z-(--z-modal-popover) flex items-center gap-2 rounded-md bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md", className)}
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        {...props}
      >
        <span className="tooltip-bubble-label">{children}</span>
        {hint ? <span className="text-(--ui-text-tertiary)">{hint}</span> : null}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
