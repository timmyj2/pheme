# Decisions log

Small implementation choices made during the build that `docs/PLAN.md` does not cover.
One line each: **decision** — why. The owner reviews these.

- **Plan decisions live in `docs/PLAN.md`** — this file is only for choices made while building.
- **Two npm workspaces (`packages/server`, `packages/ui`)** — keeps the Node bundle and the browser code apart; the UI imports only `protocol.ts` from the server.
- **Server runs TypeScript with esbuild; tests use vitest** — plan allowed either; vitest gives one runner for server and UI code.
- **Single file = esbuild bundle with the UI embedded as base64 (`__PHEME_ASSETS__` define)** — no extra files to copy besides `start-pheme.cmd`.
- **Copilot SDK (`@github/copilot-sdk` 1.0.34) bundles cleanly (1.3 MB) but only with `koffi` stubbed** — the SDK imports koffi (native FFI) at the top for its in-process mode, which Pheme never uses. The SDK's own 242 MB runtime package is NOT bundled; Pheme launches the user's own `copilot` (found on PATH or `COPILOT_CLI_PATH`) as the SDK's stdio runtime.
- **Finding: SDK 1.0.34 speaks protocol 3 and runtime 1.0.112; Copilot CLI 1.0.114 (current latest) speaks protocol 4 and the SDK refuses to connect** — `pheme doctor` and the engine now say so and name the CLI version to install (`COPILOT_CLI_TESTED`). Open question for the owner: pin the CLI, or add the ACP engine (see PROGRESS.md).
- **Finding: `copilot --acp --stdio` on 1.0.114 answers `initialize` with ACP protocol 1** — the plan's fallback engine is viable if the SDK skew becomes a problem. ACP has no custom tools or system-message append, so memory/skills would go through a small MCP server and a prompt preamble.
- **Real Copilot is not exercised by tests** — the SDK's own runtime authenticates via the `gh` login on this Mac, but a chat would spend the owner's Free quota, so that waits for the owner's go-ahead.
- **"auto" model = leave `model` unset in the SDK** — the CLI's own default is auto.
- **Cheapest review model heuristic** — first model whose id matches mini/haiku/flash/lite/nano, else `auto`; overridable in Settings.
- **Approval kinds** — reads and Pheme's own tools auto-allow; shell, write, url and mcp ask. "Allow for this chat" remembers by kind for the life of the server process.
- **Delta events are streamed but not stored** — only whole messages are persisted in the JSONL log.
- **Stale approval cards** — a card only shows while its chat is busy; after a restart it never appears.
- **Reviews run in a hidden chat that is deleted afterwards** — results appear only as a notice in the source chat.
- **Memory entries separated by `§`; skill `delete` moves to `skills/.archive`** — same convention as Hermes; deleting skills never destroys data.
- **Default port 7676, falling back to a free port** — stable bookmarks are impossible anyway because of the token.
- **UI is new code in Hermes's design vocabulary, not a file copy** — Hermes's CSS and components are tied to Tailwind, assistant-ui and its own state layer. Copied: the `--dt-*` token names, the Nous/GitHub palettes (renamed Pheme/GitHub), system font stacks and the shadow/stroke approach. Mirror of source layout (`src/themes/presets.ts`, `src/styles.css`) kept. Agents and Scheduled jobs pages are v2 and not in the nav yet.
- **CI uses `npm install`, not `npm ci`** — the Copilot SDK's per-platform optional packages make a lockfile written on macOS unreliable on Windows with `npm ci`.
- **Real-Copilot check done (3 short chats)** — custom tool, memory write and approval card verified; `tool_end` name now taken from the start event by id; repeated permission asks for one tool call are approved silently after the first Allow.
- **Job schedules: interval, daily (local HH:MM), once** — covers the plan without a cron parser.
- **Jobs run in a normal chat titled "Job: <name>"** — shows in the sidebar and keeps the transcript; job chats never prompt: allow or deny is fixed by `allowActions` at creation (reads always allowed).
- **Scheduler ticks every 30 s and advances `nextRunAt` before running** — a slow run is never started twice, and any number of missed runs collapse into one on start.
- **Subagents are both: an `agent` tool and saved profiles** — owner chose "both, parallel sessions first". The `agent` tool starts a separate engine session; saved profiles are also passed to Copilot as `customAgents` (infer on) so the CLI can delegate to them itself.
- **Sub-agent sessions get only `skill_view`** — no `agent` tool (no recursion), no memory or skill writes; a sub-agent cannot change long-term state.
- **At most 3 sub-agent sessions run at once** — protects the Free quota and the machine; extra calls wait their turn.
- **Sub-agent approvals appear as cards in the parent chat; Stop cancels the whole tree** — one place for the user to answer; child sessions are hidden chats kept for the transcript.
- **Profiles live in `~/.pheme/agents/<name>.md`, archived not deleted; runs in `agent-runs.json` (last 200)** — same conventions as skills. Profile changes apply to new chats, because Copilot gets them at session creation.
- **Real-Copilot check of subagents (2 chats)** — the model calls `agent` twice in one response and both run in parallel; a saved profile is delegated to through Copilot's own `task` tool and its `subagent.*` events become a card. The model sometimes adds a `name` argument to `agent`; it is ignored.
- **Themes generated by `scripts/gen-themes.mjs` from the Hermes preset table** — 11 themes (nous -> pheme, nous-alt -> pheme-alt). Hermes's `classic` skin is skipped (derived from a skin file, not a palette). Dark-only themes (midnight, ember, mono, cyberpunk, slate) show one mode. Per-theme web fonts are not loaded: the work laptop may block them, so every theme uses system font stacks.
- **Theme setting stays one string, "<theme>-<mode>"** — the Settings page shows two dropdowns (Theme, Mode); old values like `pheme-dark` and `system` still work.
- **Curator: stale = no skill_view and no edit for N days (default 90); consolidation by a hidden skills-only session (cheapest model); every change is verified against the files before it is reported** — archive, never delete.
- **Curator starts its clock the first time it ticks instead of running at once, then runs every 7 days while Pheme is open** — a fresh library has nothing to merge, and the run costs Copilot requests. "Run curator now" is on the Skills page.
- **Ctrl+K shows chats, pages, chat actions, settings toggles, themes and skills** — one action, one home: each command calls the same function as the visible button.
- **Real-Copilot check of reviews and curator (3 requests, seeded transcript, model "auto")** — all worked. The skill review put a user preference ("beginner") in a skill description, so the prompt now says user facts belong in memory only. Not re-run against real Copilot after that one-line change.
- **Stress-test fixes (round 1)** — malformed JSON now 400 and oversized body 413 (were 500); invalid chat ids are 404 (were 500); deleting a chat mid-turn no longer recreates its files; settings are range-checked (counts 1..1000, limits 100..100000, days 1..3650, strings <= 200 chars) — before, `0` or `-3` made reviews run on every turn; memory entries cannot contain `§`; a data file that is valid JSON of the wrong shape (e.g. `{}` for a list) falls back to defaults instead of crashing `/api/agents`; a torn last transcript line no longer swallows the next event; hidden (review/agent) chats cannot be sent messages.
- **At most 8 engine sessions stay open; a failed turn drops its session; deleting a chat closes it** — real Copilot sessions are processes/streams; they were kept until exit. An evicted chat resumes on its next message.
- **Long chats render the last 400 events (button loads earlier); sidebar shows 150 chats (search still finds all)** — a 6,000-event chat was 36,000 DOM nodes.
- **One Pheme per data folder (`pheme.lock` with the pid)** — two instances would both run scheduled jobs and reviews. A stale lock from a crash is replaced. `--port` is validated with a plain message.
- UI stress round: chat titles now strip markdown (titleFrom); sending your own message always scrolls to bottom; drafts flush on chat switch; offline detection is immediate on a refused connection and polls every 1.2 s while down; mobile drawer closes on Esc and manages focus; PHEME_TOKEN env var fixes the access key for tests.
- Markdown renderer is react-markdown + remark-gfm + highlight.js (20 languages); bundle grew to ~725 kB JS (accepted).
