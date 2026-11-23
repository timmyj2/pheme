# Pheme

A local web app for agentic work on top of [GitHub Copilot CLI](https://github.com/github/copilot-cli):
chat with a session list, skills and memory that improve themselves, sub-agents, scheduled jobs, and approval cards before anything risky runs.

- Runs on your own machine only (`127.0.0.1`, per-launch token), using your existing Copilot CLI sign-in.
- Ships as one ready-to-run file: `pheme.mjs` plus `start-pheme.cmd`. No `npm install` where it runs.
- Works on Windows and macOS. All data lives in `~/.pheme` (`%USERPROFILE%\.pheme` on Windows), never in the repo.

## On your work computer (Windows): step by step

**One-time setup**

1. **Check Node.** Press the Windows key, type `cmd`, press Enter. In the black window type `node -v` and press Enter. You need `v22.12` or higher. If it says something older or "not recognized", ask IT for a newer Node.
2. **Install Copilot CLI (the exact version).** In the same window type:
   ```
   npm i -g @github/copilot@1.0.112
   ```
3. **Sign in to Copilot.** Type `copilot` and press Enter. When it starts, type `/login` and follow the steps in your browser. Then close it (press Ctrl+C twice).
4. **Download Pheme.** Open https://github.com/timmyj2/pheme/releases/latest, scroll to **Assets**, and click `pheme-v0.2.0.zip`.
5. **Unzip it.** Right-click the zip, choose **Extract All**, and pick a folder you'll remember, for example `C:\Users\<you>\pheme`. If Windows blocks the files, right-click the zip first, choose **Properties**, tick **Unblock**, click OK, then extract.
6. **Check everything works.** Open the unzipped `pheme-v0.2.0` folder, click its address bar, type `cmd` and press Enter. Then type `start-pheme.cmd doctor` and press Enter. Every line should say `PASS` (a `WARN` about models is fine). If a line says `FAIL`, it tells you what to fix.

**Every day**

1. Double-click `start-pheme.cmd`. A black window opens and your browser opens Pheme.
2. Leave the black window open while you use Pheme. Closing it (or pressing Ctrl+C in it) stops Pheme.
3. If the browser doesn't open, copy the `Open: http://127.0.0.1:...` link from the black window into your browser. Use that exact link, because it contains a one-time key that changes each time you start Pheme.

**Good to know**

- Pheme asks before it runs a command or edits a file. Click **Allow once**, **Allow for this chat** or **Deny**.
- Your chats, skills and memory are saved in `C:\Users\<you>\.pheme`. Nothing is sent anywhere except to Copilot.
- To update, download the newer zip and unzip it over the old folder. Your data stays where it is.
- If Pheme says your Copilot CLI is "newer than this build understands", run step 2 again.

**On your Mac or any other machine**, the steps are the same except you start it with `node pheme.mjs` instead of `start-pheme.cmd`.

Try it without Copilot: `node pheme.mjs --fake` (a scripted fake engine; type `steps 10`, `run ls`, `remember I like tea`, `parallel a|b|c`).

Options: `--port <n>`, `--no-open`, `--data-dir <path>`, `--fake`.

## What it does

- **Chat:** sidebar with search, pin and archive. Shell commands and file edits show an approval card (Allow once / Allow for this chat / Deny). Reads run without asking. Settings has an **Auto-approve all** switch, off by default.
- **Memory:** two small stores (user profile, environment) loaded into every new chat. View and edit them on the Memory page. Every 10 user messages a background review saves new facts.
- **Skills:** reusable procedures in `~/.pheme/skills`. After a turn with 10+ tool steps, a background review saves or patches a skill.
- **Skill curator:** every 7 days (while Pheme is open) overlapping skills are merged and long-unused ones archived. Nothing is deleted; archives live in `skills/.archive`.
- **Agents:** the model can start sub-agents in their own sessions (up to 3 at once) and shows each as a card. Saved agent profiles are also handed to Copilot as custom agents.
- **Scheduled jobs:** daily, every-N-minutes or one-time prompts. Jobs run only while Pheme is open; a missed job runs once at start. A job can run commands or edit files only if you allowed that when you created it.
- **Appearance:** 11 themes with light/dark/system modes. **Ctrl+K** opens the command palette. Shortcuts can be changed in Settings.
- **Projects and Git:** give a chat a project folder; Copilot works there. The **Changes** panel shows changed files and diffs, and lets you commit (you pick the files and confirm; it never commits on `main` without a new branch, and asks before committing anything that looks like a secret), undo the last commit, push, and open a pull request with the GitHub CLI (`gh`). It never force-pushes. Without `gh`, it offers a link to open the pull request on GitHub.
- **Per-chat model**, **export a chat to Markdown**, and **search inside message text**.
- **Desktop notifications** (reply ready, approval needed), **backup and restore** of all your data, and **settings search**, all in Settings.
- Background reviews use the cheapest model available (changeable in Settings), and Settings shows a usage counter. One switch turns all learning loops off.

## Develop

```
npm install
npm run typecheck && npm run lint && npm test
npm run build          # dist/pheme.mjs
npm run smoke          # runs the built file alone in an empty folder, fake mode
npm run e2e            # browser tests (Playwright); set PW_CHANNEL=chrome to use an installed Chrome
node dist/pheme.mjs --fake
```

Layout: `packages/server` (engines, API, stores, tools, loops, curator, scheduler, doctor), `packages/ui` (React UI). Decisions made while building are in [`docs/DECISIONS.md`](docs/DECISIONS.md); the plan is [`docs/PLAN.md`](docs/PLAN.md); status is in [`PROGRESS.md`](PROGRESS.md).

## License

MIT. See [`LICENSE`](LICENSE). Portions are adapted from MIT-licensed third-party code;
see [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
