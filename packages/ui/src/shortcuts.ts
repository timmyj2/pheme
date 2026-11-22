/** One table of keyboard shortcuts: the handler, the palette hints and the help dialog all read it. */
export interface Shortcut {
  id: string;
  keys: string;
  label: string;
  group: "Chat" | "Navigation" | "View";
}

const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const MOD = mac ? "⌘" : "Ctrl";
export const ALT = mac ? "⌥" : "Alt";

export const SHORTCUTS: Shortcut[] = [
  { id: "palette", keys: `${MOD}+K`, label: "Command palette", group: "Navigation" },
  { id: "new", keys: `${ALT}+N`, label: "New chat", group: "Chat" },
  { id: "focus", keys: "/", label: "Focus the message box", group: "Chat" },
  { id: "search", keys: `${ALT}+S`, label: "Search chats", group: "Navigation" },
  { id: "stop", keys: "Esc", label: "Stop the current reply", group: "Chat" },
  { id: "prev", keys: `${ALT}+↑`, label: "Previous chat", group: "Navigation" },
  { id: "next", keys: `${ALT}+↓`, label: "Next chat", group: "Navigation" },
  { id: "slot", keys: `${ALT}+1…9`, label: "Jump to recent chat 1–9", group: "Navigation" },
  { id: "sidebar", keys: `${MOD}+B`, label: "Show or hide the sidebar", group: "View" },
  { id: "help", keys: `?`, label: "Keyboard shortcuts", group: "View" },
  { id: "send", keys: "Enter", label: "Send (Shift+Enter for a new line)", group: "Chat" },
  { id: "recall", keys: "↑ / ↓", label: "Recall earlier messages (in an empty box)", group: "Chat" },
];

/** True when the keystroke happened somewhere the user is typing. */
export function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
}
