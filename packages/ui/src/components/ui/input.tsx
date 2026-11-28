// Adapted from hermes-agent (MIT, Copyright (c) 2025 Nous Research), apps/desktop/src/components/ui/input.tsx @ 5688461d
import * as React from "react";
import { cn } from "../../lib/utils";

/** Text field chrome shared by Input and Textarea: stroke, inset surface, gold focus ring. */
export const controlClass =
  "w-full min-w-0 rounded-[4px] border border-(--ui-stroke-secondary) bg-(--ui-control-hover-background) px-2.5 text-[13px] text-foreground shadow-[inset_0_1px_0_color-mix(in_srgb,var(--dt-foreground)_5%,transparent)] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50";

function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      // Code, config and search fields, not prose: keep the browser from correcting them.
      autoCapitalize="off"
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      data-slot="input"
      className={cn(controlClass, "h-8", className)}
      {...props}
    />
  );
}

export { Input };
