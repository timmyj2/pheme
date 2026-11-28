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

## v2

| Step | Status |
|---|---|
| Scheduled jobs: scheduler, API, page | ✅ Done (6 tests, checked in a browser) |
| Subagents: `agent` tool (parallel sessions, max 3 at once) + saved agent profiles passed to Copilot as custom agents + Agents page and inline cards | ✅ Done (10 tests, checked in a browser, and verified with real Copilot) |

## v3

| Step | Status |
|---|---|
| All themes (11, Nous-branded ones renamed) with theme + mode pickers | ✅ Done (checked in a browser) |
| Ctrl+K completeness (pages, chat actions, settings toggles, every theme, every skill, every chat) | ✅ Done |
| Skill curator (merge overlaps, archive unused, never delete; scheduled + run-now) | ✅ Done (4 tests, and verified with real Copilot) |
| Icon | ✅ Done in v1 |

## Stress test (macOS, fake engine)

`npm run stress` (also in CI) runs 20 probes against the built file: 40 concurrent chats, 60 SSE clients, malformed/oversized/odd input, delete-while-busy, approval races, rapid stop/send, 5,000-event transcripts, hostile skill/job/memory input, auth bypass attempts, corrupt data files, restarts. First run: 12/20 passed. All bugs found were fixed; now 20/20. Also checked by hand: 2,000 chats in the list (70 ms), a 6,000-event chat in the browser, port fallback, Ctrl+C with a pending approval.

## Blockers / needs owner

1. **SDK vs. Copilot CLI version skew: resolved by pinning** (owner chose option a). Both laptops need `npm i -g @github/copilot@1.0.112`; `pheme doctor` explains it if the CLI is newer. Watch for CLI auto-updates.
2. ~~Real-Copilot test~~ Done on the Mac (gh login): custom `memory` tool, streaming reply, and a shell approval card all work. Read-only commands such as `echo` are auto-allowed by the CLI itself.

## End-to-end proof (fake mode)

Automated: `packages/server/test/e2e.test.ts`. A chat with 12 tool steps triggers a skill review in a hidden session (skill tools only, shell denied); it creates a skill file under the data folder; a second chat's system message lists the skill and the chat loads it with `skill_view`. Also run by `npm run smoke` against the built `dist/pheme.mjs` copied alone into an empty folder, and by hand in a browser (approval card, 11 tool rows, "Skill review: skill ... create" notice, Skills page showing the new skill).

## Log

- Repo created with plan, license and notices.
- Owner chose to pin the CLI at 1.0.112; doctor now treats an empty model list as a warning.
- Real Copilot check passed; fixed empty tool names on `tool_end` and duplicate approval cards.
- Stress test round 1: fixed 12 bugs (see DECISIONS.md).
- README updated for v2/v3; v0.1.0 released.
- Real Copilot check of learning loops and curator: skill review wrote a good class-level skill from a 10-step transcript; memory review saved two user facts; curator merged two overlapping skills into one, archived both extras and left the unrelated one alone.
- v3: themes, Ctrl+K, curator added (55 tests).
- v2: subagents and Agents page added (both modes). Real Copilot: two parallel `agent` calls returned alpha/beta; a saved `poet` profile was delegated to by the CLI and shown as a Copilot-agent card.
- v2: scheduled jobs added (interval/daily/once; run only while open; missed runs collapse into one; `allowActions` fixed at creation).
- v1 steps 1-9 built; 32 tests, typecheck and lint pass locally on macOS. CI runs on push.

## UI stress round (2026-11-22)
Hermes-style UI pass: markdown, 11 themes with contrast checks, queue-while-busy, history, drafts, reconnect, drawer. 346 tests, stress 20/20, smoke ok.

## Test-everything round (2026-11-22)
Browser-tested pages, keyboard/a11y, two tabs, fresh install, real Copilot (2 requests). Fixed: unsaved-edit guard, page scrollbar, job interval validation, agent name lock, sidebar tab stop/focus, unknown CLI flags, license texts. Release zip v0.1.0 re-uploaded with current build. 354 tests, CI green.

