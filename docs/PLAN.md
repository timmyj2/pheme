# Pheme — build plan (source of truth)

Pheme is a local web app that gives a Hermes-style agent experience on top of
**GitHub Copilot CLI**. It runs on a locked-down Windows work laptop where only
Copilot CLI, Node, Python, Git and VS Code are available. It is built and tested
at home on a Mac, then copied to the work laptop as one ready-to-run file.

Every decision below was agreed with the owner (timmyj2). Do not change one
without asking. Small implementation choices not covered here: make the call,
then log it in `docs/DECISIONS.md` (one line: decision + why).

## 1. Agreed decisions

| Area | Decision |
|---|---|
| Repo | Public `timmyj2/pheme`. Commits as `timmyj2` with the GitHub no-reply email. |
| License | MIT, copyright `timmyj2`. Reused code keeps its original MIT notice (see `THIRD_PARTY_NOTICES.md`). |
| Reuse | IT approved reusing the Hermes desktop interface code (MIT). **Option 1:** copy selected pieces (theme tokens and styles, chat transcript, composer, sidebar session list, Ctrl+K palette) into a small new app. Mirror the source folder layout so more can be pulled in later. **Updated 2026-11-28:** hybrid port of the Hermes webapp, see `docs/DECISIONS.md` and `docs/VISUAL-GOAL.md`. |
| Branding | The app says **Pheme** in the title bar with a simple original icon. No Hermes or Nous name, wordmark, logo or artwork in the app UI. |
| Who builds | Hermes (the agent) writes and tests the code at home; the owner reviews. |
| Engine | GitHub Copilot CLI only, driven through the GitHub Copilot SDK. No other model providers. |
| Stack | Node + TypeScript + React everywhere. |
| Delivery | One ready-to-run file (`dist/pheme.mjs`) plus `start-pheme.cmd`. No `npm install` needed on the work laptop. |
| Testing at home | Copilot CLI installed on the Mac, owner's Copilot Free plan. A **fake Copilot mode** covers most tests so the Free quota lasts. Real Copilot is used only for final checks, after the owner signs in. |
| Windows | GitHub Actions runs tests and the build on `windows-latest` and `macos-latest` on every push. |
| Work laptop checks | `pheme doctor` command checks Node version, Copilot CLI presence/version/sign-in, network to GitHub, data folder write access, and which models the org allows. |
| Data | All app data in `%USERPROFILE%\.pheme` (`~/.pheme` on Mac). Never inside the repo folder. Skills live in Pheme's own folder, not Copilot's. |
| Safety | Reads auto-allowed. Shell commands and file edits show an approval card (Allow once / Allow for this chat / Deny). Settings has an **Auto-approve all** switch (off by default). Server binds to `127.0.0.1` only, with a per-launch random token required on API calls. |
| Copilot usage | Background reviews use the cheapest included model by default, selectable in Settings. Usage counter in the UI. Switch to turn the learning loops off. |
| Defaults (changeable in Settings) | Chat model: Copilot `auto`. Skill review after a turn with 10+ tool steps. Memory review every 10 user messages. Memory limit 2,200 chars, user profile limit 1,375 chars. |
| Pages | Chat, sidebar chat list (search, pin, archive), Skills, Memory, Scheduled jobs, Agents, Settings (model, theme, permissions, loops), Ctrl+K palette. |
| Dropped | Messaging/bots, webhooks, profiles, artifacts, Starmap, voice, other providers, plugin/MCP manager (Copilot CLI manages its own MCP), built-in terminal. |
| Scheduled jobs | Run only while Pheme is open. On start, each missed job runs once. A job cannot run commands or edit files unless that was allowed when it was created. |
| Themes (v3) | All Hermes desktop themes, Nous-branded ones renamed. |

## 2. Milestones

### v1 (current goal)
1. Scaffold: npm workspace, TypeScript, lint, `node --test`/vitest, CI on Windows + macOS, `npm run build` producing `dist/pheme.mjs`.
2. Engine layer: Copilot SDK client wrapper behind an `Engine` interface, plus `FakeEngine` (scripted responses, tool calls, streaming) used by tests and `--fake` mode.
3. Server: local HTTP + SSE/WebSocket API on 127.0.0.1, token auth, session store (JSON/JSONL files under the data folder).
4. UI: reused theme tokens, chat transcript with streaming and tool rows, composer, sidebar chat list (new, search, pin, archive), approval cards, Settings basics.
5. Memory: `memory` tool (add/replace/remove, two stores with char limits), injected into the system message each session; Memory page to view/edit.
6. Skills: `skill_view` / `skill_manage` tools, skills index in the system message, Skills page.
7. Learning loops: background skill review and memory review in a hidden session, with the triggers above; results shown as a small notice in the chat.
8. `pheme doctor`, `start-pheme.cmd`, README quick start for the work laptop.
9. **End-to-end proof (fake mode):** a chat with 10+ tool steps triggers a skill review that saves a skill; a new chat lists and uses that skill. Automated test plus a short written check in `PROGRESS.md`.

