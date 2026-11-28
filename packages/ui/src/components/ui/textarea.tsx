// Adapted from hermes-agent (MIT, Copyright (c) 2025 Nous Research), apps/desktop/src/components/ui/textarea.tsx @ 5688461d
import * as React from "react";
import { cn } from "../../lib/utils";
import { controlClass } from "./input";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      autoCapitalize="off"
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      data-slot="textarea"
      className={cn(controlClass, "min-h-16 py-2 leading-5", className)}
      {...props}
    />
  );
}

export { Textarea };
