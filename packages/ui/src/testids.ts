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
  tabClose: "tab-close", // the × that shows on a hovered or focused tab
  menuButton: "menu-button",
  transcript: "transcript",
  turn: "turn", // one user prompt and the replies after it
  scrollToBottom: "scroll-to-bottom", // the floating pill when the reader is scrolled up
  workingRow: "working-row", // the quiet working line while a turn runs
 thinking: "thinking", // the reasoning disclosure: live "Thinking" or "Thought for Ns"
 toolProgress: "tool-progress", // the last progress line under a running tool
 todoRow: "todo-row", // one todo in the status stack
  replyActions: "reply-actions", // the hover bar under a reply
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
  approvalStack: "approval-stack", // the bottom-of-thread stack of pending cards
  approvalCounter: "approval-counter", // "1 / 3" on the front card
  approvalActivity: "approval-activity", // one line above the stack
  toolRun: "tool-run", // consecutive calls folded into one summary line
  runSummary: "run-summary", // that summary line (its button)
  toolTicker: "tool-ticker", // the live reel under a run
  delegateRow: "delegate-row", // one sub-agent in the delegate card
  composerWrap: "composer-wrap",
  composerInput: "composer-input",
  composerBox: "composer-box", // the gold-edged box holding the strip, attachments and the input row
  attachFiles: "attach-files", // the "Attach files or images" item in the "+" menu
  sendButton: "send-button",
  stopButton: "stop-button",
  contextMeter: "context-meter",
  statusStack: "status-stack", // the card above the composer with subagents, background runs and the queue
  effortPill: "effort-pill", // the reasoning-effort pill (only for models that report levels)
  effortOption: "effort-option", // prefix; each menu item is effort-option-<level>
  settingsPanel: "settings-panel",
  dialogOverlay: "dialog-overlay",
  rightPanelToggle: "right-panel-toggle", // the project bar button that shows or hides the docked right panel
  rightPanel: "right-panel",
  rightTabFiles: "right-tab-files",
  rightTabChanges: "right-tab-changes",
  changeRow: "change-row",
  diff: "diff",
  diffLine: "diff-line",
  commitDone: "commit-done",
  branchPill: "branch-pill",
  stashItem: "stash-item",
} as const;
