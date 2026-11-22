# Progress

## Current milestone: v1

| Step | Status |
|---|---|
| 0. Repo, plan, notices | ✅ Done |
| 1. Scaffold + CI (Windows/macOS) + single-file build | ✅ Done (CI result: see Log) |
| 2. Engine layer (Copilot SDK + fake mode) | ✅ Done; real Copilot untested (see blockers) |
| 3. Local server, token auth, session store | ✅ Done |
| 4. UI: theme, chat, composer, sidebar, approvals, settings | ✅ Done (checked in a browser against the fake engine) |
| 5. Memory tool + page | ✅ Done |
| 6. Skills tools + page | ✅ Done |
| 7. Learning loops (skill + memory review) | ✅ Done |
| 8. `pheme doctor`, `start-pheme.cmd`, work-laptop quick start | ✅ Done (doctor runs; sign-in check blocked by SDK/CLI skew) |
| 9. End-to-end proof in fake mode | ✅ Done (see below) |

## Blockers / needs owner

1. **SDK vs. Copilot CLI version skew: resolved by pinning** (owner chose option a). Both laptops need `npm i -g @github/copilot@1.0.112`; `pheme doctor` explains it if the CLI is newer. Watch for CLI auto-updates.
2. ~~Real-Copilot test~~ Done on the Mac (gh login): custom `memory` tool, streaming reply, and a shell approval card all work. Read-only commands such as `echo` are auto-allowed by the CLI itself.

## End-to-end proof (fake mode)

Automated: `packages/server/test/e2e.test.ts`. A chat with 12 tool steps triggers a skill review in a hidden session (skill tools only, shell denied); it creates a skill file under the data folder; a second chat's system message lists the skill and the chat loads it with `skill_view`. Also run by `npm run smoke` against the built `dist/pheme.mjs` copied alone into an empty folder, and by hand in a browser (approval card, 11 tool rows, "Skill review: skill ... create" notice, Skills page showing the new skill).

## Log

- Repo created with plan, license and notices.
- Owner chose to pin the CLI at 1.0.112; doctor now treats an empty model list as a warning.
- Real Copilot check passed; fixed empty tool names on `tool_end` and duplicate approval cards.
- v1 steps 1-9 built; 32 tests, typecheck and lint pass locally on macOS. CI runs on push.
