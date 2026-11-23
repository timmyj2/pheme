# Work queue (agreed order)

Rules for every item: fake mode only (no Copilot quota), work on a branch `feat/<name>`, typecheck + lint + tests + smoke + stress
green before merging, one line in `docs/DECISIONS.md`, update `PROGRESS.md`. Real-Copilot checks wait for the owner.

## A. Safe to do unattended
1. Per-chat project folder. Today the working directory is one global value (`CopilotEngine` constructor); make it a chat setting
   passed to the engine on session create, with a folder picker and validation (must exist, must be a directory).
2. Git Changes view (read-only): branch, changed files, per-file diff, +/- counts. Server runs `git` with a fixed argument list
   (never a shell string), 5 s timeout, output size cap. Tested against a throwaway repo.
3. Git commit: stage chosen files, commit message box, "draft message" via the chat engine, approval card per commit, never on
   `main` without creating a branch first, flag `.env` and key-looking files, "Undo last commit" (soft reset).
4. Push and PR: `gh pr create` with editable title/body, approval card, link and CI status afterwards; fall back to the GitHub
   compare URL when `gh` is missing. No force-push.
5. Composer model pill and context-usage readout.
6. Export chat to Markdown; search inside message text.
7. Desktop notifications (turn done, approval needed) behind a setting.
8. Backup and restore of the data folder (zip), with a restore preview.
9. Lazy-load markdown/highlight code to cut first-load size.
10. Playwright smoke test in CI (focus order, drawer, two tabs, scroll-follow).
11. Settings search; customizable keybindings.

## B. Needs the owner
- Pin Copilot CLI vs build an ACP engine (SDK protocol 3 vs CLI protocol 4).
- Real-Copilot checks: Stop, approvals, queue, long stream, attachments support.
- Windows run on the work computer.
- Cut v0.2.0 and replace the hand-uploaded zip with a CI-built one.
- Whether to turn on branch protection and PR-only merges.


## Current goal (set 2026-11-23, after v0.2.0)
Build all six, stress test each as it lands, fix any bug the stress tests find, merge to main when CI is green on Windows and macOS. The owner has pre-approved fixes and merges. Real Copilot runs still cost the owner's Free quota: keep to 2-3 short requests, otherwise use --fake and a fake gh.

1. PR panel: PR status, each CI check, review state, mergeability; refreshes while checks run.
2. Branch switcher and stash: list/create/switch branches; stash and restore work; never lose changes.
3. Attach files and images to a message (SDK `attachments`: file and blob).
4. Prompt library: saved prompts, optionally per project; insert from the composer and palette.
5. Context meter from the SDK `session.usage_info` event (currentTokens / tokenLimit).
6. Installable app (PWA): manifest and icons; no caching of the app shell or API.
Rule for every push: `npm run lint && npm run typecheck && npm test` first (CI lints scripts/ and e2e/ too).
