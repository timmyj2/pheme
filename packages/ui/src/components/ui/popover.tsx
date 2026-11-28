// Adapted from hermes-agent (MIT, Copyright (c) 2025 Nous Research), apps/desktop/src/components/ui/popover.tsx @ 5688461d
// Trimmed: no accent variant and no nested-dialog portal context.
import { cva, type VariantProps } from "class-variance-authority";
import { Popover as PopoverPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "../../lib/utils";
import { menuSurfaceClass } from "./menu";

function Popover({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverAnchor({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />;
}

const popoverContentVariants = cva(
  "z-50 w-72 origin-(--radix-popover-content-transform-origin) rounded-lg p-2 focus-visible:outline-hidden data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
  {
    variants: {
      variant: {
        // Themed glass surface. Radix flips and shifts it off the viewport edges.
        default:
          "border border-(--ui-stroke-secondary) bg-[color-mix(in_srgb,var(--ui-bg-elevated)_92%,transparent)] text-popover-foreground backdrop-blur-md",
        // A picker list: the DropdownMenu surface, no arrow.
        menu: cn(menuSurfaceClass, "w-auto"),
      },
    },
    defaultVariants: { variant: "default" },
  },
);

interface PopoverContentProps extends React.ComponentProps<typeof PopoverPrimitive.Content>, VariantProps<typeof popoverContentVariants> {}

function PopoverContent({
  align = "center",
  arrowPadding = 12,
  children,
  className,
  collisionPadding = 8,
  variant,
  sideOffset = variant === "menu" ? 4 : 6,
  ...props
}: PopoverContentProps) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        arrowPadding={arrowPadding}
        className={cn(popoverContentVariants({ variant }), className)}
        collisionPadding={collisionPadding}
        data-slot="popover-content"
        sideOffset={sideOffset}
        {...props}
      >
        {children}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverAnchor, PopoverContent, PopoverTrigger };
