# Pheme vs Hermes desktop: final parity list

Status 2026-11-28, after build-plan item 15 (motion audit, accessibility pass, final gate). Goal: `docs/VISUAL-GOAL.md`.

## What matches

- **Tokens and type:** the Hermes token chain (`packages/ui/src/tokens.css`), the gold-on-navy default theme, JetBrains Mono bundled and served by Pheme, 13px body, 1.5 line height, radius scalar 0.2. Checked by `e2e/tokens.spec.ts` and `packages/ui/test/tokens.test.ts`.
- **Shell:** 28px tab strip, 237px left rail, 20px status bar, 390px drawer (no horizontal overflow when open or closed, `e2e/smoke.spec.ts`), skip link, focus rings on every control.
- **Transcript:** sticky user line, centred column, scroll-follow, jump-to-bottom pill (no approval wording; approvals dock above the composer).
- **Tool rows, run ticker, diffs, approval card stack** (Run, Reject, Allow this session).
- **Composer and status stack,** including the reasoning-effort pill when the model reports efforts.
- **Motion:** control colour fades 100 ms with instant hover; enter slide 180 ms; ticker 240 ms; height and drawer moves 0.22 s; working square pulse 400 ms every 5 s; tooltip exit 100 ms.
- **Accessibility:** scaffold text at 0.7 opacity (the README floor, raised from 0.67); the working line is `role="status"` with `aria-live="polite"`; one reduced-motion kill switch (`tokens.css`); loops pause while the window is hidden (`data-renderer-animations-paused`, set in `main.tsx`).
- **Screenshot comparison:** `npm run visual` writes side-by-side captures for chat, capabilities, settings and right panel. Reviewed by eye. The harness has no pixel threshold, so this is not a pixel-exact claim.

## Still different

- The left rail and tab strip differ in detail from the reference (session list grouping, rail tabs and icon set). Pheme keeps its own project list.
- Some secondary Hermes styling (12px minimum text rule, card-stack spring parameters) is not ported where Hermes does not show it in the reference shots.

## Deliberate gaps (no Copilot backing)

- Hermes pages that need a Hermes backend: messaging gateways, billing, quota, profiles, Nous Portal, webhooks, starmap, command centre.
- Assistant-ui, nanostores, react-query, the contentEditable editor, voice, branching and checkpoint restore, the Shiki and Streamdown stack, the plugin and contribution registry, the flexible pane-tree layout, glass and vibrancy effects.
- Edit or branch an earlier message; session tiles and split panes; `@` file references and URL references.

## Feature-detected, not confirmed on real Copilot

- Reasoning blocks, intent line, todos, tool progress and the effort pill appear only when the CLI sends the matching event. They are tested in fake mode. The real-Copilot event probe (build-plan item 4) was skipped by the owner, so nothing here is confirmed on real Copilot.
- `session.todos_changed` RPC reads are guarded: a CLI without `rpc.plan`, a synchronous throw, or a read that never settles (3 s timeout) ends the turn normally (`packages/server/test/activity.test.ts`).

## Not verified

- Windows run on a real work computer (CI only).
- Real GitHub PR creation and checks (fake `gh` only).
- Text and image attachments on real Copilot beyond the earlier one-off check.
