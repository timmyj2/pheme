import { useCallback, useEffect, useRef, useState } from "react";
import { api, type GitStatus } from "./api.ts";

/**
 * Git status for a chat's project folder. Refreshes when the folder changes, when a reply finishes (the agent may
 * have edited files), and every few seconds while the panel is open and the tab is visible.
 */
export function useGit(chatId: string | null, projectDir: string | undefined, open: boolean, busy: boolean) {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    if (!chatId || !projectDir) { setStatus(null); setError(""); return; }
    const mine = ++seq.current;
    setLoading(true);
    try {
      const s = await api.gitStatus(chatId);
      if (mine !== seq.current) return; // a newer request superseded this one
      setStatus(s);
      setError("");
    } catch (e) {
      if (mine === seq.current) setError((e as Error).message);
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [chatId, projectDir]);

  useEffect(() => { setStatus(null); void refresh(); }, [refresh]);
  const wasBusy = useRef(busy);
  useEffect(() => {
    if (wasBusy.current && !busy) void refresh();
    wasBusy.current = busy;
  }, [busy, refresh]);
  useEffect(() => {
    if (!open || !projectDir) return;
    const t = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 5000);
    return () => clearInterval(t);
  }, [open, projectDir, refresh]);

  return { status, error, loading, refresh };
}
