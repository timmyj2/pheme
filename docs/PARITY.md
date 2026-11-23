# Pheme vs Hermes desktop: feature audit

Source compared: `~/.hermes/hermes-agent/apps/desktop/src/app` (folder and file names plus a few files read in full)
against `packages/ui/src` in this repo. Status as of 2026-11-22.

Caveat: Hermes behaviour below is inferred from file and folder names, not from running the app. Treat "Missing"
rows as candidates to confirm, not as a spec.

Legend: **Have** = built and browser-tested. **Missing** = in Hermes, not in Pheme, never decided.
**Dropped** = excluded on purpose in `docs/PLAN.md`. **N/A** = does not fit a Copilot-only local web app.

## Chat and composer

| Hermes feature | Pheme | Notes |
|---|---|---|
| Streaming transcript, tool rows, approval cards | Have | |
| Markdown, code highlight, copy button | Have | |
| Queue follow-ups while busy, steer/stop | Have | |
| Draft restore, input history (up/down) | Have | |
| Scroll-to-bottom, long-chat windowing | Have | |
| Session pin, archive, rename, search, unread dot | Have | Sidebar search matches titles only |
| Model pill and reasoning pill in the composer | Missing | Model is only in Settings |
| Attachments: drag-drop, paste image, file chips | Missing | Need to confirm the Copilot SDK accepts attachments |
| `@` file references, `/` slash completion, URL refs | Missing | |
| Context-usage panel (how full the context is) | Missing | |
| Large-paste handling | Missing | |
| Edit or branch an earlier message | Missing | We only offer "Try again" on the last reply |
| Session tabs, tiles, split panes, drag to reorder | Missing | Pheme shows one chat at a time |
| Session import | Missing | |
| Voice input | Dropped | |
| Guided tour, onboarding | Missing | |

## Right sidebar and projects

| Hermes feature | Pheme | Notes |
|---|---|---|
| **Review pane: changed files, diff, scopes (uncommitted, branch, last turn)** | **Missing** | Not in the plan |
| **Ship bar: generate commit message, commit, push, create or open PR** | **Missing** | Not in the plan |
| Projects, worktrees, base-branch picker, PR tag on a chat | Missing | Chats are not tied to a folder |
| Files tree with drag-and-drop | Missing | |
| Preview pane (browser, artifacts, annotate) | Dropped | Plan: artifacts dropped |
| Built-in terminal | Dropped | |

## Status bar and shell

| Hermes feature | Pheme | Notes |
|---|---|---|
| Approval-mode menu (quick switch) | Missing | Auto-approve is a Settings switch only |
| Model and reasoning menus | Missing | |
| Connection banner, retry | Have | |
| System resources, wake indicator, tray, titlebar | N/A | Desktop-shell features |

## Settings

| Hermes feature | Pheme | Notes |
|---|---|---|
| Appearance: 11 themes, dark/light/system | Have | |
| Memory settings and editor | Have | |
| Model, delegation routes | Partial | Model and review model only |
| Customizable keybindings | Missing | Shortcuts are fixed |
| Desktop notifications (turn done, approval needed) | Missing | In-app toasts only |
| Backup and restore of data | Missing | |
| Settings search | Missing | |
| Updates and about | Missing | No update check |
| Providers, API keys, custom endpoints, local models | Dropped | Copilot only |
| Plugins, MCP manager, connectors | Dropped | Copilot CLI manages its own |
| Profiles, messaging, webhooks, pets, starmap, HUD | Dropped | |

## Pages

| Hermes feature | Pheme | Notes |
|---|---|---|
| Skills page and editor | Have | |
| Agents page and cards | Have | |
| Scheduled jobs (cron) | Have | |
| Learning loops and curator | Have | |
| Command palette (Ctrl+K) | Have | |
| Command center, maintenance | Missing | |
| App-wide right-click context menu | Partial | Sidebar rows only |

## Suggested order

1. Project folder per chat plus Review pane and ship bar (commit, push, PR).
2. Model and reasoning pill in the composer, plus context-usage.
3. Attachments (after confirming SDK support).
4. Desktop notifications and backup/export.
5. Customizable keybindings, `@` and `/` completion, settings search.
6. Edit or branch an earlier message; split panes.
