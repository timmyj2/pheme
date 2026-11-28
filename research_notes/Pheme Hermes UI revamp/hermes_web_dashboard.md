# Hermes Agent Web Dashboard (web/ "Dashboard" and the browser "Webapp")

Source baseline: shallow clone of `NousResearch/hermes-agent` at commit `5688461d66fadd3ce3d6ed6bccccd958c7370eae` (committed 2026-11-27 18:26 -0600), read on 2026-11-28. Source was only read: no scripts, builds or installs were run. The repo LICENSE is MIT, "Copyright (c) 2025 Nous Research".

The links below use this base: `GH = https://github.com/NousResearch/hermes-agent/blob/5688461d66fadd3ce3d6ed6bccccd958c7370eae`. The docs page is https://hermes-agent.nousresearch.com/docs/user-guide/features/web-dashboard (same text as `website/docs/user-guide/features/web-dashboard.md` in the repo).

## Q1. Where the web dashboard lives and how it is launched

### Takeaway
There are two browser front-ends, and the difference matters for Pheme.
- **(a) The Web Dashboard** is the legacy admin panel. It lives in the monorepo folder `web/` (Vite + React SPA). The FastAPI backend is in `hermes_cli/web_server.py` plus `hermes_cli/web_routers/*.py`. You launch it with `hermes dashboard`, which serves `http://127.0.0.1:9119`. Its Chat tab embeds the real TUI over a PTY, rendered with xterm.js.
- **(b) The "Webapp"** is the Desktop renderer (`apps/desktop`) compiled for the browser into `apps/desktop/dist-webapp`. The gateway serves it on port 9120 when you run `hermes webapp`. The docs say explicitly that it is "not the Web Dashboard". Hermes Cloud's dashboard shows a "Your dashboard is moving to the Hermes web app" retirement modal.

