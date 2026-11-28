import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./components/ui/dropdown-menu.tsx";

export interface MenuItem {
  label: string;
  run: () => void;
  danger?: boolean;
}

/** Floating menu at a point (context menu) or under a button. Radix handles arrows, Enter, Esc, outside click and focus. */
export function Menu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  return (
    <DropdownMenu modal={false} open onOpenChange={(open) => !open && onClose()}>
      <DropdownMenuTrigger asChild>
        <span aria-hidden="true" className="fixed size-0" style={{ left: x, top: y }} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-40" side="bottom">
        {items.map((it) => (
          <DropdownMenuItem key={it.label} onSelect={() => { onClose(); it.run(); }} variant={it.danger ? "destructive" : "default"}>
            {it.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