## Git panel (branch feat/git-review, NOT merged to main)
Done and tested (425 tests, smoke, stress, browser runs against throwaway repos): per-chat project folder; Changes panel with diffs;
commit box (pick files, message, new branch on main, secret confirm, undo); push and pull request with confirm steps, CI status on an
open PR, compare-link fallback without gh.
Not tested against real GitHub (would create a real PR): `gh pr create` path was exercised with a fake gh only.
Also done on this branch: per-chat model picker, export chat to Markdown, search inside message text.
Next (docs/NEXT.md items 7-11): desktop notifications, backup/restore, lazy-load markdown code, Playwright smoke test in CI, settings search and keybindings. Context-usage readout was skipped: the Copilot SDK events I have not verified expose token counts.

## v0.2.0 (branch feat/polish)
Added since v0.1.0: Git panel (project folder, changes, commit, undo, push, PR), per-chat model, export, message search, notifications, backup/restore, keybindings, settings search, lazy-loaded markdown, Playwright e2e in CI, CI-built releases.
Not done: context-usage meter (unverified SDK support). Not tested against real GitHub: PR creation. Windows: CI only.

## Six-item goal (branch feat/git-workflow, merged when CI is green)
1. PR panel: checks (failing first), review state, mergeability, 20 s refresh while checks run.
2. Branch switcher and stash (create, switch, set aside, restore, delete), with confirm steps and rollback.
3. Attachments: images and text files, validated by content, secrets refused, safe download, swept after 24 h.
4. Prompt library: page, `/` and 📋 picker, {{blanks}}, per-project prompts, save-from-composer.
5. Context meter from the SDK usage event (once per turn).
6. Installable app: manifest, PNG icons, remembered access key, no service worker.
Stress found and fixed along the way: parallel commits (500), search bursts, stash left untracked files (literal pathspecs), NUL in a branch name, PR detail without a remote (502), `.env` slipping past the attachment check, attachments cached by the browser, world-readable attachment folders.
Still not verified: real GitHub PR creation and checks (fake gh only), real Copilot image/file attachments (the SDK mapping is unit-tested; a real send costs quota), Windows UI on a real work PC (CI only), the install prompt on a real desktop (Chrome's installability check passes).

## v0.3.0 (2026-11-23)
Adds the six-item goal above (PR panel, branches and stash, attachments, prompt library, context meter, installable app) plus the text-attachment fix: a real-Copilot test showed images work but text files sent by path never reached the model, so text now goes inside the message.
Verified: `npm run verify -- --e2e` (626 unit tests, build, smoke, stress 20/20, scale stress, 13 browser tests). Real Copilot: images and chat yes; text-file fix covered by fake-engine tests only.
Open, in priority order:
1. Visual frame is closer to the light desktop screenshots: Sessions | Agents in the left rail, no right-hand file panel, folder control in the rail (a 28px icon in the top bar when the rail is hidden), text size control. Still not a copy: no Capabilities, Messaging, Artifacts, Quota, or Profiles, and chats are grouped by day, not by project.
2. Not verified: real GitHub PR creation/checks (fake gh only); Windows UI on a real PC (CI only); text attachments on real Copilot.
3. Unconfirmed: scale-stress "1501 chats vs 1502" (probably script off-by-one); 56 SSE connections after rapid chat switching (single probe).

## Hermes UI match, item 1 (2026-11-28)
Docs only. Owner decisions recorded: goal is an exact match of the Hermes webapp, porting Hermes code under MIT is allowed (upstream `5688461d`), identity, brand fonts and artwork are not. Hybrid port approach, stub-or-skip policy, and the real-Copilot probe skipped (Copilot-dependent UI is feature-detected, fake mode only). New queue is at the top of `docs/NEXT.md`. `THIRD_PARTY_NOTICES.md` now names the SHA and carries the JetBrains Mono OFL text and a Codicons line. No code changed.
