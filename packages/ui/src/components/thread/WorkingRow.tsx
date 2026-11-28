import { useEffect, useState } from "react";
import { TID } from "../../testids.ts";
import { formatDuration } from "./turns.ts";

/** The quiet working line: a 12px dithered square that pulses every 5s, a muted hint and a small timer. */
export function WorkingRow({ hint = "Working" }: { hint?: string }) {
  const [since] = useState(() => Date.now());
  const [now, setNow] = useState(since);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="working-row" data-testid={TID.workingRow}>
      <span className="working-square" aria-hidden="true" />
      <span className="working-hint" role="status" aria-live="polite">{hint}</span>
      <span className="working-timer" aria-hidden="true">{formatDuration(now - since)}</span>
    </div>
  );
}
