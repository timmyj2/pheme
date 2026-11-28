// Adapted from hermes-agent (MIT, Copyright (c) 2025 Nous Research), apps/desktop/src/app/settings/primitives.tsx (ListRow, ToggleRow, SettingsSection) @ 5688461d
// Label on the left with a muted helper line, control on the right. Labels are real <label>s, so each control keeps its accessible name.
import { type ReactNode, useId } from "react";
import { IconChevronDown, type Icon } from "../../lib/icons.ts";
import { cn } from "../../lib/utils.ts";
import { TID } from "../../testids.ts";
import "./overlay.css";

/** One settings group. The `page` id lets the search and the left rail show or hide it. */
export function SettingsPanel({ page, children }: { page: string; children: ReactNode }) {
  return (
    <div className="flex flex-col" data-page={page} data-testid={TID.settingsPanel}>
      {children}
    </div>
  );
}

/** A group heading. Kept as an h3 so the search and the tests can find each group by its title. */
export function SettingsHeading({ children }: { children: ReactNode }) {
  return <h3 className="mt-1 mb-1 text-[13px] font-medium text-(--ui-text-tertiary)">{children}</h3>;
}

/** The label/control split. `id` ties the title to the control it names. */
export function SettingRow({ id, title, description, control, below, className }: { id?: string; title: ReactNode; description?: ReactNode; control?: ReactNode; below?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2 py-3", className)}>
      <div className="flex items-center justify-between gap-6">
        <div className="min-w-0 flex-1">
          {id ? (
            <label className="block cursor-default text-[13px] leading-5 font-medium text-foreground" htmlFor={id}>{title}</label>
          ) : (
            <div className="text-[13px] leading-5 font-medium text-foreground">{title}</div>
          )}
          {description && <div className="mt-0.5 text-xs leading-relaxed text-(--ui-text-tertiary)">{description}</div>}
        </div>
        {control && <div className="flex w-[16.5rem] max-w-[45%] shrink-0 items-center justify-end">{control}</div>}
      </div>
      {below}
    </div>
  );
}

/** An on/off row. The switch is a real checkbox named by the label. */
export function SwitchRow({ label, description, checked, onChange, disabled, below }: { label: string; description?: ReactNode; checked: boolean; onChange: (on: boolean) => void; disabled?: boolean; below?: ReactNode }) {
  const id = useId();
  return (
    <SettingRow
      id={id}
      title={label}
      description={description}
      below={below}
      control={<input checked={checked} className="settings-switch" disabled={disabled} id={id} onChange={(e) => onChange(e.target.checked)} type="checkbox" />}
    />
  );
}

/** A native select (keyboard and screen-reader behaviour for free), drawn with the Hermes chevron. */
export function SettingSelect({ id, label, value, onChange, children }: { id: string; label: string; value: string; onChange: (v: string) => void; children: ReactNode }) {
  return (
    <div className="relative w-full">
      <select aria-label={label} className="settings-select" id={id} onChange={(e) => onChange(e.target.value)} value={value}>
        {children}
      </select>
      <IconChevronDown aria-hidden="true" className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-(--ui-text-tertiary)" />
    </div>
  );
}

export function SettingIcon({ icon: Glyph }: { icon: Icon }) {
  return <Glyph aria-hidden="true" className="size-4 shrink-0 text-(--ui-text-tertiary)" />;
}
