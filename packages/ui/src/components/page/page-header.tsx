import type { ReactNode } from "react";

/** The page-header pattern: title, optional count badge, muted subtitle, and actions on the right. */
export function PageHeader({ title, badge, subtitle, actions }: { title: string; badge?: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-head flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h2 className="page-title">{title}</h2>
          {badge != null && <span className="rounded-[3px] bg-muted px-1.5 py-0.5 text-[11px] font-medium leading-none text-muted-foreground tabular-nums">{badge}</span>}
        </div>
        {subtitle && <p className="muted mt-1 text-[13px]">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
