import type { Job, JobSchedule } from "./api.ts";

const WHEN: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false };

/** Local date and time, e.g. "Nov 28, 2026, 09:00". */
export function formatWhen(ms: number): string {
  return new Date(ms).toLocaleString("en-US", WHEN);
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** Plain-language schedule: "Every 15 minutes", "Every 2 hours", "Every day", "Daily at 09:00", "Once on Nov 28, 2026, 09:00". */
export function describeSchedule(s: JobSchedule): string {
  if (s.kind === "daily") return `Daily at ${s.time}`;
  if (s.kind === "once") return `Once on ${formatWhen(s.at)}`;
  const n = s.everyMinutes;
  if (n === 1) return "Every minute";
  if (n < 60) return `Every ${n} minutes`;
  if (n % 1440 === 0) return n === 1440 ? "Every day" : `Every ${plural(n / 1440, "day")}`;
  if (n % 60 === 0) return n === 60 ? "Every hour" : `Every ${plural(n / 60, "hour")}`;
  return `Every ${n} minutes`;
}

/** Grace period: the server checks due jobs every 30 seconds, so a run a minute late is not overdue yet. */
export const OVERDUE_GRACE_MS = 60_000;

/** "Overdue since <time>" when an enabled job's next run time passed more than a minute ago without a run; otherwise null. */
export function overdueSince(job: Pick<Job, "enabled" | "nextRunAt">, now: number): string | null {
  if (!job.enabled || job.nextRunAt == null || job.nextRunAt > now - OVERDUE_GRACE_MS) return null;
  return `Overdue since ${formatWhen(job.nextRunAt)}`;
}
