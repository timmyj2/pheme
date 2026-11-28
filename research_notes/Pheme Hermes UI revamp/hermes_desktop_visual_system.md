# Hermes desktop app: visual system and app shell inventory (apps/desktop)

Source read: `NousResearch/hermes-agent` main, shallow clone, commit **5688461d66fadd3ce3d6ed6bccccd958c7370eae** (committed Fri Nov 27 2026, "fix(agent): look up git from the repo in @diff context references"). All files were read only. Nothing was installed, built or run.

Citation base used below: `B = https://github.com/NousResearch/hermes-agent/blob/5688461d66fadd3ce3d6ed6bccccd958c7370eae/apps/desktop`. Every "[file](B/...)" link resolves against that commit. Root repo license: MIT, "Copyright (c) 2025 Nous Research" ([LICENSE](https://github.com/NousResearch/hermes-agent/blob/5688461d66fadd3ce3d6ed6bccccd958c7370eae/LICENSE)).

The desktop app ships its own design contract, `apps/desktop/DESIGN.md`. It is the best single document to read first ([DESIGN.md](B/DESIGN.md)).

## 1. Tech stack (framework, bundler, Tailwind, component libraries, state, animation, icons)

### Takeaway
Electron 44 with React 19.3 and the React Compiler, bundled by Vite 8. Styling is Tailwind CSS v4.3.3 configured in CSS only (`@theme inline` in `src/styles.css`, no tailwind.config). Components are shadcn "new-york" on the `radix-ui` monorepo package, with assistant-ui for chat. State is nanostores plus TanStack Query. Motion is mostly hand-written CSS keyframes, with `motion` v12 in a few components. Icons are Tabler by default, Codicons for chrome and the titlebar.

### Cited Findings
- Package `hermes`, productName "Hermes", `"type": "module"`, main `dist/electron-main.mjs`, engines node >=26. pnpm only: the npm field says "npm is refused here: run pnpm install --frozen-lockfile at the repository root". — [package.json](B/package.json)
- Runtime UI deps, exact pins: `react` 19.3.0, `react-dom` 19.3.0, `react-router` 8.4.0, `radix-ui` 1.7.0, `tailwindcss` 4.3.3, `@tailwindcss/vite` 4.3.3, `@tailwindcss/typography` 0.5.20, `tw-shimmer` 0.4.13, `class-variance-authority` 0.7.1, `clsx` 2.1.1, `tailwind-merge` 3.7.0, `cmdk` 1.1.1, `motion` 12.43.0, `nanostores` 1.4.2, `@nanostores/react` 1.1.0, `@tanstack/react-query` 5.104.1, `@tanstack/react-virtual` 3.14.14, `@tabler/icons-react` 3.49.0, `@vscode/codicons` 0.0.45, `lucide-react` 0.577.0, `@icons-pack/react-simple-icons` 13.15.1, `@nous-research/ui` 0.19.1, `@dnd-kit/core` 6.3.1, `@dnd-kit/sortable` 10.0.0, `@dnd-kit/utilities` 3.2.2, `unicode-animations` 1.0.3, `use-stick-to-bottom` 1.1.6, `driver.js` 1.9.0, `frimousse` 0.4.0 (emoji picker), `web-haptics` 0.0.6, `blobatar` 2.7.0. — [package.json](B/package.json)
- Chat and content deps: `@assistant-ui/react` 0.14.29, `@assistant-ui/core` 0.2.23, `@assistant-ui/react-streamdown` 0.3.7, `streamdown` 2.7.0, `@streamdown/code` 1.1.1, `@streamdown/math` 1.0.3, `shiki` 4.5.0, `react-shiki` 0.11.2, `katex` 0.19.0, the CodeMirror 6 set (`@codemirror/view` 6.43.14 and others), `@xterm/xterm` 6.0.0 with addons, `react-arborist` 3.16.0 (file tree). — [package.json](B/package.json)
- Dev and build: `vite` 8.3.4, `@vitejs/plugin-react` 6.0.3, `babel-plugin-react-compiler` 1.0.0, `@rolldown/plugin-babel` 0.2.4, `typescript` 6.0.3, `electron` 44.10.2, `electron-builder` 27.0.0-alpha.6, `vitest` 4.1.12, `@playwright/test` 1.64.0, `prettier` 3.9.9, `esbuild` 0.28.2. Dev renderer runs `vite --host 127.0.0.1 --port 5174`. — [package.json](B/package.json)
- shadcn config: `"style": "new-york"`, `rsc: false`, `tsx: true`, `tailwind.config: ""` (CSS-first v4), `css: "src/styles.css"`, `baseColor: "neutral"`, `cssVariables: true`, aliases `@/components`, `@/lib/utils`, `@/components/ui`, `@/lib`, `@/hooks`, `"iconLibrary": "tabler"`. — [components.json](B/components.json)
- `styles.css` opens with `@import 'tailwindcss'; @plugin '@tailwindcss/typography'; @import 'tw-shimmer'; @import 'katex/dist/katex.min.css'; @import '@vscode/codicons/dist/codicon.css';`. It redefines `@custom-variant hover (&:hover)` (because v4 gates hover behind `@media (hover: hover)`, which fails on some Windows digitizer hosts), `@custom-variant dark (&:is(.dark *))`, and `@custom-variant compact (@media (max-height: 768px))`. — [src/styles.css](B/src/styles.css)
- Icon policy: "Tabler is the default component/chrome set", imported only through the curated aliases in `src/lib/icons.ts`. "Codicon is the compact editor/tool/status vocabulary" via `src/components/ui/codicon.tsx`. "Do not introduce a third icon set." — [DESIGN.md](B/DESIGN.md)
- `src/lib/icons.ts` re-exports Tabler icons under Lucide-style names (for example `IconLoader2 as Loader2`, `IconAlertCircle as AlertCircle`) and defines `iconSize = { xs: 'size-3' /*12px*/, sm: 'size-3.5' /*14px*/, md: 'size-4' /*16px*/, lg: 'size-5' /*20px*/, xl: 'size-6' /*24px*/ }`. — [src/lib/icons.ts](B/src/lib/icons.ts)
- In practice the titlebar tools, sidebar nav rows and session-row leads all render Codicons, for example nav: `robot` (New session), `symbol-misc` (Capabilities), `comment` (Messaging), `files` (Artifacts), `watch` (Cron). Titlebar: `layout-sidebar-left`, `arrow-swap`, `layout-sidebar-right`, `settings-gear`, `comment-discussion`, `layout`. — [src/app/chat/sidebar/index.tsx](B/src/app/chat/sidebar/index.tsx); [src/app/shell/titlebar-controls.tsx](B/src/app/shell/titlebar-controls.tsx)
- State rules: "Shared/cross-component state → small nanostores, not prop-drilling", components subscribe with `useStore`, actions read `$atom.get()`. — [DESIGN.md](B/DESIGN.md)
- `motion` is imported in only six files: `app/chat/scroll-to-bottom-button.tsx`, `app/right-sidebar/review/file-tree.tsx`, `components/assistant-ui/tool/approval.tsx`, `components/assistant-ui/tool/fallback.tsx`, `components/ui/card-stack.tsx` and `components/ui/diff-count.tsx` (grep of `from 'motion`). — [src/components/ui/card-stack.tsx](B/src/components/ui/card-stack.tsx)
- The app root is a contribution registry: "panes, titlebar/statusbar items, keybinds, palette commands, routes, and themes all register through the contribution registry (src/contrib) — core surfaces use the same calls plugins do." — [src/app/index.tsx](B/src/app/index.tsx)
- Routes: index and `:sessionId` render the chat. `capabilities`, `messaging` and `artifacts` are full pages. `agents`, `command-center`, `cron`, `profiles`, `settings`, `starmap` and `webhooks` render `null` in the route tree and appear as overlays. — [src/app/contrib/surfaces.tsx](B/src/app/contrib/surfaces.tsx)

### Inferences
- Primitives (`dialog.tsx`, `popover.tsx`, `menu.ts`) use the shadcn/tw-animate class names (`data-[state=open]:animate-in fade-in-0 zoom-in-95`, `slide-in-from-top-1`). `tw-animate-css` 1.4.0 appears in the lockfile only as a dependency of `@nous-research/ui`, and the desktop `styles.css` does not import it. Those enter/exit classes are therefore probably inert in the desktop build, so menus and dialogs appear without a zoom. I did not build the app, so treat this as unverified. To match exactly, either omit tw-animate-css or check a running Hermes. — [src/components/ui/menu.ts](B/src/components/ui/menu.ts); [pnpm-lock.yaml](https://github.com/NousResearch/hermes-agent/blob/5688461d66fadd3ce3d6ed6bccccd958c7370eae/pnpm-lock.yaml)
- Codicons are the visible chrome vocabulary, so a pixel match needs `@vscode/codicons` more than Tabler.

### Gaps
- I did not read `vite.config.ts` in detail (aliases and plugin order). The React Compiler is in devDeps, but I did not confirm how it is wired.

## 2. Design tokens (`--dt-*`, `--ui-*`, `--theme-*`, presets, radii, shadows, strokes, spacing, z-layers)

### Takeaway
Tokens form a four-layer chain. (1) A theme preset's flat color slots are written by `applyTheme()` as `--theme-*` seeds plus a few direct `--dt-*` values. (2) `styles.css` derives `--ui-*` surfaces, fills, strokes and text alphas with `color-mix(in srgb, …)`. (3) The `--dt-*` shadcn-shaped tokens point at `--ui-*`. (4) Tailwind's `@theme inline` maps `--color-*` to `--dt-*`. The default skin is `nous` (GitHub chrome with Nous blue `#0053fd`). `radius-scalar` is pinned at 0.2, so radii are tiny: `rounded-md` is 2px and text buttons are 2.5px.

### Cited Findings
**Tailwind `@theme inline` mapping** ([src/styles.css](B/src/styles.css))
- `--color-{background,foreground,card,card-foreground,muted,muted-foreground,popover,popover-foreground,primary,primary-foreground,secondary,secondary-foreground,accent,accent-foreground,border,input,ring,destructive,destructive-foreground,midground,midground-foreground}: var(--dt-…)`. `--font-sans: var(--dt-font-sans)`, `--font-mono: var(--dt-font-mono)`, `--spacing-mul: var(--dt-spacing-mul, 1)`. Sidebar colors map to `--sidebar*`.
- Radii: `--radius-xs: calc(var(--radius-scalar) * 0.125rem)`, `--radius-sm: … * 0.5rem`, `--radius-md: … * 0.625rem`, `--radius-lg: … * 0.75rem`, `--radius-xl: … * 1rem`, `--radius-2xl: … * 1.5rem`, `--radius-3xl: … * 2rem`, `--radius-4xl: … * 2.5rem`. `:root` sets `--radius: 0.75rem` and `--radius-scalar: 0.2`, with this comment: "Effective value everywhere … Pinned to the value the app actually renders at." Even `rounded-full` is rescaled: `[class*='rounded-full'] { border-radius: calc(var(--radius-scalar) * 9999rem); }`.
- Shadows:
  - `--shadow-xs: 0 0.0625rem 0.125rem color-mix(in srgb, #000 5%, transparent)`
  - `--shadow-sm: 0 0 0 0.0625rem color-mix(in srgb, var(--dt-foreground) 6%, transparent), 0 0.125rem 0.5rem color-mix(in srgb, #000 4%, transparent)`
  - `--shadow-md: 0 0 0 0.0625rem color-mix(in srgb, var(--dt-foreground) 8%, transparent), 0 0.25rem 1rem color-mix(in srgb, #000 8%, transparent), 0 1rem 2rem -1.5rem color-mix(in srgb, #000 18%, transparent)`
  - `--shadow-nous: 0 0.125rem 0.25rem -0.125rem color-mix(in srgb, #000 7%, transparent), 0 0.5rem 0.75rem -0.375rem color-mix(in srgb, #000 6%, transparent), 0 1.25rem 1.75rem -0.875rem color-mix(in srgb, #000 6%, transparent), 0 2.25rem 3rem -1.75rem color-mix(in srgb, #000 0%, transparent)`. The source comment calls it a "Soft floating shadow for borderless modals/overlays", downward-weighted with negative spread.
  - `--stroke-nous: color-mix(in srgb, currentColor 3%, transparent)` (overlay hairline)
  - `--shadow-lg: inset 0 0.0625rem 0 color-mix(in srgb, #fff 28%, transparent), 0 0 0 0.0625rem color-mix(in srgb, var(--dt-foreground) 8%, transparent), 0 0.75rem 2rem color-mix(in srgb, #000 12%, transparent)`
  - `--shadow-composer: 0 0.0625rem 0.125rem color-mix(in srgb, #000 5%, transparent)`

**`:root` (light) seeds and knobs** ([src/styles.css](B/src/styles.css))
- Boot fallback seeds (the "nous-alt" values, replaced by `applyTheme` at runtime): `--theme-foreground: #17171a; --theme-primary: #0053fd; --theme-secondary: color-mix(in srgb, #0053fd 7%, #ffffff); --theme-accent-soft: color-mix(in srgb, #0053fd 10%, #ffffff); --theme-midground: #0053fd; --theme-warm: #cf806d; --theme-background-seed: #f8faff; --theme-sidebar-seed: #f3f7ff; --theme-card-seed: #ffffff; --theme-elevated-seed: #ffffff; --theme-bubble-seed: color-mix(in srgb, #0053fd 6%, #ffffff)`.
- Neutrals and mixes, light: `--theme-neutral-chrome: #f3f3f3; --theme-neutral-sidebar: #f3f3f3; --theme-neutral-card: #fcfcfc; --theme-mix-chrome: 92%; --theme-mix-sidebar: 100%; --theme-mix-card: 22%; --theme-mix-elevated: 28%; --theme-mix-bubble: 0%`.
- Accent-mix ladders: fills `primary 16% / secondary 11% / tertiary 8% / quaternary 5% / quinary 3%`. Strokes `primary 24% / secondary 16% / tertiary 10% / quaternary 6%`. `row-hover 4%`, `row-active 8%`, `control-hover 6%`, `control-active 8%`.
- Semantic palette, light: `--ui-red: #cf2d56; --ui-orange: #db704b; --ui-yellow: #c08532; --ui-green: #1f8a65; --ui-cyan: #4c7f8c; --ui-blue: #0053fd; --ui-purple: #9e94d5`. Dark overrides: `--ui-red: #e75e78; --ui-green: #55a583; --ui-cyan: #6f9ba6`.
- Surfaces:
  - `--ui-bg-chrome: color-mix(in srgb, var(--theme-background-seed) var(--theme-mix-chrome), var(--theme-neutral-chrome))`
  - `--ui-bg-sidebar: color-mix(… sidebar-seed mix-sidebar, neutral-sidebar)`
  - `--ui-bg-editor: color-mix(… card-seed mix-card, neutral-card)`
  - `--ui-bg-elevated: color-mix(… elevated-seed mix-elevated, neutral-card)`
  - `--ui-bg-card: color-mix(in srgb, var(--ui-accent) 4%, color-mix(in srgb, var(--ui-base) 4%, transparent))`
  - `--ui-bg-input: #fcfcfc`
- Fill pattern: `--ui-bg-{primary..quinary}: color-mix(in srgb, var(--ui-accent) <ladder%>, color-mix(in srgb, var(--ui-base) {10,7,5,4,3}%, transparent))`. Rows and controls use the same pattern: `--ui-row-hover-background` (4% accent / 3% base), `--ui-row-active-background` (8% / 5%), `--ui-row-open-background: color-mix(in srgb, var(--ui-row-active-background) 28%, transparent)`, `--ui-control-hover-background` (6% / 4%), `--ui-control-active-background` (8% / 5%).
- Text: `--ui-text-primary: color-mix(in srgb, var(--ui-base) 94%, transparent)`, `--ui-text-secondary` 74%, `--ui-text-tertiary` 54%, `--ui-text-quaternary` 36%. Transcript scaffolding: `--conversation-scaffold-text` 64%, `--conversation-scaffold-meta` 44%.
- Strokes: `--ui-stroke-{primary,secondary,tertiary,quaternary}: color-mix(in srgb, var(--ui-accent) {24,16,10,6}%, color-mix(in srgb, var(--ui-base) {10,7,5,3}%, transparent))`. `--ui-sash-hover-border: color-mix(in srgb, var(--ui-accent) 18%, var(--ui-stroke-tertiary))`, `--ui-sash-hover-background: color-mix(in srgb, var(--ui-accent) 6%, transparent)`, `--sidebar-edge-border: color-mix(in srgb, var(--ui-base) 7.5%, transparent)` (12% in dark).
- Surface aliases: `--ui-surface-background: var(--ui-bg-editor)`, `--ui-sidebar-surface-background: var(--ui-bg-sidebar)`, `--ui-chat-surface-background: var(--ui-bg-chrome)`, `--ui-editor-surface-background: var(--ui-bg-chrome)`, `--ui-terminal-surface-background: var(--ui-chat-surface-background)`, `--ui-widget-surface-background: var(--ui-bg-editor)` (dark: `color-mix(in srgb, var(--ui-bg-editor) 88%, #000)`). Also `--ui-chat-bubble-background`, `--ui-inline-code-background: color-mix(in srgb, #141414 5%, transparent)` (dark: `#ffffff 7%`), `--ui-selection-background: color-mix(in srgb, #ffd24a 55%, transparent)` (dark: 38%).
- **`--dt-*` full list**:
  - `--dt-background: var(--ui-bg-chrome)`, `--dt-foreground: var(--ui-text-primary)`, `--dt-card: var(--ui-bg-editor)`, `--dt-card-foreground: var(--ui-text-primary)`
  - `--dt-muted: var(--ui-bg-tertiary)`, `--dt-muted-foreground: var(--ui-text-tertiary)`
  - `--dt-popover: color-mix(in srgb, var(--ui-bg-elevated) 96%, transparent)`, `--dt-popover-foreground: var(--ui-text-primary)`
  - `--dt-primary: var(--theme-primary)`, `--dt-primary-foreground: #fcfcfc`, `--dt-primary-solid: var(--theme-primary)`, `--dt-primary-solid-foreground: #fcfcfc`
  - `--dt-secondary: var(--theme-secondary)`, `--dt-secondary-foreground: var(--ui-text-secondary)`, `--dt-accent: var(--theme-accent-soft)`, `--dt-accent-foreground: var(--ui-text-primary)`
  - `--dt-border: var(--ui-stroke-secondary)`, `--dt-input: var(--ui-stroke-primary)`, `--dt-input-border: 7%` (dark 4%), `--dt-input-bg: 0%`, `--dt-input-inset: inset 0 1px 1px color-mix(in srgb, #000 10%, transparent)` (dark 38%)
  - `--ui-tab-hover-darken: 2.5%` (dark 6%), `--dt-ring: var(--ui-stroke-primary)`, `--dt-midground: var(--theme-midground)`, `--dt-scrollbar-thumb: oklch(from var(--dt-midground) l 0 h)`, `--dt-composer-ring: var(--ui-base)`
  - `--dt-destructive: #cf2d56`, `--dt-destructive-foreground: #ffffff`
  - `--dt-sidebar-bg: var(--ui-bg-sidebar)`, `--dt-sidebar-border: var(--ui-stroke-secondary)`
  - `--dt-user-bubble: color-mix(in srgb, var(--ui-chat-bubble-background) var(--user-bubble-keep, 100%), transparent)`, `--dt-user-bubble-border: var(--ui-stroke-tertiary)`
  - `--dt-font-sans`, `--dt-font-kbd`, `--dt-font-mono` (see section 3), `--dt-base-size: 1rem`, `--dt-line-height: 1.5`, `--dt-letter-spacing: 0`, `--dt-spacing-mul: 1`
- Other `:root` knobs: `--chrome-action-hover: var(--ui-control-hover-background)`, `--warm-glow`, `--noise-opacity-mul`, `--backdrop-invert-mul: 1` (dark 0), `--dock-glow-scale: 0.55` (dark 1), `--chat-unfocused-opacity: 0.62` (dark 0.72).
- `:root.dark` overrides: `--theme-mix-chrome: 74%; --theme-mix-card: 38%; --theme-mix-elevated: 46%; --theme-mix-bubble: 46%; --theme-neutral-chrome: #0d0d0e; --theme-neutral-sidebar: #0a0a0b; --theme-neutral-card: #161618; --composer-ring-strength: 1.3`.
- Layout and composer tokens (`:root`):
  - Shell: `--sidebar-width: 14.8125rem` (237px), `--chat-min-width: 28rem`, `--titlebar-control-size: 24px`, `--titlebar-control-height: 24px`, `--titlebar-icon-size: 13.9px`, `--sidebar-content-inline-padding: 1rem`, `--file-tree-row-height: 1.375rem`
  - Composer: `--composer-control-size: 1.5rem`, `--composer-control-primary-size: 1.625rem`, `--composer-surface-pad-x: 0.5rem`, `--composer-surface-pad-y: 0.3125rem`, `--composer-input-min-height: 1.625rem`, `--composer-input-max-height: 9.375rem`
  - Conversation: `--message-text-indent: 0.75rem`, `--paragraph-gap: 0.7rem`, `--turn-block-gap: 0.75rem`
- **Z-ladder**: `--z-modal-backdrop: 120; --z-modal: 130; --z-modal-popover: 140; --z-over-modal: 200; --z-over-modal-content: 210; --z-switcher-backdrop: 219; --z-switcher: 220; --z-connecting: 1200; --z-onboarding: 1300; --z-onboarding-popover: 1310; --z-setup: 1400; --z-crash: 1500`. Titlebar clusters use `z-70`. `OverlayView` uses `z-50`.
- Spacing: no custom scale. It is Tailwind v4's default `--spacing` (0.25rem), with `--spacing-mul` exposed but defaulting to 1. — [src/styles.css](B/src/styles.css)

**Theme-to-token wiring** ([src/themes/context.tsx](B/src/themes/context.tsx))
- `applyTheme()` sets the `.dark` class, `data-hermes-theme` and `data-hermes-mode`, then writes inline on `<html>`:
  - Seeds: `--theme-foreground ← foreground`, `--theme-primary ← primary`, `--theme-secondary ← secondary`, `--theme-accent-soft ← accent`, `--theme-midground ← midground ?? ring`, `--theme-warm ← primary`, `--theme-background-seed ← background`, `--theme-sidebar-seed ← sidebarBackground ?? background`, `--theme-card-seed ← card`, `--theme-elevated-seed ← popover`, `--theme-bubble-seed ← userBubble ?? popover`. Per-mode `--theme-mix-*` are written too.
  - Direct `--dt-*`: `--dt-primary-foreground, --dt-secondary-foreground, --dt-accent-foreground, --dt-border, --dt-input, --dt-ring, --dt-muted, --dt-midground-foreground, --dt-primary-solid` (primary darkened until #fcfcfc reaches 4.5:1), `--dt-composer-ring, --dt-destructive(-foreground), --dt-sidebar-border, --dt-user-bubble-border`, `--ui-success` (`harmonize('#10b981', midground, 0.25)`), `--dt-font-sans`, `--dt-font-mono`.
- Theme model: `DesktopTheme { name, label, description, colors, darkColors?, typography?, terminal?, darkTerminal?, customCSS? }`. Color slots: `background, foreground, card, cardForeground, muted, mutedForeground, popover, popoverForeground, primary, primaryForeground, secondary, secondaryForeground, accent, accentForeground, border, input, ring, midground?, midgroundForeground?, composerRing?, destructive, destructiveForeground, sidebarBackground?, sidebarBorder?, userBubble?, userBubbleBorder?`. — [src/themes/types.ts](B/src/themes/types.ts)

**Presets** ([src/themes/presets.ts](B/src/themes/presets.ts); palettes in [apps/shared/src/theme-presets.ts](https://github.com/NousResearch/hermes-agent/blob/5688461d66fadd3ce3d6ed6bccccd958c7370eae/apps/shared/src/theme-presets.ts))
- `BUILTIN_THEMES`: `nous, github, catppuccin, everforest, solarized, nous-alt, classic, midnight, ember, mono, slate, cyberpunk`. `DEFAULT_SKIN_NAME = 'nous'`. Retired names: `nous-light, default, gold`.
- `nous` light: `background #ffffff, foreground #1f2328, card #f6f8fa, muted #f6f6f6, mutedForeground #656d76, popover #ffffff, primary #0053fd, primaryForeground #ffffff, secondary #deeaff, accent #e3edff, border #d0d7de, input #ffffff, ring/midground/composerRing #0053fd, destructive #cf222e, sidebarBackground #f6f8fa, sidebarBorder #d0d7de, userBubble #dae7fd, userBubbleBorder #d0d7de`.
- `nous` dark: `background #0d1117, foreground #e6edf3, card #010409, muted #1a1e24, mutedForeground #7d8590, popover #161b22, primary #4a84fe, primaryForeground #161616, secondary #1d2e4f, accent #17243a, border #30363d, input #0d1117, ring/midground/composerRing #4a84fe, destructive #f85149, sidebarBackground #010409, sidebarBorder #30363d, userBubble #07162c, userBubbleBorder #30363d`. Preset comment: "`#0053FD` is the brand color … dark carries `#4a84fe`, the same hue (263°) lifted to clear AA at 5.9:1."
- `nous-alt` (first-party, hand-authored): light `background #F8FAFF, foreground #17171A, card #FFFFFF, mutedForeground #666678, primary #0053FD, primaryForeground #FCFCFC`, with border and input built as `color-mix(in srgb, #0053FD 22%/30%, transparent)` and `sidebarBackground #F3F7FF`. Dark is "cream on mission-blue": `background #0D2F86, foreground/primary #FFE6CB, card #12378F, sidebarBackground #09286F, border #3158AD`.
- **`classic` ("Classic Hermes", gold on navy)** is built from CLI skin keys through `skinToDesktopTheme`:
  - Dark inputs: `status_bar_bg #1a1a2e, banner_text #FFF8DC, ui_accent #FFBF00, banner_border #CD7F32, banner_dim #B8860B, ui_error #ef5350, completion_menu_bg #1a1a2e`.
  - Light inputs: `status_bar_bg #F5F5F5, banner_text #2B2109, ui_accent #D89B04` (border and dim unchanged), `ui_error #C62828`.
  - Converter: `sidebar = mix(bg, fg, dark ? 0.02 : 0.012)`; accent forced to ≥4.5:1 against the sidebar ("The accent labels the sidebar in small uppercase text, so it must clear WCAG AA"); `card = mix(bg, fg, .04/.025)`, `muted = mix(bg, fg, .06/.04)`, `popover = mix(bg, fg, .08/.05)`, `secondary = mix(accent, bg, .72/.86)`, `accent = mix(accent, bg, .82/.88)`, `userBubble = mix(bg, accent, .18/.12)`. — [src/themes/skin.ts](B/src/themes/skin.ts)
- Other presets: `github` (unmodified GitHub Light/Dark Default), `catppuccin` (Latte/Mocha), `everforest`, `solarized` (converted VS Code forks), `midnight` (dark only), `ember`, `mono`, `slate`, `cyberpunk`. Users can also import VS Code Marketplace themes (`themes/vscode.ts`, `themes/install.ts`) and accent retints (`themes/accents.ts`, `retint.ts`).

**Window glass**
- `:root[data-hermes-glass]` makes the chat, sidebar and editor surface tokens `transparent`. `<body>` paints `color-mix(in srgb, var(--ui-bg-chrome) var(--translucency-glass-keep, 100%), transparent)` once. In sidebar scope, a hard-stop `linear-gradient` at `--glass-rail-edge` keeps the content column opaque. `[data-glass-raised]` restores near-opaque fills: `max(94%, keep)`. — [src/styles.css](B/src/styles.css)
- Default "29% Tint, Sidebar only" in both appearances, with Fade at zero. — [DESIGN.md](B/DESIGN.md)

### Inferences
- Many visible colors are derived alpha-mixes of `--ui-base` (the foreground) and `--ui-accent` (the midground) over whatever is beneath them. To match exactly, port the whole `:root` block and the `applyTheme` seed writes together, not just the preset hexes.
- Pheme's "gold underline / gold small-caps labels" target (docs/VISUAL-GOAL.md) matches what Hermes renders under the **Classic Hermes** skin, or any skin whose `primary` is gold. Tab underline and section labels both read `--theme-primary`.

### Gaps
- I did not compute the final resolved hex values of `classic` (they come from `mix()` and `ensureContrast()` at runtime in `themes/color.ts`). They could be computed by porting `skin.ts` and `color.ts`, which are MIT.

## 3. Typography (fonts, sources, licenses, scale, line heights, letter-spacing, small-caps labels)

### Takeaway
The UI face is the platform system font (Segoe on Windows, SF Pro on macOS, system-ui on Linux). There is no bundled UI font. Mono is bundled JetBrains Mono (Regular, Bold, Italic as woff2). The only display face is the Nous "Collapse" Bold, used for the empty-chat wordmark and the boot-failure screen; it is pulled from `@nous-research/ui` and must not be ported. Body text is 13px. UI chrome sits at 11 to 13px. Section labels are about 10.2px uppercase with 0.16em tracking in `--theme-primary`.

### Cited Findings
- `--dt-font-sans: 'Segoe WPC', 'Segoe UI', -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji', emoji`. Theme presets use `SYSTEM_SANS` with `"SF Pro Display"` added after SF Pro Text. — [src/styles.css](B/src/styles.css); [src/themes/presets.ts](B/src/themes/presets.ts)
- `--dt-font-kbd: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif` ("Key caps always use the native UI face"). — [src/styles.css](B/src/styles.css)
- `--dt-font-mono: 'JetBrains Mono', 'Cascadia Code', 'Cascadia Mono', 'DejaVu Sans Mono', 'Liberation Mono', 'Noto Sans Mono', 'Noto Mono', 'SF Mono', ui-monospace, Menlo, Consolas, monospace, <emoji>`. — [src/styles.css](B/src/styles.css)
- Bundled `@font-face`: `'JetBrains Mono'` at 400 normal (`./fonts/JetBrainsMono-Regular.woff2`), 700 normal (`JetBrainsMono-Bold.woff2`) and 400 italic (`JetBrainsMono-Italic.woff2`), all `font-display: swap`. The source comment calls it a "bundled terminal font (Apache-2.0)". File sizes are 92 to 96 KB each. — [src/styles.css](B/src/styles.css); [src/fonts/](B/src/fonts)
- `@font-face { font-family: 'Collapse'; font-weight: 700; src: url('@nous-research/ui/fonts/Collapse-Bold.woff2') }`. The `.wordmark` class is `font-family: 'Collapse', var(--font-sans); font-weight: 700; line-height: 0.9; text-transform: uppercase; letter-spacing: 0.08em`, paired with a `.fit-text` container-query auto-fit. — [src/styles.css](B/src/styles.css); used by [src/components/chat/wordmark.tsx](B/src/components/chat/wordmark.tsx) (classes `wordmark fit-text mx-auto text-midground mix-blend-plus-lighter dark:text-foreground/90`)
- The `nous`, `github` and `nous-alt` presets also set `fontUrl: 'https://fonts.googleapis.com/css2?family=Courier+Prime:wght@400;700&display=swap'` (web-loaded). Other presets web-load JetBrains Mono (midnight) or IBM Plex Mono (ember) from Google Fonts. `cyberpunk` uses `"Courier New"` for both sans and mono. A grep found no CSS family that references "Courier Prime" in desktop src, so the Courier Prime load appears to be unused there. — [src/themes/presets.ts](B/src/themes/presets.ts)
- A user chat-font override exists (Settings), with suggestions `OpenDyslexic, Atkinson Hyperlegible, Lexend, Inter, IBM Plex Sans, Source Sans 3, Noto Sans, Segoe UI, SF Pro Text`. It is prepended to the theme stack. — [src/themes/chat-font.ts](B/src/themes/chat-font.ts)
- Base sizes: `html { font-size: var(--dt-base-size, 0.875rem) }` with `--dt-base-size: 1rem` (so 1rem = 16px). `body { font-size: 0.8125rem; line-height: var(--dt-line-height, 1.55); letter-spacing: var(--dt-letter-spacing, 0); -webkit-font-smoothing: antialiased; user-select: none }`, where `--dt-line-height` is 1.5. — [src/styles.css](B/src/styles.css)
- Conversation scale: `--conversation-text-base-size: 0.8125rem` (13px), `--conversation-tool-base-size: 0.6875rem` (11px), `--conversation-caption-base-size: 0.75rem` (12px), `--conversation-base-line-height: 1.125rem` (18px), `--conversation-caption-base-line-height: 1rem`. Chat Text Size defaults to a 110% multiplier on transcript and composer only; UI Scale is whole-window zoom at 100%. — [src/styles.css](B/src/styles.css); [DESIGN.md](B/DESIGN.md)
- Control type: buttons `text-xs leading-4 font-medium` (12px/16px); `xs` buttons `text-[0.6875rem]`; `lg` `text-sm leading-5`. Inputs use the same scale (`controlVariants`). Menu rows `text-xs`, menu labels `text-xs font-medium text-(--ui-text-tertiary)`. — [src/components/ui/button.tsx](B/src/components/ui/button.tsx); [src/components/ui/control.ts](B/src/components/ui/control.ts); [src/components/ui/menu.ts](B/src/components/ui/menu.ts)
- **Small-caps section label** (`SidebarPanelLabel`): `flex items-center gap-2 pl-2 text-[0.64rem] font-semibold uppercase tracking-[0.16em] text-(--theme-primary)`. A leading 8px dithered square (`dither inline-block size-2 rounded-[1px]`, where `.dither` is `repeating-conic-gradient(currentColor 0% 25%, transparent 0% 50%) 0 0 / 0.125rem 0.125rem`) sits before the label. Optional meta: `text-[0.6875rem] font-medium tracking-normal text-(--ui-text-quaternary)`. — [src/app/shell/sidebar-label.tsx](B/src/app/shell/sidebar-label.tsx); [src/styles.css](B/src/styles.css)
- The workspace or group sub-header inside the sidebar uses `text-[0.64rem] font-semibold uppercase tracking-[0.12em] text-(--ui-text-quaternary)` followed by a `h-px flex-1 bg-(--ui-stroke-tertiary)` rule. — [src/app/chat/sidebar/chrome.tsx](B/src/app/chat/sidebar/chrome.tsx)
- Pane tab labels: `text-[0.6875rem] font-medium` with `tracking-wide uppercase`. — [src/components/ui/pane-tab.tsx](B/src/components/ui/pane-tab.tsx)
- Sidebar row label: `text-[0.8125rem] text-(--ui-text-secondary) leading-[1.35]`. Row timestamps: `text-[0.625rem] leading-none text-(--ui-text-tertiary)`. — [src/app/chat/sidebar/row-geometry.ts](B/src/app/chat/sidebar/row-geometry.ts); [src/app/chat/sidebar/session-row.tsx](B/src/app/chat/sidebar/session-row.tsx)
- Link underlines: `text-decoration-color: color-mix(in srgb, currentColor 20%, transparent); text-underline-offset: 0.25rem`. Selection uses `--ui-selection-background` (yellow #ffd24a). — [src/styles.css](B/src/styles.css)

### Inferences
- A pixel match on macOS needs `-apple-system` to resolve to SF Pro Text. On Windows it needs Segoe UI. Screenshots taken on one OS will not match another, because Hermes bundles no UI face.
- The license comment on JetBrains Mono ("Apache-2.0") conflicts with my understanding that current JetBrains Mono releases use SIL OFL 1.1. Either license permits bundling, but Pheme should ship the license text that matches the files it copies. This is unverified here; check the upstream JetBrains/JetBrainsMono repo.

### Gaps
- I did not confirm the license of the Collapse font. See section 7.

## 4. App shell layout (frame, titlebar, tab strip, left rail, status bar, right panels, settings, pages; measurements)

### Takeaway
A frameless Electron window (`titleBarStyle: 'hidden'`, Window Controls Overlay on Windows and Linux, traffic lights at x=12 on macOS) carries a 34px titlebar band. Panes extend into that band. Fixed 24×24 icon clusters sit at the top-left (offset 74px from the traffic lights) and top-right. Below it is a resizable zone tree: sessions rail (237px default, 360 max) | workspace/chat | right column (review + files above the terminal), with flex ratios `[1, 3.4, 1.25]`. A 20px status bar runs along the bottom. Tab strips are 28px. Settings and the other "short task" views are full-window `OverlayView` cards with a 13rem nav column.

### Cited Findings
**Window frame and titlebar**
- `TITLEBAR_HEIGHT = 34`, `TOUCH_TITLEBAR_HEIGHT = 44`, `TITLEBAR_DRAG_HANDLE_WIDTH = 48`, `MACOS_TRAFFIC_LIGHTS_HEIGHT = 14`, `TITLEBAR_CONTROL_SIZE = 24`, `TITLEBAR_ICON_SIZE = 13.9`, `TITLEBAR_ICON_BADGE_SCALE = 0.65`, `TITLEBAR_CONTROL_OFFSET_X = 74`, `TITLEBAR_CONTROLS_TOP = (34-24)/2 = 5`, `TITLEBAR_FALLBACK_WINDOW_BUTTON_X = 12` (mac) / 24 (other), `TITLEBAR_EDGE_INSET = 14`. On pre-Tahoe macOS the cluster gets a `calc(var(--spacing) * 0.9)` Y-nudge. The right cluster inset is the WCO width, else `0.75rem`. — [src/app/shell/titlebar.ts](B/src/app/shell/titlebar.ts)
- Titlebar buttons use `text-muted-foreground/85 hover:bg-(--ui-control-hover-background) hover:text-foreground` on `<Button size="icon-titlebar">` (24×24, `rounded-[4px]`). Clusters are `fixed z-70 flex flex-row items-center … [-webkit-app-region:no-drag]` with no gap ("24px buttons abut"). — [src/app/shell/titlebar.ts](B/src/app/shell/titlebar.ts); [src/components/ui/button.tsx](B/src/components/ui/button.tsx)
- Pane header class (`titlebarHeaderBaseClass`): `h-(--titlebar-height) … gap-3 border-b border-(--ui-stroke-tertiary) bg-(--ui-chat-surface-background) px-[max(0.75rem,var(--titlebar-content-inset,0rem))]`, with right padding reserving the tools width. An optional fade shadow below is `after:h-4 after:bg-linear-to-b after:from-(--ui-chat-surface-background) after:to-transparent`. — [src/app/shell/titlebar.ts](B/src/app/shell/titlebar.ts)
- Electron: `titleBarStyle: 'hidden'`, `titleBarOverlay: getTitleBarOverlayOptions()`, `trafficLightPosition: { x: 12, y: 34/2 - 14/2 = 10 }` on macOS, and macOS vibrancy for glass. Session popout windows have a minimum of 420×620; browser windows 480×400. — [electron/main.ts](B/electron/main.ts); [electron/session-windows.ts](B/electron/session-windows.ts); [electron/browser-windows.ts](B/electron/browser-windows.ts)
- Left cluster contents: sidebar toggle, settings, layout editor and HUD. Flip panes and the right-sidebar toggle sit on the right. Simple mode shows only sidebar, settings and layout editor. Holding Cmd/Ctrl for 400ms reveals tab slot numbers. — [DESIGN.md](B/DESIGN.md)

**Pane layout tree (zones)**
- `DEFAULT_TREE = split('row', [group(['sessions']), group(['workspace']), split('column', [split('row', [group(['review']), group(['files'])], [1, 1.2]), group(['terminal'])], [1.6, 1])], [1, 3.4, 1.25])`. Other bundled presets: Focus, Basic, Terminal, Quad and Demo (chat alone, `tabStrip: 'never'`). — [src/app/contrib/layout-presets.ts](B/src/app/contrib/layout-presets.ts)
- `SIDEBAR_DEFAULT_WIDTH = 237`, `SIDEBAR_MAX_WIDTH = 360`, `FILE_BROWSER_DEFAULT_WIDTH = 237px`, `FILE_BROWSER_MIN_WIDTH = 10rem`, `FILE_BROWSER_MAX_WIDTH = 20rem`, `SIDEBAR_SESSIONS_PAGE_SIZE = 50`. — [src/store/layout.ts](B/src/store/layout.ts)
- Below a 640px window width (`SIDEBAR_DOCK_MIN_WIDTH_PX`), both rails leave the grid and become hover-reveal overlays. Page gutter: `PAGE_INSET_X = 'px-[clamp(1.25rem,4vw,4rem)]'`. Page body cap: `PAGE_MAX_W = 'max-w-[75rem]'`. — [src/app/layout-constants.ts](B/src/app/layout-constants.ts)
- Unfocused chat panes: `opacity: var(--chat-unfocused-opacity)` (0.62 light / 0.72 dark) plus `filter: grayscale(0.2)`, with a 75ms ease-out transition. — [src/styles.css](B/src/styles.css)

**Tab strip (`PaneTabStrip` / `PaneTab`)**
- Strip: `bg-(--ui-sidebar-surface-background)`, `h-7` (28px) when local, or full titlebar height when it rides the titlebar (`[-webkit-app-region:drag]`). There is no bottom rule: "the active tab's primary underline is the only seam". The tab list hides its scrollbar.
- Tab: `text-[0.6875rem] font-medium`, `h-full min-w-0 max-w-48`, closeable `min-w-13`, `not-first:border-l border-l-(--ui-stroke-quaternary)`. Label: `px-2 … truncate font-medium tracking-wide uppercase`.
- Active tab: `text-foreground`, `--tab-bg: var(--pane-tab-active-bg, var(--ui-editor-surface-background))`, underline `shadow-[inset_0_-2px_0_var(--pane-tab-active-accent,var(--theme-primary))]` (a 2px inset, so no layout shift).
- Idle tab: `text-(--ui-text-tertiary)` on the sidebar surface. Hover darkens via `shadow-[inset_0_0_0_100vmax_color-mix(in_srgb,#000_var(--ui-tab-hover-darken),transparent)]` and switches to `text-(--ui-text-secondary)`. Multi-select uses a 14% accent wash.
- Close: a 1.5rem (`--pane-tab-close-width`) hover-revealed ✕. The label is faded with a CSS mask (`#000 calc(100% - close - 1rem)` to `transparent calc(100% - close)`). Dirty tabs show an amber 8px dot.
- Strip glyph buttons: `icon-xs` ghost, `opacity-60 hover:opacity-100`.
- Sources: [src/components/ui/pane-tab.tsx](B/src/components/ui/pane-tab.tsx); [src/styles.css](B/src/styles.css)

**Left rail (`ChatSidebar`)**
- Container: `relative h-full … border-r border-(--sidebar-edge-border) bg-(--ui-sidebar-surface-background)` (`border-l` when panes are flipped). Content uses `px-2.5`. The top nav group has `pt-[calc(var(--titlebar-height)+0.375rem)] pb-2`, so the nav starts 40px from the top, under the titlebar clusters.
- Nav rows (`SidebarMenu gap-px`): `flex h-7 w-full gap-2 rounded-md border border-transparent px-2 text-[0.8125rem] font-medium text-(--ui-text-secondary) transition-colors duration-100 ease-out hover:bg-(--ui-control-hover-background) hover:text-foreground hover:transition-none`. Active: `border-(--ui-stroke-tertiary) bg-(--ui-control-active-background) text-foreground`. Icon: `size-4 text-[color-mix(in_srgb,currentColor_72%,transparent)]`. "New session" shows a `KbdGroup` at `ml-auto opacity-55`.
- Nav items: New session, Capabilities, Messaging, Artifacts (advanced), Cron (advanced), plus plugin-contributed rows.
- Then a `SearchField` (`px-2 pb-1 pt-1`), then the scrolling sections: Pinned, Projects/workspaces, Sessions (grouped by gateway/profile) and Cron jobs. Section headers have hover-revealed `+` buttons (`icon-xs` ghost, codicon `add` at 0.75rem, `opacity-0 group-hover/section:opacity-100`).
- Below 768px height (`compact:` variant) all sections flatten into one scroller. A profile rail sits at the bottom (`shrink-0 px-0.5 pb-1 pt-0.5`).
- Sources: [src/app/chat/sidebar/index.tsx](B/src/app/chat/sidebar/index.tsx); [src/app/chat/sidebar/chrome.tsx](B/src/app/chat/sidebar/chrome.tsx)
- Row geometry: `SIDEBAR_ROW_MIN_H = 'min-h-[1.625rem]'` (26px), `SIDEBAR_ROW_PAD_X = 'pl-2 pr-2'`, `SIDEBAR_ROW_PAD_TRAIL = 'pr-2'`, `SIDEBAR_ROW_GAP = 'gap-1.5'`, `SIDEBAR_ROW_LEAD = 'grid size-3.5 shrink-0 place-items-center'` (14px lead cell), `SIDEBAR_ROW_INSET = … 'flex h-full min-w-0 items-center self-stretch py-0.5'`, `SIDEBAR_ROW_CARD_MIN_H = 'min-h-[3.375rem]'` (54px inbox-style card: workspace + age, title + preview, model + size), `SIDEBAR_LEAD_ICON_SIZE = '0.875rem'`. Shell: `grid grid-cols-[minmax(0,1fr)_auto] items-stretch rounded-md`. Row stack: `grid grid-cols-[minmax(0,1fr)] gap-px`. — [src/app/chat/sidebar/row-geometry.ts](B/src/app/chat/sidebar/row-geometry.ts); [src/app/chat/sidebar/chrome.tsx](B/src/app/chat/sidebar/chrome.tsx)
- Session row states: `group row-hover relative`. Selected: `bg-(--ui-row-active-background)`. Open in an unfocused pane: `bg-(--ui-row-open-background)`. A running session draws `<span class="arc-border arc-row">` around the row. Titles use `hover-marquee` (they scroll on hover if truncated). The card variant adds a model, size and todo-progress line in `tabular-nums`. — [src/app/chat/sidebar/session-row.tsx](B/src/app/chat/sidebar/session-row.tsx)
- Status dots (6px, `size-1.5 rounded-full`): needs-input `bg-amber-500`; working `bg-(--ui-accent)`; stalled is a hollow accent `border`; background is a hollow `--ui-text-tertiary`; unread `bg-(--ui-success)`; draft is a hollow `--ui-text-quaternary`. Dots never animate ("the row's arc carries the motion"). — [src/app/chat/session-status-dot.tsx](B/src/app/chat/session-status-dot.tsx)
- Focus ring for sidebar controls: `focus-visible:bg-(--ui-control-hover-background) focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-inset`. — [src/app/chat/sidebar/chrome.tsx](B/src/app/chat/sidebar/chrome.tsx)

**Status bar**
- `<footer data-slot="statusbar" class="flex h-5 shrink-0 items-stretch justify-between gap-2 bg-(--ui-sidebar-surface-background) px-1 py-0 text-(--ui-text-tertiary)">`. It is 20px tall, with left and right item groups (`gap-0.5 overflow-x-clip`).
- Items: `inline-flex h-full items-center gap-1 rounded-none px-1.5 text-[0.6875rem] text-(--ui-text-tertiary) transition-colors hover:bg-(--chrome-action-hover) hover:text-foreground`. Details are `text-muted-foreground/80`.
- Right-click opens a menu to hide or reset items. Items come from `use-statusbar-items.tsx` (model, context usage, gateway, system resources, approval mode and others).
- Sources: [src/app/shell/statusbar-controls.tsx](B/src/app/shell/statusbar-controls.tsx); [src/app/shell/hooks/use-statusbar-items.tsx](B/src/app/shell/hooks/use-statusbar-items.tsx)

**Right panels**
- `src/app/right-sidebar/` holds `files/`, `review/`, `terminal/` and `file-actions.tsx`. Preview tiles are dynamic panes docked beside the file tree. The terminal surface is `bg-(--ui-terminal-surface-background)`. — [src/app/contrib/surfaces.tsx](B/src/app/contrib/surfaces.tsx); [src/app/contrib/layout-presets.ts](B/src/app/contrib/layout-presets.ts)
- Collapsed side groups become vertical restore rails with vertical-rl tabs (`[writing-mode:vertical-rl]`, `max-h-48`). — [src/components/ui/pane-tab.tsx](B/src/components/ui/pane-tab.tsx); [DESIGN.md](B/DESIGN.md)

**Overlays (Settings, Command Center, Cron, Profiles, Agents, Starmap, Webhooks, Session import)**
- `OverlayView`: scrim `fixed inset-0 z-50 bg-black/22 backdrop-blur-[0.125rem]`, padded `p-[calc(var(--titlebar-height)+0.625rem)]` (`sm:` +0.875rem). Card: `rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-chat-surface-background) shadow-md`, `data-glass-raised`. The close ✕ is `icon-titlebar` ghost at the top-right, aligned with the titlebar. Esc closes; clicking the backdrop closes. — [src/app/overlays/overlay-view.tsx](B/src/app/overlays/overlay-view.tsx)
- `OverlaySplitLayout`: `grid grid-cols-[13rem_minmax(0,1fr)]`, collapsing to one column below 47.5rem.
- `OverlaySidebar`: `flex flex-col gap-0.5 overflow-y-auto bg-(--ui-sidebar-surface-background) px-2.5 pb-3 pt-[calc(var(--titlebar-height)/2-0.4375rem)]`.
- `OverlayMain`: `mx-auto max-w-[75rem] … pt-[calc((var(--titlebar-height)/2+1rem)*2/3)] px-[clamp(0.8333rem,2.6667vw,2.6667rem)]`.
- `OverlayNavItem`: `row-hover flex h-7 gap-2 rounded-md border px-2 text-[length:var(--conversation-text-font-size)]`. Active top-level: `border-(--ui-stroke-tertiary) bg-(--ui-bg-tertiary) text-foreground`. Idle: `text-(--ui-text-secondary)`. Nested items use `size-3.5` icons with `ml-3.5 pl-1.5` indentation. A breadcrumb header owns page titles.
- Sources: [src/app/overlays/overlay-split-layout.tsx](B/src/app/overlays/overlay-split-layout.tsx)
- Settings nav groups (ids): config subpages `model, chat, appearance, workspace, safety, browser, memory, voice, advanced`, plus `vault, notifications, billing` (overview, plans), `providers` (accounts, keys, custom-endpoints, local), `gateway` (web-access), `keybinds` (tools, settings), `keys, sessions, backup, plugins, about`. — [src/app/settings/index.tsx](B/src/app/settings/index.tsx); [src/app/settings/constants.ts](B/src/app/settings/constants.ts)
- Menus and popovers: `rounded-lg border border-(--ui-stroke-secondary) bg-[color-mix(in_srgb,var(--ui-bg-elevated)_96%,transparent)] p-1 shadow-md backdrop-blur-md`. Rows: `rounded-md px-2 py-1 text-xs`, focus `bg-(--ui-control-active-background)`. — [src/components/ui/menu.ts](B/src/components/ui/menu.ts)
- Dialog: `rounded-xl border border-(--stroke-nous) bg-(--ui-chat-bubble-background) shadow-nous max-h-[85vh]`, backdrop `bg-black/22`. — [src/components/ui/dialog.tsx](B/src/components/ui/dialog.tsx)
- Tooltip bubble: radius `0.25rem`, max width `min(24rem, calc(100vw - 1.5rem))`. — [src/components/ui/tooltip.css](B/src/components/ui/tooltip.css)

**Primitives**
- Button base: `rounded-[2.5px] text-xs leading-4 font-medium transition-all duration-100 focus-visible:ring-[0.1875rem] focus-visible:ring-ring/50`, with SVGs at `size-3.5`.
- Variants:
  - `default`: `bg-primary text-primary-foreground hover:bg-primary/90`
  - `secondary`: `bg-(--ui-bg-quaternary)`
  - `outline`: transparent with `shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--ui-stroke-secondary)_50%,transparent)]`
  - `ghost`: `text-(--ui-text-secondary) hover:bg-(--chrome-action-hover)`
  - `floating`: `bg-popover shadow-md`
  - Others: `chip`, `grip`, `link`, `text`, `textStrong`, `destructive`
- Sizes: `default px-3 py-1.5`, `xs px-2 py-0.5`, `sm px-2.5 py-1`, `lg px-5 py-2`, `icon size-9`, `icon-xs size-6`, `icon-sm size-8`, `icon-lg size-10`, `icon-titlebar 24×24`, `touch min-h-11`, `micro`, `inline`, `grip h-4 w-12`. Icon buttons are `rounded-[4px]`.
- Source: [src/components/ui/button.tsx](B/src/components/ui/button.tsx)
- Input chrome (`.desktop-input-chrome`): `background: color-mix(in srgb, var(--dt-card) var(--dt-input-bg), transparent); border-color: color-mix(in srgb, var(--dt-composer-ring) var(--dt-input-border), transparent); box-shadow: var(--dt-input-inset); transition: border-color 200ms ease-out`. Hover doubles the alpha. Focus and open states show the full `--dt-composer-ring` with no shadow. — [src/styles.css](B/src/styles.css)
- Scrollbars: 0.5rem, transparent until the scroller is hovered, then thumb `color-mix(in srgb, var(--dt-scrollbar-thumb) 18%, transparent)`, or 40% when the thumb itself is hovered. Radius 9999rem. — [src/styles.css](B/src/styles.css)

**Pages**
- Durable pages in shell chrome: Chat (home), Capabilities (`/capabilities`, formerly Skills), Messaging and Artifacts. Plugin pages register through `ROUTES_AREA`; Kanban is one example.
- Route overlays: Settings, Command Center, Cron, Profiles, Agents, Starmap, Webhooks and Session import. Pickers for model and session layer above the current view.
- Boot and blocking surfaces: install, onboarding, connecting, boot failure, crash and updates.
- Sources: [DESIGN.md](B/DESIGN.md); [src/app/routes.ts](B/src/app/routes.ts); [src/app/contrib/surfaces.tsx](B/src/app/contrib/surfaces.tsx)

### Inferences
- Approximate vertical rhythm of the default window: 34px titlebar band (tabs and pane headers sit in it), then pane content, then a 20px status bar. The rail runs from the very top (its nav starts at 40px) down to the status bar. The status bar spans the full width, matching the "Finder shape" glass comment.
- The `h-7` (28px) height is shared by sidebar nav rows, overlay nav rows and local tab strips. Session rows are 26px minimum, with a 1px gap.

### Gaps
- I did not find the main window's default or minimum `width`/`height` constants (`WINDOW_MIN_WIDTH` is used in `electron/main.ts` but is defined elsewhere, likely shared). `layout-constants.ts` mentions "the window's own 400px minimum".
- Composer measurements are listed under tokens. The full composer anatomy is out of scope (chat researcher).

## 5. Motion (transitions, durations, easings, hover and press, loading and working indicators, panel animations)

### Takeaway
Motion is deliberately minimal and functional. Controls get about 100ms color transitions. "Hover paints instantly; only the return eases" (`hover:transition-none`). Everything continuous runs on the compositor (transform-only keyframes). A blanket `prefers-reduced-motion` rule kills all animation. The signature working indicator is the travelling "arc border" around a running session row.

### Cited Findings
- Principles: "Quick, functional transitions (~100ms on controls)". "Hover paints instantly; only the return eases. Put the transition on the resting state and drop it while hovered (`transition-colors duration-100 hover:transition-none`)". "Motion follows state; it never delays state". "Do not animate layout geometry with `transition-all` on a hot interaction". Visible but unfocused windows keep animating; hidden windows pause. — [DESIGN.md](B/DESIGN.md)
- `@utility row-hover { cursor: pointer; transition: color 100ms ease-out, background-color 100ms ease-out; &:hover { background-color: var(--ui-row-hover-background); transition: none; } }`. This is shared by every list (sessions, capabilities, messaging, file trees, timeline). — [src/styles.css](B/src/styles.css)
- Reduced motion: `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; } }`. Reduced transparency drops all `backdrop-filter`. `:root[data-renderer-animations-paused]` pauses shimmer, arcs, spinners and other loops while the window is hidden. — [src/styles.css](B/src/styles.css)
- **Arc border** (running indicator): `.arc-border` with `--arc-c0: transparent`, `--arc-c1: var(--dt-midground)`, `--arc-c2: var(--dt-background)`, `--arc-angle: 160deg`, `--arc-width: 0.078125rem` (1.25px), `--arc-standoff: 0.125rem`, `--arc-radius: var(--radius-md)`, `--arc-duration: 2.23s`. A `::before` layer at 240%×240% carries a `repeating-linear-gradient(var(--arc-angle), transparent 0%, c0 18.75%, c1 25%, c2 31.25%, transparent 43.75%, transparent 50%)` and animates `transform: translate(0,0)` to `translate(-50%,-50%)`, linear and infinite. Variant `.arc-row` (sidebar): standoff 0, `--arc-c2: color-mix(in srgb, var(--arc-c1) 45%, transparent)`. Variant `.arc-composer`: 2px wide, radius 0.75rem. Variant `.arc-nous` (Nous Portal hero): `#4f8cff` to `#ff8c42` at 3.27s. — [src/styles.css](B/src/styles.css)
- Glyph spinner: braille or unicode frames stacked as a vertical strip and scrolled with `transform: translateY` under `steps(N)`. There are 18 variants (from `unicode-animations`). The source notes "no JS timer, no text mutation". — [src/components/ui/glyph-spinner.css](B/src/components/ui/glyph-spinner.css); [src/components/ui/glyph-spinner.tsx](B/src/components/ui/glyph-spinner.tsx)
- `Loader`: animated math-curve SVG loaders (`LOADER_TYPES`: original-thinking, thinking-five, thinking-nine, rose-orbit, rose-curve, rose-two…four, lissajous-drift, lemniscate-bloom, hypotrochoid-loop, three…six-petal-spiral, butterfly-phase, cardioid-glow, cardioid-heart, heart-wave, spiral-search, fourier-flow). Long operations use `lemniscate-bloom`. The literal text "Loading…" is forbidden. — [src/components/ui/loader.tsx](B/src/components/ui/loader.tsx); [DESIGN.md](B/DESIGN.md)
- Button `loading`: the label goes invisible (keeping its width) and a centered `Loader2 animate-spin` sits over it. — [src/components/ui/button.tsx](B/src/components/ui/button.tsx)
- `tw-shimmer` is imported for shimmer text. `.shimmer` is listed among the paused loop classes. — [src/styles.css](B/src/styles.css)
- Tooltips: 200ms delay before the first open, a 300ms warm window, no entrance animation, and an exit fade of 100ms (`tooltip-exit 100ms ease-in`) moving 0.125rem toward the anchor. — [DESIGN.md](B/DESIGN.md); [src/components/ui/tooltip.css](B/src/components/ui/tooltip.css)
- Other named timings:
  - Input border: 200ms ease-out
  - Chat-surface focus dim: 75ms ease-out (opacity and filter)
  - Composer drag hatch: 150ms
  - Translucency peek: 420ms `cubic-bezier(0.22, 1, 0.36, 1)` on return, 160ms `cubic-bezier(0.32, 0.72, 0, 1)` on reveal
  - Thread jump button: in 200ms `cubic-bezier(0.22, 1, 0.36, 1)` (translateY 0.3rem, scale 1.1 to 1); out 180ms ease-in
  - `progress-slide`: 1.15s ease-in-out (translateX -105% to 250%)
  - Hover marquee: `var(--marquee-t, 3s)` linear, 300ms delay
  - Decode cursor: 1s step-end blink
  - CardStack: 220ms promotion, 180ms clearance, 96% scale silhouette 7px behind
  - Guide controls: fade in over 100ms
  - Sources: [src/styles.css](B/src/styles.css); [DESIGN.md](B/DESIGN.md)
- Scroll edge fades (`scroll-fade-y`): a mask gradient of 1.25rem driven by scroll-timeline animations (`animation-timeline: scroll(self y)`), applied only while content is clipped. — [src/styles.css](B/src/styles.css)
- Haptics: `triggerHaptic('tap' | 'close')` fires on titlebar tools and overlay close (`web-haptics`). — [src/app/overlays/overlay-view.tsx](B/src/app/overlays/overlay-view.tsx)

### Inferences
- If the tw-animate classes are inert (section 1), menus, popovers and dialogs open and close without the zoom-95 or slide-1 animation in the shipped desktop app. Pheme should verify against a running Hermes before adding entrance motion.

### Gaps
- I did not inspect the exact spring parameters in `card-stack.tsx` and `diff-count.tsx` (motion v12) or the per-file keyframes in `butterbar.css`, `timeline.css` and `app-tour.css`.

## 6. File paths to port (by concern)

### Takeaway
Most of the visual system lives in one 4,303-line stylesheet plus a dozen small primitives and the theme folder. The shell is spread across `src/app/shell`, `src/app/chat/sidebar`, `src/components/ui/pane-tab.tsx`, `src/components/pane-shell` and `src/app/overlays`.

### Cited Findings
- Design contract: `apps/desktop/DESIGN.md`. Architecture and state rules: `apps/desktop/AGENTS.md`, `src/AGENTS.md`. — [DESIGN.md](B/DESIGN.md)
- Tokens, base, utilities, keyframes: `src/styles.css` (4,303 lines; `@theme inline` around lines 132–208, `:root` 210–600, `:root.dark` about 602–640, glass 640–790, base 790–846, `row-hover` 1128, arc 1227–1388, input chrome 1547–1585, scrollbars 1604–1650). — [src/styles.css](B/src/styles.css)
- Themes: `src/themes/{types.ts, presets.ts, context.tsx (applyTheme), color.ts (mix/ensureContrast/readableInk/harmonize), skin.ts, accents.ts, retint.ts, vscode.ts, chat-font.ts, boot-palette.ts}` and `apps/shared/src/theme-presets.ts`; translucency defaults in `apps/shared/src/translucency.ts`. — [src/themes/presets.ts](B/src/themes/presets.ts); [apps/shared/src/theme-presets.ts](https://github.com/NousResearch/hermes-agent/blob/5688461d66fadd3ce3d6ed6bccccd958c7370eae/apps/shared/src/theme-presets.ts)
- Fonts: `src/fonts/JetBrainsMono-{Regular,Bold,Italic}.woff2`. — [src/fonts](B/src/fonts)
- UI primitives (`src/components/ui/`): `button.tsx, control.ts, menu.ts, input.tsx, dialog.tsx, popover.tsx, dropdown-menu.tsx, context-menu.tsx, command.tsx, tooltip.css (+ Tip), pane-tab.tsx, badge.tsx, kbd.tsx, loader.tsx, glyph-spinner.{tsx,css}, fade-scroll.tsx, fade-text.tsx, empty-state.tsx, error-state.tsx, log-view.tsx, confirm-dialog.tsx, card-stack.tsx, codicon.tsx, disclosure-caret.tsx, fan-menu.tsx, sidebar.tsx` (shadcn sidebar: `SIDEBAR_WIDTH '16rem'`, icon `3rem`, mobile `18rem`; Hermes overrides the width through its zone layout). — [src/components/ui/pane-tab.tsx](B/src/components/ui/pane-tab.tsx); [src/components/ui/sidebar.tsx](B/src/components/ui/sidebar.tsx)
- Icons: `src/lib/icons.ts`, `src/components/ui/codicon.tsx`. — [src/lib/icons.ts](B/src/lib/icons.ts)
- Titlebar and status bar: `src/app/shell/{titlebar.ts, titlebar-controls.tsx, titlebar-icon.tsx, statusbar-controls.tsx, sidebar-label.tsx, butterbar.{tsx,css}, hooks/use-statusbar-items.tsx, hooks/use-window-controls-overlay-width.ts, wslg-window-controls.tsx}`. — [src/app/shell/titlebar.ts](B/src/app/shell/titlebar.ts)
- Left rail: `src/app/chat/sidebar/{index.tsx, chrome.tsx, row-geometry.ts, session-row.tsx, sessions-section.tsx, virtual-session-list.tsx, profile-switcher.tsx, projects/}`, `src/app/chat/session-status-dot.tsx`. — [src/app/chat/sidebar/row-geometry.ts](B/src/app/chat/sidebar/row-geometry.ts)
- Layout and panes: `src/store/layout.ts`, `src/app/layout-constants.ts`, `src/app/contrib/{surfaces.tsx, layout-presets.ts}`, `src/components/pane-shell/{tree/, geometry.ts, edit-mode.tsx}`. — [src/app/contrib/layout-presets.ts](B/src/app/contrib/layout-presets.ts)
- Overlays and settings: `src/app/overlays/{overlay-view.tsx, overlay-split-layout.tsx, overlay-breadcrumb-header.tsx, overlay-chrome.tsx, panel.tsx}`, `src/app/settings/{index.tsx, constants.ts, primitives.tsx (ListRow), appearance-settings.tsx}`. — [src/app/overlays/overlay-view.tsx](B/src/app/overlays/overlay-view.tsx)
- Routes: `src/app/routes.ts`. Empty-chat intro: `src/components/chat/{intro.tsx, wordmark.tsx}`. — [src/app/routes.ts](B/src/app/routes.ts)

### Inferences
- Lowest-effort high-fidelity path: port `styles.css` (minus the Collapse `@font-face`, the pet, kanban and error-card sections, and Nous-specific arcs), `themes/` with a Pheme default preset, and `button.tsx`, `control.ts`, `menu.ts`, `pane-tab.tsx`, `row-geometry.ts` and `sidebar-label.tsx` near-verbatim under MIT attribution.

### Gaps
- None beyond the per-section gaps.

## 7. Assets that must NOT be ported (Nous-branded or not covered by the repo's MIT grant)

### Takeaway
Do not port the `nous-girl` brand mark images, the `hermes*` sprites and frames, the app icons, `catalog-wing*.svg`, the `filler-bg0.jpg` backdrop, or the Collapse font and its siblings from `@nous-research/ui`. The `nous`/`nous-alt` preset names and the `.arc-nous` hero colors are Nous branding; rename or drop them. JetBrains Mono, Tabler and Codicons ship under their own open licenses and are fine with attribution.

### Cited Findings
- `BrandMark` renders `nous-girl.png` / `nous-girl-dark.png` on a fixed tile (white, or `#0d1117` in dark). The source images are `assets/nous-girl-*.svg` plus squircle backgrounds. — [src/components/brand-mark.tsx](B/src/components/brand-mark.tsx); [DESIGN.md](B/DESIGN.md)
- `public/` contains `apple-touch-icon.png, ds-assets/filler-bg0.jpg, hermes-frames/, hermes-sprite.png, hermes.png, nous-girl-dark.png, nous-girl.png`. `assets/` contains the app icons (`icon*.png/.icns/.ico`, `icon.icon`, `appx/`). `src/assets/` contains `catalog-wing.svg`, `catalog-wing-retro.svg` and `tiers/`. — [public/](B/public); [assets/](B/assets)
- The optional chat `Backdrop` overlays `ds-assets/filler-bg0.jpg` at `opacity-[0.025] mix-blend-difference`, inverted in dark. — [src/components/Backdrop.tsx](B/src/components/Backdrop.tsx)
- The `Collapse` display font comes from `@nous-research/ui@0.19.1`, whose npm `package.json` says `"license": "MIT"` and whose description reads "the shared design system for react ui @ nous … fonts". The package ships `Collapse-{Thin,Light,Regular,Bold,…}.woff2`, `RulesExpanded-*`, `RulesCompressed-*`, `Mondwest-Regular.woff2` and `Neuebit-Bold.woff2`. — [npm registry @nous-research/ui 0.19.1](https://registry.npmjs.org/@nous-research/ui/0.19.1)
- The empty chat uses the `Wordmark` (Collapse, uppercase, `text-midground`). `boot-failure.ts` also imports `Collapse-Bold.woff2`. — [src/components/chat/wordmark.tsx](B/src/components/chat/wordmark.tsx); [src/lib/boot-failure.ts](B/src/lib/boot-failure.ts)
- `src/plugins/hermes-bots/LICENSE` is a separate license file inside the desktop tree (not read). — [src/plugins/hermes-bots](B/src/plugins/hermes-bots)
- Preset docs: `nous` is "the canonical Hermes desktop identity". `.arc-nous` is the "Nous Portal hero" arc (`#4f8cff` to `#ff8c42`). `.btn-arc` is a multicolor gradient (`#5b6cff → #8b5cf6 → #d946ef → #fb7185 → #fb923c`). — [src/themes/presets.ts](B/src/themes/presets.ts); [src/styles.css](B/src/styles.css)

### Inferences
- An MIT tag on an npm package does not by itself grant rights to redistribute third-party typefaces bundled inside it. Mondwest and NeueBit look like Pangram Pangram foundry faces, and the provenance of Collapse and Rules is unknown. Treat all of them as non-portable. Pheme needs no display font beyond its own wordmark anyway.
- The `#0053fd` "Nous blue" is a brand color. Using it as Pheme's accent would read as Hermes branding. Pheme should keep its own accent (the gold target already differs).
- The "Classic Hermes" palette values are only hex numbers, but the label is Hermes-named; Pheme should rename it.

### Gaps
- I did not verify the licenses of the fonts inside `@nous-research/ui`; no license file for them exists in the tarball, only the package-level MIT field. I did not read `src/plugins/hermes-bots/LICENSE`.
- I did not confirm Codicons licensing from the repo (my understanding is MIT code with CC-BY-4.0 icons, which needs attribution). Check the `@vscode/codicons` package LICENSE before shipping.
