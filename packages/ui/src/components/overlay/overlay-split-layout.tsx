// Adapted from hermes-agent (MIT, Copyright (c) 2025 Nous Research), apps/desktop/src/app/overlays/overlay-split-layout.tsx and overlay-breadcrumb-header.tsx @ 5688461d
import { type ReactNode, useState } from "react";
import { IconChevronDown, IconChevronRight, type Icon } from "../../lib/icons.ts";
import { cn } from "../../lib/utils.ts";

/** Two columns: a 12rem left rail (the Hermes 13rem measured at the reference window size) and a centred main pane. */
export function OverlaySplitLayout({ children }: { children: ReactNode }) {
  return <div className="grid h-full min-h-0 flex-1 grid-cols-[12rem_minmax(0,1fr)] overflow-hidden">{children}</div>;
}

export interface NavLeaf {
  id: string;
  label: string;
}

export interface NavGroup {
  id: string;
  label: string;
  icon: Icon;
  /** Sub-pages. A group with children expands; selecting the group opens its first child. */
  children?: NavLeaf[];
}

interface NavRowProps {
  active: boolean;
  current: boolean;
  icon?: Icon;
  label: string;
  nested?: boolean;
  onClick: () => void;
  trailing?: ReactNode;
  id: string;
}

function NavRow({ active, current, icon: Glyph, label, nested, onClick, trailing, id }: NavRowProps) {
  return (
    <button
      aria-current={current ? "page" : undefined}
      className={cn(
        "row-hover flex h-7 w-full shrink-0 items-center justify-start gap-2 rounded-md border px-2 text-left text-[13px] font-normal transition-colors focus-visible:outline-hidden focus-visible:ring-[0.1875rem] focus-visible:ring-ring/50",
        nested
          ? active
            ? "border-transparent bg-(--ui-control-hover-background) font-medium text-foreground"
            : "border-transparent bg-transparent text-(--ui-text-tertiary) hover:bg-(--ui-control-hover-background) hover:text-foreground"
          : active
            ? "border-(--ui-stroke-tertiary) bg-(--ui-bg-tertiary) text-foreground"
            : "border-transparent bg-transparent text-(--ui-text-secondary) hover:bg-(--ui-control-hover-background) hover:text-foreground",
      )}
      data-nav={id}
      onClick={onClick}
      type="button"
    >
      {Glyph && <Glyph className={cn("size-4 shrink-0", active ? "text-foreground/80" : "text-muted-foreground/80")} aria-hidden="true" />}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing}
    </button>
  );
}

/** The left rail: groups with optional sub-pages. `selected` is the id of the active leaf (or a leaf-less group). */
export function OverlayNav({ groups, selected, onSelect, label }: { groups: NavGroup[]; selected: string; onSelect: (id: string) => void; label: string }) {
  const activeGroup = groups.find((g) => g.id === selected || g.children?.some((c) => c.id === selected));
  // Expansion: the group holding the open page starts open; the user can fold or open any group.
  const [open, setOpen] = useState<Record<string, boolean>>({});
  return (
    <aside aria-label={label} className="flex min-h-0 flex-col gap-0.5 overflow-y-auto bg-(--ui-sidebar-surface-background) px-2.5 pt-2.5 pb-3">
      {groups.map((group) => {
        const hasChildren = Boolean(group.children?.length);
        const inside = group === activeGroup;
        const expanded = open[group.id] ?? inside;
        const childActive = group.children?.some((c) => c.id === selected) ?? false;
        return (
          <div key={group.id}>
            <div className="relative">
              <NavRow
                active={inside}
                current={inside && !childActive && selected === group.id}
                icon={group.icon}
                id={group.id}
                label={group.label}
                onClick={() => {
                  if (!inside && hasChildren) onSelect(group.children![0]!.id);
                  else if (!hasChildren) onSelect(group.id);
                  else setOpen((o) => ({ ...o, [group.id]: !expanded }));
                }}
                trailing={hasChildren ? <span aria-hidden="true" className="size-4 shrink-0" /> : undefined}
              />
              {hasChildren && (
                <button
                  aria-controls={`settings-nav-${group.id}`}
                  aria-expanded={expanded}
                  aria-label={`${expanded ? "Collapse" : "Expand"}: ${group.label}`}
                  className="absolute top-1/2 right-1 flex size-5 -translate-y-1/2 items-center justify-center rounded border-0 bg-transparent p-0 text-(--ui-text-tertiary) hover:text-foreground"
                  onClick={() => setOpen((o) => ({ ...o, [group.id]: !expanded }))}
                  type="button"
                >
                  {expanded ? <IconChevronDown className="size-3.5" aria-hidden="true" /> : <IconChevronRight className="size-3.5" aria-hidden="true" />}
                </button>
              )}
            </div>
            {hasChildren && expanded && (
              <div className="mt-0.5 ml-3.5 flex flex-col gap-0.5 pl-1.5" id={`settings-nav-${group.id}`}>
                {group.children!.map((child) => (
                  <NavRow key={child.id} active={child.id === selected} current={child.id === selected} id={child.id} label={child.label} nested onClick={() => onSelect(child.id)} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </aside>
  );
}

/** Main pane: scrolls on its own, content centred in a 62rem column under the close button. */
export function OverlayMain({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-0 w-full flex-1 flex-col overflow-y-auto px-[clamp(1.25rem,3.5vw,3rem)] pt-5 pb-6">
      <div className="mx-auto w-full max-w-[62rem]">{children}</div>
    </main>
  );
}

/** "Settings > Model > Main model". The last crumb is the current page. */
export function OverlayBreadcrumb({ root, group, leaf }: { root: string; group?: string; leaf: string }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4 flex min-w-0 items-center gap-1.5 text-xs text-(--ui-text-tertiary)">
      <span className="shrink-0">{root}</span>
      {group && (
        <>
          <IconChevronRight className="size-3 shrink-0" aria-hidden="true" />
          <span className="shrink-0">{group}</span>
        </>
      )}
      <IconChevronRight className="size-3 shrink-0" aria-hidden="true" />
      <span aria-current="page" className="truncate text-foreground">{leaf}</span>
    </nav>
  );
}
