import type { SeqEvent } from "./api.ts";
import { TID } from "./testids.ts";

export interface Usage { used: number; limit: number }

/** The newest usage figures in a chat's events, or null. Ignores anything that is not a sane pair of numbers. */
export function latestUsage(events: SeqEvent[]): Usage | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type === "usage" && Number.isFinite(e.used) && Number.isFinite(e.limit) && e.limit > 0 && e.used >= 0) return { used: e.used, limit: e.limit };
  }
  return null;
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(Math.round(n));
}

export function usageLevel(pct: number): "ok" | "warn" | "full" {
  return pct >= 95 ? "full" : pct >= 80 ? "warn" : "ok";
}

/** How much of the model's memory for this chat is in use. Shown only once the engine has reported it. */
export function ContextMeter({ events }: { events: SeqEvent[] }) {
  const u = latestUsage(events);
  if (!u) return null;
  const pct = Math.min(100, Math.round((u.used / u.limit) * 100));
  const level = usageLevel(pct);
  const words = `${formatTokens(u.used)} of ${formatTokens(u.limit)} tokens, ${pct} percent`;
  const hint = level === "full" ? "Almost full. Start a new chat for a clean slate, or Copilot will compact older messages." : level === "warn" ? "Getting full. Copilot compacts older messages automatically when it runs out." : "How much of the model's memory this chat is using.";
  return (
    <div className={`ctx-meter ${level}`} data-testid={TID.contextMeter} title={hint}>
      <div role="meter" aria-label="Context used" aria-valuemin={0} aria-valuemax={u.limit} aria-valuenow={Math.min(u.used, u.limit)} aria-valuetext={words} className="ctx-bar"><i style={{ width: `${pct}%` }} /></div>
      <span className="small">{formatTokens(u.used)} / {formatTokens(u.limit)}{level !== "ok" ? ` · ${level === "full" ? "almost full" : "getting full"}` : ""}</span>
    </div>
  );
}
