# Visual goal: an exact match of the Hermes webapp

Owner decision, 2026-11-28: the goal is now an exact match of the Hermes Agent UI (NousResearch/hermes-agent, the desktop renderer as served in the browser, the "webapp"). A stranger should not say "that's a different app" before they read a word. The older goal below (match the frame, differ in content) is the floor, not the target.

## Source of truth

Five screenshots of the Hermes webapp are in `docs/visual/hermes-reference/`: `chat.webp`, `chat-row-hover.webp`, `capabilities.webp`, `settings.webp` and `right-panel-files.png`. They are the visual source of truth. The older Pheme comparison shots in `docs/visual/` are not.

## What may be copied

- **Code is allowed.** Hermes is MIT. Components, styles, tokens, hooks and layout may be ported. The pinned upstream commit is `5688461d66fadd3ce3d6ed6bccccd958c7370eae`.
- Every copied file starts with this header: `// Adapted from hermes-agent (MIT, Copyright (c) 2025 Nous Research), apps/desktop/src/<path> @ 5688461d`.
- Approach: a hybrid port. Tailwind v4, the Hermes token layer, ported `components/ui` primitives, and ported chat and shell components rewired onto Pheme's `blocks.ts` and SSE. No assistant-ui, nanostores or react-query.

## What must not be copied

- Identity: the names "Hermes", "Hermes Agent" and "Nous Research", Nous Portal links, logos, the brand mark, artwork, backgrounds, sprites and app icons. Pheme stays Pheme.
- Fonts: Collapse, Rules, Mondwest and NeueBit. They are foundry fonts, not Nous's to relicense. The UI uses system fonts. JetBrains Mono (SIL OFL 1.1) is bundled and served by Pheme for code.
- Gateway and transport code. Pheme has its own small API.

## Stub or skip

Build only UI the Copilot CLI backend can support. Hermes pages that need a backend Copilot does not have are skipped. Copilot-dependent UI (reasoning, intent, todos, progress, effort pill) is feature-detected and hidden when its event never arrives.

## Older goal (2026-11-23), kept for the checklist

The bar was a side-by-side of the three Hermes desktop screenshots where the **frame** matches and only the content differs.

## Done when

Shot against the same three states (session shell, settings, composer with attachments and a right-hand panel), fake engine, throwaway data, system Chrome, about 1440×900:

1. **Session shell.** A tab strip across the top, gold underline on the open chat. A left rail with icon rows, gold small-caps section labels, and session rows that show a title, a muted second line, and a relative time. A thin status bar along the bottom. The composer is one rounded box with a gold focus ring, cards inside it, the model control in the box, and a circular send button.
2. **Settings.** A left list of the sections that already exist, and the controls on the right. Not a scrolling form with no map.
3. **Right panel.** The Changes panel reads as a calm side panel (gold small-caps header, list, then actions), not a stack of browser forms that hide the files.

Light theme, the 390px drawer, focus rings, and the skip link still work. Features follow the stub-or-skip rule above, not the old "no new features" rule.

## This pass

- Tab strip of existing chats (click opens the chat; it does not split the window).
- Status bar from data the app already has (connection, engine, version).
- Session rows: model, message count, relative time.
- Line icons on the existing page rows.
- Model control moved into the composer box.
- Settings section list beside the existing panels.
- Changes header in the same small-caps accent as the section labels.

## Not this pass

Bots page, profile pills, a two-column settings app with providers and billing, or a copied background image.

The owner then asked for the features this list had held back. Added on `feat/shell-features`: a read-only file list (names only, cannot leave the project folder or the home folder), drag-to-reorder on the tab strip, and an original CSS gradient behind the chat (off in Settings). None of these copy Hermes artwork.
