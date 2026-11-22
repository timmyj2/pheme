import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api, type ApprovalDecision, type SeqEvent } from "./api.ts";
import { TROUBLE_EVENT } from "./connection.ts";

export interface Pending {
  id: number;
  text: string;
  failed?: string;
}

export type Live = "connecting" | "live" | "reconnecting";

const BACKOFF = [500, 1000, 2000, 4000, 8000];

/**
 * One chat's transcript, kept in sync over SSE.
 * - reconnects with backoff and resumes from the last event it saw
 * - shows the user's message immediately (pending) and marks it failed if the send is rejected
 * - queues messages typed while a reply is running and sends them one by one
 */
export function useChat(chatId: string | null, opts: { onChange: () => void; onError: (m: string) => void }) {
  const [events, setEvents] = useState<SeqEvent[]>([]);
  const [streaming, setStreaming] = useState("");
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState<Live>("connecting");
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [pending, setPending] = useState<Pending[]>([]);
  const [queue, setQueue] = useState<string[]>([]);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const nextId = useRef(1);
  const lastSeq = useRef(0);
  const sending = useRef(false);
  const queueRef = useRef<string[]>([]);
  queueRef.current = queue;

  useEffect(() => {
    setEvents([]);
    setStreaming("");
    setBusy(false);
    setPending([]);
    setQueue([]);
    setLoaded(false);
    setLoadError("");
    setLive("connecting");
    lastSeq.current = 0;
    sending.current = false;
    if (!chatId) {
      setLoaded(true);
      return;
    }
    let dead = false;
    let es: EventSource | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;

    const handle = (e: SeqEvent) => {
      if (e.type === "delta") {
        setStreaming((s) => s + e.text);
        return;
      }
      if (e.seq <= lastSeq.current) return;
      lastSeq.current = e.seq;
      if (e.type === "message") setStreaming("");
      if (e.type === "turn_start") setBusy(true);
      if (e.type === "user") setPending((p) => { const i = p.findIndex((x) => x.text === e.text && !x.failed); return i < 0 ? p : p.filter((_, j) => j !== i); });
      if (e.type === "idle") {
        setBusy(false);
        setStreaming("");
        optsRef.current.onChange();
      }
      setEvents((prev) => (prev.length && prev[prev.length - 1].seq >= e.seq ? prev : [...prev, e]));
    };

    const open = () => {
      if (dead) return;
      es = new EventSource(api.eventsUrl(chatId, lastSeq.current));
      es.onopen = () => {
        attempt = 0;
        setLive("live");
        // The server may have finished (or started) a turn while we were disconnected.
        api.chat(chatId).then((c) => { if (!dead) setBusy(c.busy); if (!c.busy) setStreaming(""); }).catch(() => {});
      };
      es.onmessage = (m) => {
        try {
          handle(JSON.parse(m.data) as SeqEvent);
        } catch {
          /* ignore a malformed frame */
        }
      };
      es.onerror = () => {
        es?.close();
        if (dead) return;
        setLive("reconnecting");
        window.dispatchEvent(new Event(TROUBLE_EVENT));
        // A half-streamed reply cannot be resumed: drop it, the final message arrives on reconnect.
        setStreaming("");
        timer = setTimeout(open, BACKOFF[Math.min(attempt++, BACKOFF.length - 1)]);
      };
    };

    api.chat(chatId).then((c) => {
      if (dead) return;
      setEvents(c.events);
      setBusy(c.busy);
      lastSeq.current = c.events.length ? c.events[c.events.length - 1].seq : 0;
      setLoaded(true);
      open();
    }).catch((e: Error) => {
      if (dead) return;
      setLoaded(true);
      setLoadError(e instanceof ApiError && e.status === 404 ? "This chat no longer exists." : e.message);
    });

    return () => {
      dead = true;
      clearTimeout(timer);
      es?.close();
    };
  }, [chatId]);

  const post = useCallback(async (id: string, text: string, p: Pending) => {
    sending.current = true;
    setBusy(true);
    try {
      await api.send(id, text);
    } catch (e) {
      sending.current = false;
      if (e instanceof ApiError && e.status === 409) {
        // The server is still on the previous turn: wait for it instead of failing.
        setPending((ps) => ps.filter((x) => x.id !== p.id));
        setQueue((q) => [text, ...q]);
        return;
      }
      setBusy(false);
      setPending((ps) => ps.map((x) => (x.id === p.id ? { ...x, failed: (e as Error).message } : x)));
      optsRef.current.onError((e as Error).message);
    }
    sending.current = false;
  }, []);

  const send = useCallback((text: string) => {
    if (!chatId) return;
    if (busy || sending.current) {
      setQueue((q) => [...q, text]);
      return;
    }
    const p: Pending = { id: nextId.current++, text };
    setPending((ps) => [...ps, p]);
    void post(chatId, text, p);
  }, [chatId, busy, post]);

  // Send the next queued message as soon as the reply finishes.
  useEffect(() => {
    if (!chatId || busy || sending.current || !queue.length || live === "reconnecting") return;
    const [next, ...rest] = queue;
    setQueue(rest);
    const p: Pending = { id: nextId.current++, text: next };
    setPending((ps) => [...ps, p]);
    void post(chatId, next, p);
  }, [busy, queue, chatId, post, live]);

  const stop = useCallback(async (): Promise<string[]> => {
    // Stopping hands queued messages back to the caller so nothing the user typed is lost.
    const held = queueRef.current;
    setQueue([]);
    if (chatId) await api.stop(chatId).catch((e: Error) => optsRef.current.onError(e.message));
    return held;
  }, [chatId]);

  const dropPending = useCallback((id: number) => setPending((ps) => ps.filter((x) => x.id !== id)), []);
  const removeQueued = useCallback((i: number) => setQueue((q) => q.filter((_, j) => j !== i)), []);
  const answer = useCallback((approvalId: string, d: ApprovalDecision) => {
    if (chatId) void api.approve(chatId, approvalId, d).catch((e: Error) => optsRef.current.onError(e.message));
  }, [chatId]);

  return { events, streaming, busy, live, loaded, loadError, pending, queue, send, stop, dropPending, removeQueued, answer };
}
