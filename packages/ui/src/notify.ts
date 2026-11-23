import { useEffect, useRef } from "react";
import type { ChatRow } from "./api.ts";

export const NOTIFY_KEY = "pheme-notify";
/** Fired in this tab after the setting changes (the browser's own storage event only reaches other tabs). */
export const NOTIFY_CHANGED = "pheme:notify-changed";

export type NotifySupport = "unsupported" | "denied" | "default" | "granted";

export function notifySupport(): NotifySupport {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission as NotifySupport;
}

export function notifyEnabled(): boolean {
  try { return localStorage.getItem(NOTIFY_KEY) === "1" && notifySupport() === "granted"; } catch { return false; }
}

export interface NotifyEvent { chatId: string; title: string; body: string; tag: string }

/**
 * Compares two snapshots of the chat list and says which notifications to show:
 * a reply that just finished, or a tool that just started waiting for approval.
 * The chat you are looking at (in a visible tab) never notifies. Exported for tests.
 */
export function diffNotifications(prev: Map<string, { busy: boolean; waiting: boolean }> | null, chats: ChatRow[], activeId: string | null, tabVisible: boolean): NotifyEvent[] {
  if (!prev) return []; // the first snapshot only establishes a baseline
  const out: NotifyEvent[] = [];
  for (const c of chats) {
    const before = prev.get(c.id);
    if (!before) continue;
    if (tabVisible && c.id === activeId) continue;
    const name = c.title.length > 80 ? c.title.slice(0, 79) + "…" : c.title;
    if (!before.waiting && c.waiting) out.push({ chatId: c.id, title: "Approval needed", body: name, tag: `approve-${c.id}` });
    else if (before.busy && !c.busy && !c.waiting) out.push({ chatId: c.id, title: "Reply ready", body: name, tag: `done-${c.id}` });
  }
  return out;
}

const snapshot = (chats: ChatRow[]) => new Map(chats.map((c) => [c.id, { busy: !!c.busy, waiting: !!c.waiting }]));

/** Shows desktop notifications when enabled. `onOpen` is called when a notification is clicked. */
export function useNotifications(chats: ChatRow[], loaded: boolean, activeId: string | null, enabled: boolean, onOpen: (chatId: string) => void): void {
  const prev = useRef<Map<string, { busy: boolean; waiting: boolean }> | null>(null);
  const open = useRef(onOpen);
  open.current = onOpen;
  useEffect(() => {
    if (!loaded) return;
    if (!enabled) { prev.current = snapshot(chats); return; }
    const events = diffNotifications(prev.current, chats, activeId, document.visibilityState === "visible");
    prev.current = snapshot(chats);
    if (notifySupport() !== "granted") return;
    for (const e of events) {
      try {
        const n = new Notification(e.title, { body: e.body, tag: e.tag });
        n.onclick = () => { window.focus(); open.current(e.chatId); n.close(); };
      } catch { /* some browsers only allow notifications from a service worker; ignore */ }
    }
  }, [chats, loaded, activeId, enabled]);
}

/** Turn notifications on (asking the browser for permission if needed) or off. Returns the state afterwards and why it failed. */
export async function setNotify(on: boolean): Promise<{ enabled: boolean; problem?: string }> {
  const finish = (enabled: boolean, problem?: string) => {
    try { localStorage.setItem(NOTIFY_KEY, enabled ? "1" : "0"); } catch { /* private mode: lasts until the tab closes */ }
    window.dispatchEvent(new Event(NOTIFY_CHANGED));
    return { enabled, problem };
  };
  if (!on) return finish(false);
  const support = notifySupport();
  if (support === "unsupported") return finish(false, "This browser does not support desktop notifications.");
  if (support === "denied") return finish(false, "Notifications are blocked for this site. Allow them in your browser's site settings, then try again.");
  if (support === "default") {
    let result: NotificationPermission;
    try { result = await Notification.requestPermission(); } catch { result = "denied"; }
    if (result !== "granted") return finish(false, "Permission was not given, so notifications stay off.");
  }
  return finish(true);
}
