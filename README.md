# Pheme

A local web app for agentic work on top of [GitHub Copilot CLI](https://github.com/github/copilot-cli):
chat with a session list, skills and memory that improve themselves, and approval cards before anything risky runs.

> **Status:** v1 in progress. See [`PROGRESS.md`](PROGRESS.md) and the plan in [`docs/PLAN.md`](docs/PLAN.md).

- Runs on your own machine only (`127.0.0.1`, per-launch token), using your existing Copilot CLI sign-in.
- Ships as one ready-to-run file: `dist/pheme.mjs` plus `start-pheme.cmd`. No `npm install` where it runs.
- Works on Windows and macOS. All data lives in `~/.pheme` (`%USERPROFILE%\.pheme` on Windows).

## Quick start (work laptop)

You need Node 22.12+ and GitHub Copilot CLI, signed in (`copilot`, then `/login`).

1. Copy `pheme.mjs` and `start-pheme.cmd` into one folder (from the CI artifact or `npm run build` output in `dist/`).
2. Double-click `start-pheme.cmd`, or run `node pheme.mjs`. Your browser opens on a link that contains a one-time token.
3. If anything is off, run `start-pheme.cmd doctor`. It checks Node, Copilot CLI, sign-in, network to GitHub, the data folder and the models you may use.

Try it without Copilot: `node pheme.mjs --fake` (a scripted fake engine; type `steps 10`, `run ls`, `remember I like tea`).

## Using it

- **Chat**: sidebar lists chats (search, pin, archive). Shell commands and file edits show an approval card (Allow once / Allow for this chat / Deny). Settings has an Auto-approve switch, off by default.
- **Memory**: two small stores (user profile, environment) loaded into every new chat. View and edit on the Memory page.
- **Skills**: reusable procedures in `~/.pheme/skills`. After a turn with 10+ tool steps, a background review saves or patches a skill; every 10 user messages a memory review runs. Both can be turned off in Settings.
- **Ctrl+K** opens the command palette.

## Develop

```
npm install
npm run typecheck && npm run lint && npm test
npm run build          # dist/pheme.mjs
npm run smoke          # runs the built file in fake mode
node dist/pheme.mjs --fake
```

Layout: `packages/server` (engine layer, API, store, tools, loops, doctor), `packages/ui` (React UI).

## License

MIT. See [`LICENSE`](LICENSE). Portions are adapted from MIT-licensed third-party code;
see [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
