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

Status as of 2026-11-28. The goal is now an exact match of the Hermes webapp (`docs/VISUAL-GOAL.md`), so the old exclusions "no Bots tab, no reasoning menu" are dropped. The rule is stub-or-skip: only UI the Copilot CLI backend can support. This list is rewritten in the last build-plan item with the final deliberate gaps.
- Not built because Copilot has no backing: Hermes pages that need a Hermes backend (for example messaging gateways, billing, quota, profiles, Nous Portal).
- Built but feature-detected: reasoning, intent line, todos, progress and the effort pill. They are hidden when the event never arrives. They are tested in fake mode only, because the real-Copilot probe was skipped.
- Not planned: assistant-ui, the contentEditable editor, voice, branching and checkpoint restore, the Shiki and Streamdown stack, the plugin registry, the flexible pane-tree layout, glass and vibrancy effects.
- Never copied, by rule: Hermes and Nous names, logos, artwork, backgrounds, app icons, and the Collapse, Rules, Mondwest and NeueBit fonts. Pheme shows its own mark and system fonts.
- Still different today (to be closed by the build plan in `docs/NEXT.md`): the UI is not yet on Tailwind and the Hermes token layer, the transcript and tool rows are not the Hermes layout, and the background is an original gradient, not the reference picture.

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
