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
