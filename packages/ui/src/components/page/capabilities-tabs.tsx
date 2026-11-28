/** The sections of the Capabilities area. Each tab is a real link to its own route, so back, forward and reload work. */
export type CapabilityTab = "skills" | "memory" | "prompts" | "agents";

const TABS: { id: CapabilityTab; label: string }[] = [
  { id: "skills", label: "Skills" },
  { id: "memory", label: "Memory" },
  { id: "prompts", label: "Prompts" },
  { id: "agents", label: "Agents" },
];

export function CapabilitiesTabs({ active, counts = {} }: { active: CapabilityTab; counts?: Partial<Record<CapabilityTab, number>> }) {
  return (
    <nav aria-label="Capabilities sections" className="flex flex-wrap items-end gap-6 px-6 pt-4 pb-2">
      {TABS.map((t) => {
        const on = t.id === active;
        const count = counts[t.id];
        return (
          <a
            key={t.id}
            href={`#/${t.id}`}
            aria-current={on ? "page" : undefined}
            className={`relative pb-2 text-[15px] no-underline outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ${on ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t.label}
            {count != null && <sup className="ml-1 text-[10px] text-muted-foreground tabular-nums">{count}</sup>}
            {on && <span aria-hidden="true" className="absolute inset-x-0 -bottom-px h-0.5 bg-primary" />}
          </a>
        );
      })}
    </nav>
  );
}
