# Pheme vs Hermes desktop

## Visual comparison (2026-11-23)

Compared against three screenshots of the running Hermes desktop app, then Pheme in the same states (fake engine, throwaway data, system Chrome, 1440×900). Screenshots are the source of truth. After shots: `docs/visual/`.

**Matches more closely now**
- Composer is one rounded box with a gold focus ring, attachment cards inside (name and size), and a circular send button. New chat is a row, not a blue block.
- Inputs and selects are styled (dark fill, thin border, custom chevron). Primary actions use the theme accent. On the default theme that accent is the screenshot gold (`#f7bb2d`), with dark text.
- PR status words are filled pills (Open, Review required, Blocked), not plain text. The old rules pointed at CSS variables that were never set.
- Section labels (PINNED, BRANCHES, and the rest) use the accent, small caps.
- With the branch list open, file names stay on screen. The list used to shrink to nothing because it was allowed to flex down to zero height.
- Light theme and the 390px drawer still work. A fresh narrow load does not overflow.

**Does not match, and why**
- No Bots tab, profile pills, or reasoning menu. Those are features Pheme does not have.
- The file list shows names only (no icons drawn like the reference, no file preview). It cannot leave the project folder, or the home folder when none is set.
- The background is an original gold-tinted gradient, not the reference picture. It turns off in Settings.
- Settings has a section list beside the existing panels. It is not a full two-column settings app (no providers, billing, or gateways).
- Tab drag reorders the strip. It does not split the window.
- The branch list still scrolls inside a cap, so only a few names show at once. The file list is no longer squeezed out.
- Other themes keep their own accent. Only the default theme is the screenshot gold.

The feature table below is the 2026-11-22 source-folder audit. It is not this visual pass, and several "Missing" rows have since been built.

## Feature audit (2026-11-22)

Source compared: `~/.hermes/hermes-agent/apps/desktop/src/app` (folder and file names plus a few files read in full)
against `packages/ui/src` in this repo.

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
