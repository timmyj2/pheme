import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api, type BootstrapState } from "./api.ts";

export type ConnStatus = "online" | "offline" | "unauthorized";

/** Fired by a live stream that just dropped, so the connection check runs now instead of at the next poll. */
export const TROUBLE_EVENT = "pheme:trouble";

const ONLINE_POLL_MS = 5000;
const RECOVER_POLL_MS = 1200;

/**
 * Pings /api/state: keeps the usage counter and settings fresh (also across tabs) and detects a
 * stopped server or a bad/expired token. A refused connection means offline straight away; polling
 * speeds up while there is trouble so recovery shows within a second or two.
 */
export function useConnection() {
  const [status, setStatus] = useState<ConnStatus>("online");
  const [state, setState] = useState<BootstrapState | null>(null);
  const [error, setError] = useState("");
  const serverErrors = useRef(0);
  const live = useRef(true);
  const haveState = useRef(false);

  const ping = useCallback(async () => {
    try {
      const s = await api.state();
      if (!live.current) return;
      serverErrors.current = 0;
      haveState.current = true;
      setError("");
      setStatus("online");
      setState((prev) => (prev && JSON.stringify(prev) === JSON.stringify(s) ? prev : s));
    } catch (e) {
      if (!live.current) return;
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        setStatus("unauthorized");
        setError(e.message);
        return;
      }
      // status 0 = the connection itself failed. Anything else (a 500) must repeat before we call it offline.
      const unreachable = e instanceof ApiError && e.status === 0;
      if (unreachable || ++serverErrors.current >= 2) setStatus("offline");
      if (!haveState.current) setError((e as Error).message);
    }
  }, []);

  // Poll timer: restarted whenever the status changes, so going offline switches to fast polling at once.
  useEffect(() => {
    live.current = true;
    const delay = status === "online" ? ONLINE_POLL_MS : RECOVER_POLL_MS;
    const t = setInterval(() => {
      if (document.visibilityState === "visible" || status !== "online") void ping();
    }, delay);
    return () => clearInterval(t);
  }, [ping, status]);

  useEffect(() => {
    live.current = true;
    void ping();
    const wake = () => void ping();
    window.addEventListener("online", wake);
    window.addEventListener("offline", wake);
    window.addEventListener(TROUBLE_EVENT, wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      live.current = false;
      window.removeEventListener("online", wake);
      window.removeEventListener("offline", wake);
      window.removeEventListener(TROUBLE_EVENT, wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [ping]);

  return { status, state, setState, error, retry: ping };
}
