/**
 * Stable test selectors. Components set `data-testid={TID.x}`; unit and e2e tests query by the same value
 * (e2e/ cannot import from the UI bundle, so it repeats the strings; keep both in step with this list).
 * Tests must not select app structure by CSS class: classes are free to change in a restyle.
 *
 * Related state is exposed as data attributes: shell `data-drawer-open` / `data-sidebar-hidden`,
 * session-row `data-active`, tab `data-active`, tool-row `data-state`, diff-line `data-kind`,
 * composer-wrap `data-dragging`.
 */
export const TID = {
  shell: "shell",
  sidebarWrap: "sidebar-wrap",
  sessionRow: "session-row", // <li> of one chat in the sidebar
  sessionButton: "session-button", // the button inside it
  tabStrip: "tab-strip",
  tab: "tab",
  menuButton: "menu-button",
  transcript: "transcript",
  userMessage: "user-message", // whole message (bubble + attachments + actions)
  userBlock: "user-block", // the bubble text
  assistantMessage: "assistant-message",
  assistantBlock: "assistant-block", // finished and streaming reply bodies
  toolGroup: "tool-group",
  toolRow: "tool-row",
  approval: "approval",
  approvalDone: "approval-done",
  approvalAllowOnce: "approval-allow-once",
  approvalAllowChat: "approval-allow-chat",
  approvalDeny: "approval-deny",
  composerWrap: "composer-wrap",
  composerInput: "composer-input",
  sendButton: "send-button",
  stopButton: "stop-button",
  contextMeter: "context-meter",
  settingsPanel: "settings-panel",
  dialogOverlay: "dialog-overlay",
  changeRow: "change-row",
  diff: "diff",
  diffLine: "diff-line",
  commitDone: "commit-done",
  branchPill: "branch-pill",
  stashItem: "stash-item",
} as const;