### v2
Subagents (Copilot sub-agents/custom agents + parallel SDK sessions shown as cards on the Agents page); Scheduled jobs page and scheduler.

### v3
All themes, icon, polish, Ctrl+K completeness, curator (periodic skill consolidation: archive, never delete).

## 3. Architecture

```
Browser (React UI)  <-- HTTP/SSE, token -->  Pheme server (Node, 127.0.0.1)
                                               |-- Engine: CopilotEngine (SDK -> Copilot CLI) | FakeEngine
                                               |-- Tools: memory, skill_view, skill_manage, (v2) cron, agents
                                               |-- Loops: review scheduler (hidden sessions)
                                               '-- Store: ~/.pheme/{sessions,skills,memory,settings.json}
```

- The SDK session gets: system message **Append** (persona + memory block + skills index), custom tools, a permission handler (feeds approval cards), pre/post-tool hooks (count tool steps for review triggers).
- If the SDK cannot be bundled or npm is unavailable, fall back to driving `copilot --acp --stdio` with hand-written JSON-RPC (Node standard library only). Keep this behind the same `Engine` interface.

## 4. Verify before designing (Copilot SDK / CLI)

Check the installed versions first; docs can be ahead of or behind them.
- Package name and API of the Node SDK (`@github/copilot-sdk`): session create/resume, streaming events, custom tools, system message modes, permission handler, hooks, model list.
- Whether the SDK needs a separate `copilot` binary on PATH or brings its own; how it finds it on Windows.
- Whether the SDK bundles cleanly with esbuild into one file.
- Whether custom skill directories can be passed, or whether Pheme injects skills itself (decided: Pheme's own folder either way).
Record findings in `docs/DECISIONS.md`.

## 5. Reuse map (source on the build Mac)

Hermes source: `~/.hermes/hermes-agent/apps/desktop` (MIT, Copyright (c) 2025 Nous Research).
- `DESIGN.md` — principles: flat not boxed, tokens not literals, one primitive per concern, chat is home, overlays for short tasks.
- `src/styles.css`, `src/themes/presets.ts` — tokens and themes.
- `src/app/chat/**`, `src/components/**` — transcript, composer, tool rows, approval card stack, palette.
- `src/i18n/en.ts` — labels (grep one top-level key at a time; the file is large).
- `@nous-research/ui` (npm) is NOT used: it ships the foundry fonts Collapse, Rules, Mondwest and NeueBit.

Porting rules (2026-11-28):
- Copying Hermes code is allowed under MIT. Pinned upstream commit: `5688461d66fadd3ce3d6ed6bccccd958c7370eae`.
- Each copied file starts with `// Adapted from hermes-agent (MIT, Copyright (c) 2025 Nous Research), apps/desktop/src/<path> @ 5688461d`.
- Never copy names ("Hermes", "Nous"), logos, the brand mark, artwork, backgrounds, app icons or the four foundry fonts. Keep the MIT notice.
- Do not copy gateway/transport code; Pheme has its own small API.

Learning-loop behaviour to reproduce (from `agent/background_review.py`, `agent/turn_context.py`, `agent/curator.py`): reviews run in a forked hidden session given the recent transcript; the skill review is **active** (most sessions produce at least a small update), prefers patching an existing skill over creating a new one, writes class-level skills (procedure first, pitfalls as rule + why, no incident narration), never saves environment-specific failures or negative claims about tools; the memory review saves only facts grounded in the conversation, one fact in one store (user profile vs environment). Write Pheme's prompts in its own words.

## 6. Working rules for the build

- Commit and push after each finished step; keep CI green. Update `PROGRESS.md` (done / in progress / next / blockers) every push.
- Use subagents (delegate_task, Sonnet) for independent pieces — e.g. a UI component and its tests while the engine layer is built — then review and integrate their output yourself.
- Never commit secrets, tokens, real chat data or anything from the work environment.
- Stop and wait for the owner if a decision would change this plan, or a step needs their login (e.g. Copilot sign-in).
