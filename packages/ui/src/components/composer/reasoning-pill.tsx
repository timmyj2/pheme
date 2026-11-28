// Adapted from hermes-agent (MIT, Copyright (c) 2025 Nous Research), apps/desktop/src/app/chat/composer/reasoning-pill.tsx @ 5688461d
// Trimmed: one effort list (no Thinking / Fast rows, which Pheme's Copilot backend cannot set).
import { IconChevronDown } from "../../lib/icons.ts";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "../ui/dropdown-menu.tsx";
import { TID } from "../../testids.ts";

const SHORT: Record<string, string> = { minimal: "Min", low: "Low", medium: "Med", high: "High", xhigh: "Max" };
const LONG: Record<string, string> = { minimal: "Minimal", low: "Low", medium: "Medium", high: "High", xhigh: "Maximum" };
export const effortShort = (e: string) => SHORT[e] ?? e.charAt(0).toUpperCase() + e.slice(1);
const effortLong = (e: string) => LONG[e] ?? e.charAt(0).toUpperCase() + e.slice(1);

interface Props {
  /** Levels the current model accepts. The pill is not shown when this is empty. */
  efforts: string[];
  /** The level in effect: the user's choice, or the model's default. */
  value: string;
  disabled?: boolean;
  onChange: (effort: string) => void;
}

/** The effort pill ("Med ⌄") that opens a menu above the composer. Only for models that report effort levels. */
export function ReasoningPill({ efforts, value, disabled, onChange }: Props) {
  if (!efforts.length) return null;
  const current = efforts.includes(value) ? value : efforts[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="effort-pill" data-testid={TID.effortPill} aria-label={`Reasoning effort: ${effortLong(current)}. Change`} title="Reasoning effort for new replies" disabled={disabled}>
          <span>{effortShort(current)}</span>
          <IconChevronDown className="effort-pill-chevron" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" sideOffset={8} className="w-44">
        <DropdownMenuLabel>Reasoning effort</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={current} onValueChange={onChange}>
          {efforts.map((e) => (
            <DropdownMenuRadioItem key={e} value={e} data-testid={`${TID.effortOption}-${e}`}>{effortLong(e)}</DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
