// Adapted from hermes-agent (MIT, Copyright (c) 2025 Nous Research), apps/desktop/src/components/ui/dropdown-menu.tsx @ 5688461d
// Trimmed: no search box and no hover-to-open submenus (Pheme has no caller for either). Keyboard and pointer behaviour is Radix's.
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";
import * as React from "react";
import { IconCheck, IconChevronRight } from "../../lib/icons";
import { cn } from "../../lib/utils";
import { menuItemClass, menuItemFocusClass, menuLabelClass, menuMotionClass, menuSurfaceClass } from "./menu";

function DropdownMenu({ ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />;
}

function DropdownMenuPortal({ ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Portal>) {
  return <DropdownMenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />;
}

function DropdownMenuTrigger({ ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  return <DropdownMenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />;
}

function DropdownMenuContent({ className, collisionPadding = 8, sideOffset = 4, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        className={cn(
          menuSurfaceClass,
          menuMotionClass,
          "z-50 max-h-(--radix-dropdown-menu-content-available-height) min-w-36 origin-(--radix-dropdown-menu-content-transform-origin) overflow-x-hidden overflow-y-auto",
          className,
        )}
        collisionPadding={collisionPadding}
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

function DropdownMenuGroup({ ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Group>) {
  return <DropdownMenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />;
}

function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & { inset?: boolean; variant?: "default" | "destructive" }) {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(
        menuItemClass,
        menuItemFocusClass,
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[inset]:pl-7 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive",
        className,
      )}
      data-inset={inset}
      data-slot="dropdown-menu-item"
      data-variant={variant}
      {...props}
    />
  );
}

function DropdownMenuCheckboxItem({ className, children, checked, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      checked={checked}
      className={cn(menuItemClass, menuItemFocusClass, "data-[disabled]:pointer-events-none data-[disabled]:opacity-50", className)}
      data-slot="dropdown-menu-checkbox-item"
      {...props}
    >
      {children}
      <DropdownMenuPrimitive.ItemIndicator className="ml-auto flex items-center pl-2 text-foreground">
        <IconCheck className="size-3" />
      </DropdownMenuPrimitive.ItemIndicator>
    </DropdownMenuPrimitive.CheckboxItem>
  );
}

function DropdownMenuRadioGroup({ ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.RadioGroup>) {
  return <DropdownMenuPrimitive.RadioGroup data-slot="dropdown-menu-radio-group" {...props} />;
}

function DropdownMenuRadioItem({ className, children, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.RadioItem>) {
  return (
    <DropdownMenuPrimitive.RadioItem
      className={cn(menuItemClass, menuItemFocusClass, "data-[disabled]:pointer-events-none data-[disabled]:opacity-50", className)}
      data-slot="dropdown-menu-radio-item"
      {...props}
    >
      {children}
      <DropdownMenuPrimitive.ItemIndicator className="ml-auto flex items-center pl-2 text-foreground">
        <IconCheck className="size-3" />
      </DropdownMenuPrimitive.ItemIndicator>
    </DropdownMenuPrimitive.RadioItem>
  );
}

function DropdownMenuLabel({ className, inset, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Label> & { inset?: boolean }) {
  return (
    <DropdownMenuPrimitive.Label
      className={cn(menuLabelClass, "data-[inset]:pl-7", className)}
      data-inset={inset}
      data-slot="dropdown-menu-label"
      {...props}
    />
  );
}

function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return <DropdownMenuPrimitive.Separator className={cn("-mx-1 my-1 h-px bg-(--ui-stroke-tertiary)", className)} data-slot="dropdown-menu-separator" {...props} />;
}

function DropdownMenuShortcut({ className, ...props }: React.ComponentProps<"span">) {
  return <span className={cn("ml-auto text-xs tracking-widest text-muted-foreground", className)} data-slot="dropdown-menu-shortcut" {...props} />;
}

function DropdownMenuSub({ ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Sub>) {
  return <DropdownMenuPrimitive.Sub data-slot="dropdown-menu-sub" {...props} />;
}

function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubTrigger> & { inset?: boolean }) {
  return (
    <DropdownMenuPrimitive.SubTrigger
      className={cn(menuItemClass, menuItemFocusClass, "data-[state=open]:bg-(--ui-control-active-background) data-[inset]:pl-7", className)}
      data-inset={inset}
      data-slot="dropdown-menu-sub-trigger"
      {...props}
    >
      {children}
      <IconChevronRight className="ml-auto size-3.5 text-(--ui-text-tertiary)" />
    </DropdownMenuPrimitive.SubTrigger>
  );
}

function DropdownMenuSubContent({ className, collisionPadding = 8, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.SubContent>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.SubContent
        className={cn(menuSurfaceClass, menuMotionClass, "z-50 max-h-80 min-w-36 origin-(--radix-dropdown-menu-content-transform-origin) overflow-y-auto", className)}
        collisionPadding={collisionPadding}
        data-slot="dropdown-menu-sub-content"
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
};
