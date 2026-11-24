# Visual goal: the frame, not a paint job

The bar is a side-by-side of the three Hermes desktop screenshots where the **frame** matches and only the content differs. A stranger should not say "that's a different app" before they read a word.

The screenshots are the source of truth. Hermes source may be read for measurements (it is public and MIT). Do not copy its code, assets, logo, or name. Pheme stays Pheme.

## Done when

Shot against the same three states (session shell, settings, composer with attachments and a right-hand panel), fake engine, throwaway data, system Chrome, about 1440×900:

1. **Session shell.** A tab strip across the top, gold underline on the open chat. A left rail with icon rows, gold small-caps section labels, and session rows that show a title, a muted second line, and a relative time. A thin status bar along the bottom. The composer is one rounded box with a gold focus ring, cards inside it, the model control in the box, and a circular send button.
2. **Settings.** A left list of the sections that already exist, and the controls on the right. Not a scrolling form with no map.
3. **Right panel.** The Changes panel reads as a calm side panel (gold small-caps header, list, then actions), not a stack of browser forms that hide the files.

Light theme, the 390px drawer, focus rings, and the skip link still work. No new product features (no Bots page, no home-directory browser, no wallpaper, no reasoning menu). Those stay out until someone asks for the feature, not the look.

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

The owner then asked for the features this list had held back. Added on `feat/shell-features`: a read-only file list (names only, cannot leave the project folder or the home folder), drag-to-reorder on the tab strip, and an original CSS gradient behind the chat (off in Settings). None of these copy Hermes assets.