### Cited Findings
- `web/README.md` calls it "Browser-based dashboard for managing Hermes Agent configuration, API keys, and monitoring active sessions." The stack is Vite + React 19 + TypeScript + Tailwind v4 with shadcn-style hand-rolled components. — [web/README.md](GH/web/README.md)
- `hermes dashboard` on port 9119 serves the **built** bundle from `hermes_cli/web_dist/`. In dev, Vite proxies `/api` to `127.0.0.1:9119`. The build output goes into the Python package via `pyproject.toml` package-data. — [web/README.md](GH/web/README.md)
- `web/AGENTS.md` maps the pieces: backend routers are `hermes_cli/web_routers/*.py`, "one file per dashboard surface, mounted by `hermes_cli/web_server.py`". The frontend is `web/src/`. The shared JSON-RPC/WS client is `apps/shared` (`@hermes/shared`), "also used by the desktop". — [web/AGENTS.md](GH/web/AGENTS.md)
- CLI flags: `--port` (default 9119), `--host` (default 127.0.0.1), `--no-open`, `--isolated`. `--insecure` is now a no-op. Any non-loopback bind engages an auth gate that fails closed unless a provider is configured (username/password, OAuth/Nous Portal, OIDC or session token). — [Docs: Web Dashboard](https://hermes-agent.nousresearch.com/docs/user-guide/features/web-dashboard)
- The dashboard is "machine-level": one server manages every profile. A sidebar profile switcher sets the target, the selection lives in the URL as `?profile=<name>`, and an amber banner names the managed profile whenever it is not the dashboard's own. — [Docs: Web Dashboard](https://hermes-agent.nousresearch.com/docs/user-guide/features/web-dashboard)
- `dashboard` and `serve` share `cmd_dashboard`/`start_server`. `serve` is the headless backend the desktop app spawns, with the SPA disabled. "The desktop has no build/runtime dependency on this frontend." — [web/AGENTS.md](GH/web/AGENTS.md)
- Surface policy table: `hermes_cli/web_server_surface.py` defines the surfaces `serve`, `dashboard`, `gateway` and `webapp`. Only `webapp` gets `desktop_plugins`, `ui_preferences`, `gateway_connections`, `browser_files` and `host_terminal`. — [web_server_surface.py](GH/hermes_cli/web_server_surface.py)
- `hermes_cli/webapp.py` describes itself as "Build and launch plumbing for the browser-hosted Desktop workspace… never creates a second HTTP/WebSocket stack". The bundle dir is `apps/desktop/dist-webapp`. — [hermes_cli/webapp.py](GH/hermes_cli/webapp.py)
- The Desktop docs describe the Webapp: "The gateway can serve this workspace to a normal browser: sessions, profiles, Capabilities, Messaging, Artifacts, scheduled jobs, the host file tree, Git review, previews and the terminal rail. This is **not the Web Dashboard**." Setup is `hermes config set webapp.enabled true; hermes gateway restart; hermes webapp`, which serves `http://127.0.0.1:9120`. Sign-in uses a one-use link valid for 60 seconds. — [desktop.md](GH/website/docs/user-guide/desktop.md); [cli-commands.md](GH/website/docs/reference/cli-commands.md)
- Config defaults: `"webapp": {"enabled": False, "host": "127.0.0.1", "port": 9120, "public_url": ""}`. — [config_defaults.py](GH/hermes_cli/config_defaults.py)
- The retirement notice appears only on the Hermes Cloud dashboard. The `DashboardMovingModal` docblock reads: "Hermes Cloud's 'your dashboard is moving' notice… The backend sets `webapp_state` only on a Hermes Cloud agent's signed-in dashboard… a local dashboard never gets it." The i18n strings are "Legacy dashboard / Retirement" and "This dashboard moves to the Hermes web app on {date}". — [DashboardMovingModal.tsx](GH/web/src/components/DashboardMovingModal.tsx); [i18n/en.ts](GH/web/src/i18n/en.ts)
- Third-party coverage describes the dashboard as a browser admin panel replacing CLI workflows, and reports on the Profile Builder flow. — [AlphaSignal](https://alphasignal.ai/news/nous-research-s-hermes-agent-ditches-cli-for-a-full-browser-admin-panel); [MarkTechPost](https://www.marktechpost.com/?p=80441The)

### Inferences
- The local `web/` dashboard is still shipped and maintained: many recent pages, tests and 19 locales. But the strategic browser UI is now the Webapp, which is the Desktop renderer, and the hosted Cloud dashboard is being retired in its favour. If Pheme wants to look like "Hermes in a browser", it has two choices:
  - Model the overall frame on the Desktop/Webapp, which the other researchers cover.
  - Borrow admin/settings-page patterns from `web/`.
- The doc's "Status" landing page section is stale. In code, `/` redirects to `/sessions`, and Status content (gateway platforms and recent sessions) became the Sessions page "Overview" tab plus a sidebar status strip. See Q3.

### Gaps
- I found no official public announcement with a retirement date. The date is injected at runtime (`DashboardMovingModal.tsx` holds a constant I did not read in full).
- I did not verify whether an official Nous-hosted instance of the dashboard exists outside "Hermes Cloud".

## Q2. Tech stack and packages shared with the desktop app

### Takeaway
The dashboard is a React 19 + react-router 8 + Tailwind v4 SPA built on Nous's design-system npm package `@nous-research/ui` (0.19.1, MIT-declared), plus lucide icons and xterm.js. The only thing it shares with the desktop is `@hermes/shared` (`apps/shared`): the gateway/JSON-RPC client, formatting helpers, and a single theme-preset palette table. The desktop has its own token system (Radix, codicons, `--dt-*` variables) and does not use the DS `globals.css`.

### Cited Findings
- `web/package.json` dependencies:
  - Core: `@hermes/shared: workspace:*`, `@nous-research/ui: 0.19.1`, `react 19.3.0`, `react-router 8.4.0`, `tailwindcss 4.3.3`, `lucide-react 0.577.0`, `class-variance-authority`, `clsx`, `tailwind-merge`, `motion 12.43.0`, `qrcode`.
  - xterm: `@xterm/xterm 6.0.0` plus the fit, unicode11, web-links and webgl addons.
  - Also present: `@observablehq/plot`, `@react-three/fiber`, `gsap`, `leva` and `unicode-animations`.
  - Dev: Vite 8.3.4, `babel-plugin-react-compiler`, vitest. — [web/package.json](GH/web/package.json)
- `@observablehq/plot`, `three`/`@react-three/fiber`, `gsap` and `leva` are not imported by dashboard pages. They appear only in `plugins/sdk.d.ts` and the DS peerDependencies, so they exist for the DS and for plugins. — [plugins/sdk.d.ts](GH/web/src/plugins/sdk.d.ts); [pnpm-lock.yaml](GH/pnpm-lock.yaml)
- DS components used, by import count: button 46, spinner 30, card 28, badge 26, input 23, toast 18, label 18, select 13, typography/h2 8, switch 8, list-item 8, confirm-dialog 8, dialog 6, checkbox 6, segmented 3, stats 2, command-block 2, bottom-sheet 2, tabs, separator, selection-switcher. Hooks used: `use-toast`, `use-confirm-delete`, `use-below-breakpoint`. — grep over [web/src](GH/web/src)
- npm registry: `@nous-research/ui` 0.19.1 has `license: "MIT"` and the description "the shared design system for react ui @ nous. components, hooks, utils, fonts, overlays, etc." The latest dist-tag is 1.5.2 (July 2026), so the dashboard pins an old 0.x. — [npm registry](https://registry.npmjs.org/@nous-research%2fui/0.19.1)
- `@hermes/shared` exports gateway-client, json-rpc-channel, gateway-events/types, format, fuzzy, i18n, slash, reasoning-effort, theme-presets, skin and usage-tick, among others. — [apps/shared/package.json](GH/apps/shared/package.json)
- `apps/shared/src/theme-presets.ts` calls itself "the single source of truth shared by the desktop app (which layers OKLCH synthesis, terminal palettes and typography on top) and the web dashboard (which projects each preset down to its 3-slot background/midground/foreground model via `webPresetFromShared`)". Shared preset keys are github, nous, catppuccin, everforest, solarized, nous-alt, midnight, ember, mono, cyberpunk and slate. — [theme-presets.ts](GH/apps/shared/src/theme-presets.ts); [web/src/themes/presets.ts](GH/web/src/themes/presets.ts)
- The desktop `styles.css` imports `tailwindcss`, `@tailwindcss/typography`, `tw-shimmer`, katex and `@vscode/codicons`, and defines `--dt-midground`/`--theme-midground` (for example `#0053fd`). Its only `@nous-research/ui` references are the `Collapse-Bold` font plus one root import. The desktop also uses `radix-ui 1.7.0`. — [apps/desktop/src/styles.css](GH/apps/desktop/src/styles.css); [apps/desktop/package.json](GH/apps/desktop/package.json)
- Plugin SDK: `window.__HERMES_PLUGIN_SDK__` exposes React, hooks, `api`, `fetchJSON`, `authedFetch`, `buildWsUrl` and DS components (Card, Badge, Button, Dialog…). Plugins call `window.__HERMES_PLUGINS__.register(name, Component)`. — [plugins/registry.ts](GH/web/src/plugins/registry.ts)
- Auth: the server injects `window.__HERMES_SESSION_TOKEN__` into the HTML. REST calls and the `/api/pty?token=` WS all use that same ephemeral token. A gated mode switches to cookies plus single-use WS tickets. — [lib/api.ts](GH/web/src/lib/api.ts); [web/AGENTS.md](GH/web/AGENTS.md)

### Inferences
- The dashboard and desktop share **data/protocol code and palette hexes**, not components or CSS tokens. Matching "Hermes desktop" visually will not come from copying `web/`, and the reverse also holds.
- Pheme's existing stack, if React + Tailwind, could mirror the dashboard's token layering: a 3-layer palette mapped onto shadcn-compat tokens. It should not depend on `@nous-research/ui`, which is Nous-branded and bundles fonts.

### Gaps
- I did not inspect the `@nous-research/ui` tarball contents (not installed). Licensing of the fonts bundled inside it is unverified; see Q4.

## Q3. Pages and features: layout and components

### Takeaway
The app is a left-sidebar shell with about 20 lazy-loaded routes. Default order: Chat, Sessions, Files, Analytics, Models, Logs, Cron, Skills, Plugins, MCP, Channels, Webhooks, Pairing, Profiles, Config, Keys, System, Documentation. Plugin tabs appear in a separate "Plugins" nav group; bundled plugins are Kanban and Achievements. Every page uses a shared page header (title, after-title badge, right-side actions) and is built from Card/Badge/Segmented/Stats primitives. There is no dedicated Memory page: memory sits under System. "Agents" are Profiles.

### Cited Findings: shell
- Routes in `BUILTIN_ROUTES_CORE`: `/` redirects to `/sessions`. The rest are `/sessions`, `/files`, `/analytics`, `/models`, `/logs`, `/cron`, `/skills`, `/plugins`, `/mcp`, `/pairing`, `/channels`, `/webhooks`, `/system`, `/profiles`, `/profiles/new`, `/config`, `/env`, `/docs`. `/chat` is rendered persistently outside `<Routes>`. — [App.tsx](GH/web/src/App.tsx)
- Persistent chat host: "Chat is rendered persistently (outside <Routes>)… so the PTY child, WebSocket, and xterm instance survive when the user visits another tab… A `display:none` toggle hides the terminal without unmounting. The host itself is still deferred until the first /chat visit." — [App.tsx](GH/web/src/App.tsx)
- Sidebar (`<aside id="app-sidebar">`):
  - Size and motion: `w-64`, collapsing to `lg:w-14`, with collapse state persisted to `localStorage` key `hermes-sidebar-collapsed`. Width animates over 300 ms on `cubic-bezier(0.23,1,0.32,1)`. On mobile it is a fixed slide-in drawer over a `bg-black/70` scrim, with a 56px (`h-14`) mobile top bar.
  - Contents, top to bottom:
    - an `h-14` header with the stacked "HERMES / AGENT" wordmark (`font-bold text-[1.125rem] leading-[0.95] tracking-[0.0525rem] uppercase`) and a collapse button;
    - `ProfileSwitcher`;
    - nav;
    - `CockpitSidebarSlot`;
    - `SidebarSystemActions`, a status strip with "Gateway Status: Off" / "Active Sessions: N" and buttons "Restart Gateway" and "Update Hermes";
    - theme and language switchers;
    - `AuthWidget`;
    - `SidebarFooter` (version on the left, "Nous Research" on the right).
  - Collapsed items show portal tooltips. — [App.tsx](GH/web/src/App.tsx); screenshot [admin-sessions.png](GH/website/static/img/dashboard/admin-sessions.png)
- Nav item style: `px-5 py-2.5 font-sans text-display uppercase text-sm tracking-[0.12em]`, with 14px (`h-3.5`) lucide icons.
  - Active: `text-midground` plus a 1px left bar (`absolute left-0 w-px bg-midground`).
  - Inactive: `text-text-secondary`.
  - Hover: a 5%-opacity midground wash inset `left-1.5 right-1.5`. — [App.tsx](GH/web/src/App.tsx)
- Main column: `px-3 sm:px-6`, `pt-2 sm:pt-4 lg:pt-6`; the chat route uses tighter padding. Plugin slots render at `backdrop`, `header-left/right`, `header-banner`, `pre-main`, `post-main`, `overlay`, `footer-left/right`, plus page-scoped slots (`sessions:top`, `cron:bottom`, …). `ShellNotices` holds banners for memory/disk pressure, metrics consent, multiplex and similar. — [App.tsx](GH/web/src/App.tsx); [plugins/slots.ts](GH/web/src/plugins/slots.ts)
- Page header: `PageHeaderProvider` holds a sticky header row per page. Pages call `usePageHeader()` with `setAfterTitle(<Badge/>)` and `setEnd(<actions/>)`. The h1 uses `font-expanded`, sentence case. — [PageHeaderProvider.tsx](GH/web/src/contexts/PageHeaderProvider.tsx); [FilesPage.tsx](GH/web/src/pages/FilesPage.tsx); [web/README.md](GH/web/README.md)
- Profile scope: `ProfileKeyedRoutes` remounts the whole route tree when the managed profile changes, so pages refetch and writes can't target a stale profile. — [App.tsx](GH/web/src/App.tsx)

### Cited Findings: pages
- **Chat (`/chat`, ChatPage.tsx)**
  - xterm.js (WebGL) runs the real `hermes --tui` over the `/api/pty` WebSocket. Resize is sent in-band as `\x1b[RESIZE:<cols>;<rows>]`. "Do not re-implement the primary chat experience in React."
  - A right rail `lg:w-60` holds `ChatSidebar` (model badge/picker, live connection badge) above `ChatSessionList` (recent sessions with title, relative time, message count and source; "New chat"; refresh) and a workspace picker (projects plus discovered git repos, "Other path…").
  - The rail collapses, and on mobile becomes a slide-over titled "MODEL / & TOOLS". — [web/AGENTS.md](GH/web/AGENTS.md); [ChatPage.tsx](GH/web/src/pages/ChatPage.tsx); [ChatSidebar.tsx](GH/web/src/components/ChatSidebar.tsx); [Docs](https://hermes-agent.nousresearch.com/docs/user-guide/features/web-dashboard)
- **Sessions (`/sessions`, SessionsPage.tsx, 2158 lines)**
  - Header: "Prune old sessions" button.
  - Stats bar: Total, Active in store, Archived, Messages, plus per-source chips.
  - Filters: a `Segmented` control Chats / Automation / All; a source dropdown; an Overview/History `Segmented` toggle; FTS5 search with `>>>`/`<<<` snippet highlighting.
  - Overview view (5 s poll): `PlatformsCard` (gateway platforms) and a "Recent sessions" card.
  - History view: paginated rows with a source icon, title, model, message count and relative time; a "Live" badge; a source badge; rename/export/delete icons; multi-select bulk delete; "Delete empty"; and "Resume in Chat" (play icon, opens `/chat?resume=<id>`).
  - Expanding a row shows the role-coded Markdown transcript with collapsible tool calls and structured reasoning. — [SessionsPage.tsx](GH/web/src/pages/SessionsPage.tsx); [en.ts sessions](GH/web/src/i18n/en.ts); [admin-sessions.png](GH/website/static/img/dashboard/admin-sessions.png)
- **Files (`/files`)**: a managed file browser with a path badge in the header, upload by drag-and-drop or picker, new folder, delete with confirmation, and an optional lock to a root (`can_change_path`). — [FilesPage.tsx](GH/web/src/pages/FilesPage.tsx)
- **Analytics (`/analytics`)**: a 7/30/90-day period selector and `Stats` summary cards (total tokens in/out, sessions with a per-day average, API calls, cost). The chart is a hand-rolled flexbox stacked bar chart (`TokenBarChart`) using CSS vars `--series-input-token` (cream `#ffe6cb`) and `--series-output-token` (`#34d399`), with hover tooltips. Below it are sortable tables: Daily breakdown, Per-model, and Top Skills (loads, edits, last used). — [AnalyticsPage.tsx](GH/web/src/pages/AnalyticsPage.tsx); [index.css](GH/web/src/index.css)
- **Models (`/models`)**: model cards with a TokenBar, capability badges and a "Use as" menu (main/auxiliary), a model picker dialog, an auxiliary-tasks modal, an MoA (mixture-of-agents) models modal, a settings panel, and a reload-confirm dialog. — [ModelsPage.tsx](GH/web/src/pages/ModelsPage.tsx)
- **Logs (`/logs`)**: selects for file (agent/errors/gateway), level, component and lines (50 to 500); auto-refresh every 5 s; severity-coloured lines (`lib/log-classify.ts`). — [LogsPage.tsx](GH/web/src/pages/LogsPage.tsx); [Docs](https://hermes-agent.nousresearch.com/docs/user-guide/features/web-dashboard)
- **Cron (`/cron`, 1294 lines)**
  - "New Cron Job" form: name, prompt or script-only mode, and a `ScheduleBuilder` with modes Every interval / Daily / Weekly / Monthly / Once / Custom cron, previewed as "Sends as …".
  - Delivery target: Local / Telegram / Discord / Slack / Email, with a "set a home channel first" hint.
  - Job list: schedule described in plain language ("Weekly on Mon at 09:00"), state badge, last/next run with "Overdue since", and Pause / Resume / Trigger now / Edit / Delete.
  - A stale-scheduler banner reads "Scheduler last ticked {when}…".
  - An `AutomationBlueprints` gallery of expandable template cards with typed fields that POST to `/api/cron/blueprints/instantiate`. Jobs are aggregated across profiles with a filter. — [CronPage.tsx](GH/web/src/pages/CronPage.tsx); [AutomationBlueprints.tsx](GH/web/src/components/AutomationBlueprints.tsx); [en.ts cron](GH/web/src/i18n/en.ts)
- **Skills (`/skills`, 1669 lines)**
  - Left filter panel: All (n) / Toolsets (n) / Browse hub, plus category pills.
  - Right side:
    - skill rows with toggles;
    - a `SkillEditorDialog`;
    - a `ToolsetConfigDrawer`;
    - hub search with trust and scan-verdict badges and a ScanPanel;
    - Install with a live log;
    - "Update all".
  - The header shows "0/0 enabled" and a search box. — [SkillsPage.tsx](GH/web/src/pages/SkillsPage.tsx); [admin-skills-hub.png](GH/website/static/img/dashboard/admin-skills-hub.png)
- **Plugins / MCP / Channels / Webhooks / Pairing**
  - Plugins: management with "Update all".
  - MCP: your servers (add HTTP/SSE or stdio, enable/disable, Test, remove) plus a one-click catalog.
  - Channels: every messaging platform with live status, per-platform config forms, enable toggle, Test and Restart gateway; Telegram and WhatsApp have onboarding panels with QR codes.
  - Webhooks: create, enable/disable, one-time HMAC secret.
  - Pairing: pending/approved messaging users. — [Docs](https://hermes-agent.nousresearch.com/docs/user-guide/features/web-dashboard); [ChannelsPage.tsx](GH/web/src/pages/ChannelsPage.tsx)
- **Profiles (`/profiles`, `/profiles/new`)**: profile cards (model/provider, skill count, gateway state, active/default/alias badges) with a per-card "⋯" actions menu (set active, model, description, SOUL, copy command, rename, delete). The full-page Profile Builder covers identity, model, MCPs and skills, and ends with a creation receipt. — [ProfilesPage.tsx](GH/web/src/pages/ProfilesPage.tsx); [ProfileBuilderPage.tsx](GH/web/src/pages/ProfileBuilderPage.tsx)
- **Config (`/config`)**: a form editor auto-generated from the backend schema (`AutoField`). Toolbar: the config path, then download, upload and reset icons, a "YAML" toggle (raw view) and a filled "SAVE" button. Below are a left "Filters / Sections" list with field counts (General 15, Agent 35, Terminal 21, Display 50, Memory 5, …) and a right card per section with uppercase field labels, help text and inputs. — [ConfigPage.tsx](GH/web/src/pages/ConfigPage.tsx); [admin-config.png](GH/website/static/img/dashboard/admin-config.png)
- **Keys (`/env`)**: `.env` management grouped as LLM Providers / Tool API Keys / Messaging / Agent Settings. Each key shows a set/unset state, a redacted preview, a description, a signup link and set/clear controls; an advanced toggle reveals more; OAuth provider cards are included. — [EnvPage.tsx](GH/web/src/pages/EnvPage.tsx); [Docs](https://hermes-agent.nousresearch.com/docs/user-guide/features/web-dashboard)
- **System (`/system`, 1673 lines)**: sections Host (OS, arch, CPU, memory, disk, uptime, load in a 3-column key/value grid), Nous Portal, Skill curator, Gateway start/stop/restart, Memory (provider picker, reset `MEMORY.md`/`USER.md`), Credential pool, Operations (doctor, audit, backup/restore… each streams a live log via `ActionLogViewer`), Checkpoints, Shell hooks, and Backend migration. — [SystemPage.tsx](GH/web/src/pages/SystemPage.tsx); [admin-system-top.png](GH/website/static/img/dashboard/admin-system-top.png)
- **Docs (`/docs`)**: an iframe of `https://hermes-agent.nousresearch.com/docs/`. — [DocsPage.tsx](GH/web/src/pages/DocsPage.tsx)
- **Bundled plugin tabs**: `kanban` ("Multi-agent collaboration board", `after:skills`) and `hermes-achievements` ("Steam-style achievements", `after:analytics`). Each ships a manifest with `entry` `dist/index.js` and a `plugin_api.py` backend. — [kanban manifest](GH/plugins/kanban/dashboard/manifest.json); [achievements manifest](GH/plugins/hermes-achievements/dashboard/manifest.json)

### Inferences
- Concept mapping for Pheme's features:

  | Pheme concept | Hermes dashboard location |
  |---|---|
  | Sessions | Sessions page, plus the Chat rail switcher |
  | Skills | Skills page |
  | Memory | System → Memory section |
  | Scheduled jobs | Cron page |
  | Agents | Profiles page |
  | Settings | Config page + Keys page |
  | Logs | Logs page |
  | Usage | Analytics + Models pages |
  | Gateways/bots | Channels, Pairing, Webhooks pages + System → Gateway |

### Gaps
- I did not read Plugins, MCP, Webhooks, Pairing or EnvPage source in detail. Their descriptions rely on the official docs.
- The screenshots in the docs are from v0.15.1/v0.16.0 and show an older textured backdrop. The current shell renders a plain `bg-background-base`, with the backdrop available only as a plugin slot.

## Q4. Visual language vs desktop, and assets not to port

### Takeaway
The dashboard has a "brand terminal" look:
- Default theme "Hermes Teal": background `#041c1c`, cream midground `#ffe6cb`.
- Square-ish 1px `border-current/20` hairlines and uppercase letter-spaced nav (`tracking-[0.12em]`).
- Oswald headings, Mona Sans body, Mondwest for themed chrome and body, JetBrains Mono for the terminal.
- A 15px base size and comfortable density.

The desktop is a VS Code-like app (codicons, Radix, its own `--dt-*` tokens, light and dark). The two share only palette hexes. Several Nous brand assets must not be ported.

### Cited Findings
- Palette tokens in `:root`:
  - `--background-base: #041c1c`, `--midground-base: #ffe6cb`, `--foreground` white at alpha 0.
  - Comment: "LENS_0 — from design-language/src/ui/components/overlays".
  - Shadcn-compat tokens are derived with `color-mix`: `--color-card` = midground 4% over background, secondary 6%, muted 8%, accent 10%, border/input = midground 15% transparent.
  - Fixed colours: destructive `#fb2c36`, success `#4ade80`, warning `#ffbd38`.
  - Radius `--theme-radius: 0.5rem` (sm/md/lg/xl = −4/−2/0/+4 px).
  - Type: `--theme-base-size: 15px`, line-height 1.55.
  - Density works through `--spacing: calc(0.25rem * var(--theme-spacing-mul))`. — [index.css](GH/web/src/index.css)
- Fonts: `index.html` loads Mona Sans (200–900) and Oswald (200–700) from Google Fonts. `--font-rules-compressed`/`-expanded` are repointed to Oswald. Mondwest is self-hosted at `/fonts/Mondwest-Regular.woff2`. JetBrains Mono is bundled for the terminal (Apache-2.0). The DS `fonts.css` is "deliberately NOT imported: it would bundle the Collapse and Rules faces". — [index.css](GH/web/src/index.css); [index.html](GH/web/index.html); [web/public](GH/web/public)
- Typography rules from the README:
  - Minimum text size is `text-xs` (12px).
  - Never put opacity below 0.7 on text, and never stack alpha tokens.
  - Use the semantic tokens `text-text-primary/secondary/tertiary/disabled/on-accent`.
  - Brand uppercase comes from `text-display` on chrome only.
  - Font tiers: brand chrome `font-mondwest text-display`, themed body `font-mondwest normal-case`, page h1 `font-expanded`, technical `font-mono-ui`. — [web/README.md](GH/web/README.md)
- Themes:
  - Presets: Hermes Teal, Hermes Teal (Large), Nous Blue (`#E8F2FD` bg / `#0053FD`, the only light theme), Midnight, Ember, Mono, Cyberpunk, Rosé.
  - The theme model has three layers: palette (bg/mid/fg), typography (fonts, `fontUrl`, base size), and layout (radius, density compact 0.85 / comfortable 1.0 / spacious 1.2).
  - `layoutVariant` takes `standard | cockpit | tiled`.
  - Optional fields: `colorOverrides`, `customCSS`, `componentStyles` (CSS vars such as `--component-sidebar-clip-path`).
  - User YAML themes are supported. — [themes/types.ts](GH/web/src/themes/types.ts); [themes/presets.ts](GH/web/src/themes/presets.ts); [Docs](https://hermes-agent.nousresearch.com/docs/user-guide/features/web-dashboard)
- Desktop contrasts: `styles.css` imports codicons, katex, `@tailwindcss/typography` and `tw-shimmer`, and uses `--dt-midground`, `--theme-midground: #0053fd` and `--ui-accent`. The titlebar uses 24×24 icon hit targets. — [apps/desktop/src/styles.css](GH/apps/desktop/src/styles.css)
- Brand assets in the repo:
  - `assets/nous-girl-black.svg`, `assets/nous-girl-white.svg`, `assets/banner.png`, `assets/icon-master*.svg`, `assets/backgrounds/`.
  - The footer reads "Nous Research"; the wordmark reads "Hermes Agent".
  - `index.html` title is "Hermes Agent - Dashboard".
  - The "Nous Blue" theme is described as "Nous-branded blue accents". — [assets/](GH/assets); [en.ts](GH/web/src/i18n/en.ts); [Docs](https://hermes-agent.nousresearch.com/docs/user-guide/features/web-dashboard)
- `@nous-research/ui` declares MIT on npm, but describes itself as including "fonts, overlays". The dashboard avoids bundling its Collapse and Rules faces. — [npm registry](https://registry.npmjs.org/@nous-research%2fui/0.19.1); [index.css](GH/web/src/index.css)

### Inferences
- Visual differences, dashboard vs desktop:
  - Frame: the dashboard is a plain browser page with a left 256px sidebar and no titlebar. The desktop has a custom titlebar and app chrome.
  - Nav: the dashboard uses uppercase tracked text links with a 1px active rule. The desktop uses VS Code-style icon/codicon chrome.
  - Density: the dashboard is roomy, with a 15px base and large paddings (`px-5 py-2.5` nav rows, `p-4`/`p-6` cards).
  - Tokens: the dashboard derives everything from two colours via `color-mix`. The desktop has a full OKLCH-synthesised token set.
- Assets not to port into Pheme:
  - **Brand identity:** the "Hermes Agent" and "Nous Research" names, the Nous girl SVGs, the banner, the icons, the "Nous Blue" theme, and the "LENS_0" overlays.
  - **Mondwest font:** this is likely Pangram Pangram's commercial "PP Mondwest". It is unverified in-repo, so treat it as non-MIT.
  - **DS-bundled Collapse and Rules fonts**, plus the `@nous-research/ui` brand components themselves.
- What is safe to reuse as ideas or code: the MIT repo code patterns, JetBrains Mono (Apache-2.0), and Oswald and Mona Sans (OFL via Google Fonts).

### Gaps
- I could not confirm Mondwest's licence from repo text. No licence file sits next to `web/public/fonts/Mondwest-Regular.woff2`.
- I could not confirm font licences inside the `@nous-research/ui` tarball.

## Q5. UX patterns worth porting to a single-user local web app (Pheme on 127.0.0.1)

### Takeaway
The most transferable patterns are:
- a collapsible left nav with the collapse state persisted and tooltips in the collapsed state;
- a per-page header context (title + after-title badge + actions);
- a persistent, never-unmounted chat host behind `display:none`;
- a sidebar status strip with one-click system actions;
- Sessions with a Chats/Automation/All segmented filter, FTS snippet search, Overview/History toggle, inline rename/export/delete, bulk select and "resume in chat";
- a human-language schedule builder with "Sends as" preview, overdue/stale-scheduler warnings and blueprint templates;
- schema-driven config with a section list and counts, plus a YAML toggle;
- live action logs for long operations;
- a loopback-only ephemeral session token injected into HTML.

### Cited Findings
- Loopback default with no login. A non-loopback bind requires an auth provider, and the server refuses to start otherwise. A single injected session token covers REST and WS, and since browsers can't set headers on a WS upgrade the token goes in a query param. — [Docs](https://hermes-agent.nousresearch.com/docs/user-guide/features/web-dashboard); [web/AGENTS.md](GH/web/AGENTS.md)
- Lazy route loading keeps the shell light. The chat chunk loads only on the first `/chat` visit, then stays mounted. — [App.tsx](GH/web/src/App.tsx)
- URL-carried scope (`?profile=`) survives refresh and deep links. The route tree is keyed by scope so it remounts on change. An amber banner shows the write target. — [Docs](https://hermes-agent.nousresearch.com/docs/user-guide/features/web-dashboard); [App.tsx](GH/web/src/App.tsx)
- Resource banners show one at a time, the most severe first. Dismissal is scoped to the current boot and re-opens on escalation. — [Docs](https://hermes-agent.nousresearch.com/docs/user-guide/features/web-dashboard)
- Cron UX details: `ScheduleBuilder` modes with a human-readable description; "Overdue since"; the "Scheduler last ticked {when}" banner; a "set a home channel first" delivery hint; script-only mode validation copy. — [en.ts](GH/web/src/i18n/en.ts); [ScheduleBuilder.tsx](GH/web/src/components/ScheduleBuilder.tsx)
- Sessions polls every 5 s for the overview. Search results auto-scroll to the first hit. Bulk delete skips sessions with a running turn ("{deleted} deleted; {count} kept because a turn is running"). — [SessionsPage.tsx](GH/web/src/pages/SessionsPage.tsx); [en.ts](GH/web/src/i18n/en.ts)
- Accessibility and legibility rules: a 12px minimum, a text opacity floor of 0.7, semantic text tokens, `aria-busy` route fallbacks, and a `SidebarTargetSize` test for hit targets. — [web/README.md](GH/web/README.md); [App.tsx](GH/web/src/App.tsx)
- Extensibility: plugin tabs with `position: after:<route>`, shell and page-scoped slots, and theme YAML with density, radius and fonts. — [plugins/slots.ts](GH/web/src/plugins/slots.ts); [themes/types.ts](GH/web/src/themes/types.ts)

### Inferences
- For Pheme on a single-user loopback setup, the auth gate, multi-profile switcher, pairing and channels are likely overkill. The token-in-HTML pattern and loopback-only binding are worth copying.
- The dashboard's chat is a terminal (xterm over PTY). If Pheme renders chat natively in React, the Desktop/Webapp renderer is the better reference for chat, and `web/` for admin pages.
- The density token (`--theme-spacing-mul` scaling the Tailwind `--spacing`) is a cheap way to offer compact/comfortable/spacious modes.

### Gaps
- I did not measure runtime performance or verify mobile behaviour live, because nothing was run.

## Key file paths (all under repo root, commit 5688461)
- Shell/nav/routes: `web/src/App.tsx`
- Tokens/fonts: `web/src/index.css`, `web/index.html`, `web/public/fonts/`, `web/public/fonts-terminal/`
- Themes: `web/src/themes/{types,presets,context,fonts}.ts(x)`; shared palette: `apps/shared/src/theme-presets.ts`
- Page header: `web/src/contexts/PageHeaderProvider.tsx`, `usePageHeader.ts`
- Profile scope: `web/src/contexts/ProfileProvider.tsx`, `web/src/components/ProfileSwitcher.tsx`, `ProfileScopeBanner.tsx`
- Sidebar parts: `web/src/components/{SidebarFooter,SidebarStatusStrip,CockpitSidebarSlot,ThemeSwitcher,LanguageSwitcher,AuthWidget,ShellNotices,MemoryPressureBanner}.tsx`, `web/src/hooks/useSidebarStatus.ts`
- Pages: `web/src/pages/{Chat,Sessions,Files,Analytics,Models,Logs,Cron,Skills,Plugins,Mcp,Channels,Webhooks,Pairing,Profiles,ProfileBuilder,Config,Env,System,Docs}Page.tsx`
- Chat rail: `web/src/components/{ChatSidebar,ChatSessionList,ChatWorkspacePicker,ModelPickerDialog}.tsx`
- Cron helpers: `web/src/components/{ScheduleBuilder,AutomationBlueprints}.tsx`, `web/src/lib/{schedule,cron-job,automation-blueprints}.ts`
- Plugin SDK: `web/src/plugins/{registry,slots,sdk.d.ts,PluginPage}.ts(x)`; bundled plugins: `plugins/kanban/dashboard/`, `plugins/hermes-achievements/dashboard/`
- API client: `web/src/lib/api.ts` (+ `api-*.ts`)
- Backend: `hermes_cli/web_server.py`, `hermes_cli/web_routers/*.py`, `hermes_cli/web_server_surface.py`, `hermes_cli/pty_bridge.py`, `hermes_cli/webapp.py`
- Docs and screenshots: `website/docs/user-guide/features/web-dashboard.md`, `extending-the-dashboard.md`, `website/static/img/dashboard/*.png`
