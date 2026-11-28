// Adapted from hermes-agent (MIT, Copyright (c) 2025 Nous Research), apps/desktop/src/components/ui/menu.ts @ 5688461d
// The one floating-list look shared by DropdownMenu and the menu variant of Popover.

export const menuSurfaceClass =
  "rounded-lg border border-(--ui-stroke-secondary) bg-[color-mix(in_srgb,var(--ui-bg-elevated)_96%,transparent)] p-1 text-xs text-popover-foreground shadow-md backdrop-blur-md";

export const menuMotionClass =
  "data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95";

// Row shape only. Each primitive adds its own highlight and disabled selectors.
export const menuItemClass =
  "relative flex items-center gap-2 rounded-md px-2 py-1 text-xs select-none focus-visible:outline-hidden [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5";

export const menuItemFocusClass = "focus:bg-(--ui-control-active-background) focus:text-foreground";

export const menuLabelClass = "px-2 py-1 text-xs font-medium text-(--ui-text-tertiary)";
