import { describe, expect, it } from "vitest";
import { describeSchedule, formatWhen, overdueSince, OVERDUE_GRACE_MS } from "../src/jobs-text.ts";

describe("describeSchedule", () => {
  it("interval: minutes, hours and days read as plain language", () => {
    expect(describeSchedule({ kind: "interval", everyMinutes: 15 })).toBe("Every 15 minutes");
    expect(describeSchedule({ kind: "interval", everyMinutes: 1 })).toBe("Every minute");
    expect(describeSchedule({ kind: "interval", everyMinutes: 60 })).toBe("Every hour");
    expect(describeSchedule({ kind: "interval", everyMinutes: 120 })).toBe("Every 2 hours");
    expect(describeSchedule({ kind: "interval", everyMinutes: 1440 })).toBe("Every day");
    expect(describeSchedule({ kind: "interval", everyMinutes: 2880 })).toBe("Every 2 days");
    expect(describeSchedule({ kind: "interval", everyMinutes: 90 })).toBe("Every 90 minutes");
  });
  it("daily: the time as entered", () => {
    expect(describeSchedule({ kind: "daily", time: "09:00" })).toBe("Daily at 09:00");
  });
  it("once: the local date and time of the run", () => {
    const at = new Date(2026, 10, 28, 9, 5).getTime();
    expect(describeSchedule({ kind: "once", at })).toBe(`Once on ${formatWhen(at)}`);
    expect(formatWhen(at)).toContain("Nov 28, 2026");
    expect(formatWhen(at)).toContain("09:05");
  });
});

describe("overdueSince", () => {
  const now = new Date(2026, 10, 28, 12, 0).getTime();
  const late = new Date(2026, 10, 28, 9, 0).getTime();
  it("says overdue since the missed run time, for an enabled job past due", () => {
    expect(overdueSince({ enabled: true, nextRunAt: late }, now)).toBe(`Overdue since ${formatWhen(late)}`);
  });
  it("is quiet for a job that is not yet due, within the grace period, paused, or with no next run", () => {
    expect(overdueSince({ enabled: true, nextRunAt: now + 1000 }, now)).toBeNull();
    expect(overdueSince({ enabled: true, nextRunAt: now - OVERDUE_GRACE_MS + 1 }, now)).toBeNull();
    expect(overdueSince({ enabled: false, nextRunAt: late }, now)).toBeNull();
    expect(overdueSince({ enabled: true, nextRunAt: null }, now)).toBeNull();
  });
});
