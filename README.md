# Pheme

A local web app for agentic work on top of [GitHub Copilot CLI](https://github.com/github/copilot-cli):
chat with a session list, skills and memory that improve themselves, sub-agents, scheduled jobs, and approval cards before anything risky runs.

- Runs on your own machine only (`127.0.0.1`, per-launch token), using your existing Copilot CLI sign-in.
- Ships as one ready-to-run file: `pheme.mjs` plus `start-pheme.cmd`. No `npm install` where it runs.
- Works on Windows and macOS. All data lives in `~/.pheme` (`%USERPROFILE%\.pheme` on Windows), never in the repo.

## Quick start

You need **Node 22.12+** and **GitHub Copilot CLI 1.0.112**, signed in:

```
npm i -g @github/copilot@1.0.112
copilot          # then type /login
```

The version matters: the Copilot SDK built into Pheme speaks one protocol version, and a newer CLI is refused. `doctor` tells you if that happens.

1. Download `pheme-v0.1.0.zip` from the [Releases](https://github.com/timmyj2/pheme/releases) page (or take `dist/` from a CI run or `npm run build`) and unzip it into one folder.
2. Double-click `start-pheme.cmd`, or run `node pheme.mjs`. Your browser opens on a link that contains a one-time token.
3. If anything is off, run `start-pheme.cmd doctor` (or `node pheme.mjs doctor`). It checks Node, Copilot CLI, sign-in, network to GitHub, the data folder and the models you may use.

Try it without Copilot: `node pheme.mjs --fake` (a scripted fake engine; type `steps 10`, `run ls`, `remember I like tea`, `parallel a|b|c`).

Options: `--port <n>`, `--no-open`, `--data-dir <path>`, `--fake`.

## What it does

- **Chat:** sidebar with search, pin and archive. Shell commands and file edits show an approval card (Allow once / Allow for this chat / Deny). Reads run without asking. Settings has an **Auto-approve all** switch, off by default.
- **Memory:** two small stores (user profile, environment) loaded into every new chat. View and edit them on the Memory page. Every 10 user messages a background review saves new facts.
- **Skills:** reusable procedures in `~/.pheme/skills`. After a turn with 10+ tool steps, a background review saves or patches a skill.
- **Skill curator:** every 7 days (while Pheme is open) overlapping skills are merged and long-unused ones archived. Nothing is deleted; archives live in `skills/.archive`.
- **Agents:** the model can start sub-agents in their own sessions (up to 3 at once) and shows each as a card. Saved agent profiles are also handed to Copilot as custom agents.
- **Scheduled jobs:** daily, every-N-minutes or one-time prompts. Jobs run only while Pheme is open; a missed job runs once at start. A job can run commands or edit files only if you allowed that when you created it.
- **Appearance:** 11 themes with light/dark/system modes. **Ctrl+K** opens the command palette.
- Background reviews use the cheapest model available (changeable in Settings), and Settings shows a usage counter. One switch turns all learning loops off.

## Develop

```
npm install
npm run typecheck && npm run lint && npm test
npm run build          # dist/pheme.mjs
npm run smoke          # runs the built file alone in an empty folder, fake mode
node dist/pheme.mjs --fake
```

Layout: `packages/server` (engines, API, stores, tools, loops, curator, scheduler, doctor), `packages/ui` (React UI). Decisions made while building are in [`docs/DECISIONS.md`](docs/DECISIONS.md); the plan is [`docs/PLAN.md`](docs/PLAN.md); status is in [`PROGRESS.md`](PROGRESS.md).

## License

MIT. See [`LICENSE`](LICENSE). Portions are adapted from MIT-licensed third-party code;
see [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
