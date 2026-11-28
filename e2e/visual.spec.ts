/**
 * Visual capture harness (build-plan item 3). NOT part of `npx playwright test` (the default run ignores this file).
 *
 * Run:      npm run build && npm run visual        (set PW_EXECUTABLE_PATH or PW_CHANNEL like the smoke tests)
 * Output:   e2e/visual-out/<state>.png               Pheme at 1000x560, deviceScaleFactor 2, dark theme (THEME below)
 *           e2e/visual-out/compare-<state>.png       reference (left) beside Pheme (right), same height, labelled
 * States:   chat, capabilities, settings, right-panel, approval, composer. Reference shots live in docs/visual/hermes-reference/.
 *
 * It starts Pheme in fake mode on a throwaway data folder (playwright.visual.config.ts), seeds chats, skills and a throwaway
 * git repo, and fails only when a state cannot be reached, never on a visual difference. Time is frozen (page.clock),
 * animations are off (reducedMotion + injected CSS), and fonts are awaited, so captures are repeatable.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { expect, test, type Browser, type Page } from "@playwright/test";

/** The dark theme to capture (the default gold-on-navy theme). */
const THEME = "pheme-gold-dark";
const VIEWPORT = { width: 1390, height: 754 };
const TOKEN = "visual-token-0123456789abcdefghij";
const REF_DIR = path.resolve("docs/visual/hermes-reference");
const OUT = path.resolve("e2e/visual-out");
const REFERENCE: Record<string, string | undefined> = { chat: "chat.webp", capabilities: "capabilities.webp", settings: "settings.webp", "right-panel": "right-panel-files.png" };

const tid = (page: Page, id: string) => page.getByTestId(id);
const H = 3_600_000;
const D = 24 * H;
const MD_REPLY = [
  "**What I fixed while connecting the parts:**",
  "",
  "- **Leftover sign-in code:** removed the two pieces still in the phone-side code.",
  "- **Reset could undo itself:** a background sync that fired mid-reset could download everything again. Reset now signs out first, then clears the device.",
  "- **Stats and Results now refresh** when synced data arrives from another device.",
  "- **Account test setup:** the account tests now run against a real copy of the server with a throwaway database.",
  "",
  "**Test results so far:**",
  "",
  "| Test set | Result |",
  "|---|---|",
  "| Server tests | 18 of 18 pass |",
  "| Phone-side data and sync tests | 59 of 59 pass |",
  "| Account browser tests | 5 of 5 pass |",
  "| Full browser suite (all screens) | running twice now |",
  "",
  "Two reviewers are now stress-testing it:",
  "",
  "- **Security and server:** whether one family could ever see another family's data, password-guessing limits, and oversized requests.",
  "- **Real use:** upgrading existing data, two devices playing at once, and playing offline and reconnecting.",
  "",
  "Fixes for whatever they find come next. Then I'll publish.",
].join("\n");

let dataDir = "";
let hockeyDir = "";
let mainChat = "";
let base = 0;

function git(cwd: string, ...a: string[]) {
  return execFileSync("git", ["-c", "user.name=V", "-c", "user.email=v@example.com", "-c", "commit.gpgsign=false", ...a], { cwd, encoding: "utf8" }).trim();
}

interface SeedChat { title: string; ageMs: number; dir?: string; pinned?: boolean; events?: object[] }
function seedChat(c: SeedChat): string {
  const id = randomUUID();
  const ts = base - c.ageMs;
  const sessions = path.join(dataDir, "sessions");
  const events = (c.events ?? [{ type: "user", text: c.title }, { type: "message", text: "Done." }]).map((e, i) => ({ ...e, seq: i + 1, ts: ts - 60_000 + i * 1000 }));
  const meta = { id, title: c.title, pinned: !!c.pinned, archived: false, createdAt: ts - 60_000, updatedAt: ts, userMessages: 1, lastMemoryReviewAt: 0, ...(c.dir ? { projectDir: c.dir } : {}) };
  fs.writeFileSync(path.join(sessions, `${id}.meta.json`), JSON.stringify(meta));
  fs.writeFileSync(path.join(sessions, `${id}.jsonl`), events.map((e) => JSON.stringify(e)).join("\n") + "\n");
  return id;
}

async function api(page: Page, method: string, url: string, body?: unknown) {
  const r = await page.request.fetch(url, { method, headers: { "x-pheme-token": TOKEN, "content-type": "application/json" }, data: body === undefined ? undefined : JSON.stringify(body) });
  expect(r.ok(), `${method} ${url} -> ${r.status()}`).toBe(true);
  return r;
}

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400); // let layout and the lazy markdown chunk finish; the SSE stream keeps "network idle" from ever happening
}
async function shoot(page: Page, name: string, target?: ReturnType<Page["locator"]>) {
  await settle(page);
  const file = path.join(OUT, `${name}.png`);
  await (target ?? page).screenshot({ path: file, animations: "disabled", caret: "hide" });
  return file;
}
async function visit(page: Page, hash: string) {
  await page.goto(`/?token=${TOKEN}${hash}`);
  await expect(tid(page, "sidebar-wrap")).toBeVisible();
}

/** Reference on the left, Pheme on the right, equal height, labelled. Rendered by a throwaway local page; no extra dependencies. */
async function composite(browser: Browser, state: string, pheme: string) {
  const ref = REFERENCE[state];
  if (!ref) return;
  const data = (f: string) => `data:image/${f.endsWith(".png") ? "png" : f.endsWith(".webp") ? "webp" : "png"};base64,${fs.readFileSync(f).toString("base64")}`;
  const ctx = await browser.newContext({ viewport: { width: 3200, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const label = "font:600 14px system-ui,sans-serif;color:#fff;background:#222;padding:6px 10px";
  await page.setContent(`<body style="margin:0;background:#444"><div style="display:flex;gap:12px;align-items:flex-start;padding:0">
    <figure style="margin:0"><div style="${label}">Reference (${ref})</div><img id="a" style="height:820px;display:block" src="${data(path.join(REF_DIR, ref))}"></figure>
    <figure style="margin:0"><div style="${label}">Pheme (${state})</div><img id="b" style="height:820px;display:block" src="${data(pheme)}"></figure></div></body>`);
  await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
  await page.locator("div").first().screenshot({ path: path.join(OUT, `compare-${state}.png`) });
  await ctx.close();
}

test.describe.configure({ mode: "serial" });
const files: Record<string, string> = {};

// eslint-disable-next-line no-empty-pattern -- Playwright requires a destructured first argument
test.beforeAll(async ({}, info) => {
  dataDir = String(info.config.metadata.dataDir);
  fs.mkdirSync(OUT, { recursive: true });
  base = Date.now();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pheme-visual-proj-"));
  hockeyDir = path.join(root, "hockey-app");
  const dp = path.join(root, "dp700");
  fs.mkdirSync(dp);
  for (const d of [".claude", "docs", "migrations", "public", "scripts", "src", "worker"]) { fs.mkdirSync(path.join(hockeyDir, d), { recursive: true }); fs.writeFileSync(path.join(hockeyDir, d, ".keep"), ""); }
  for (const f of [".gitignore", "eslint.config.mjs", "next.config.ts", "package-lock.json", "package.json", "README.md", "tsconfig.json", "wrangler.toml"]) fs.writeFileSync(path.join(hockeyDir, f), `${f}\n`);
  git(hockeyDir, "init", "-q", "-b", "main");
  git(hockeyDir, "add", ".");
  git(hockeyDir, "commit", "-q", "-m", "init");
  fs.writeFileSync(path.join(hockeyDir, "package.json"), "package.json\nchanged\n");
  fs.writeFileSync(path.join(hockeyDir, "src", "game.ts"), "export const puck = 1;\n");

  const reads = ["package.json", "src/game.ts", "src/physics.ts", "worker/index.ts"].flatMap((f, i) => [
    { type: "tool_start", id: `r${i}`, name: "view", args: { detail: f } },
    { type: "tool_end", id: `r${i}`, name: "view", ok: true, result: `(fake read) ${f}` },
  ]);
  mainChat = seedChat({
    title: "Brainstorm hockey game", ageMs: 0, dir: hockeyDir,
    events: [
      { type: "user", text: "lets skip the google sign in stuff to later, just note that. just want users to create account, login and start shooting pucks!" },
      { type: "turn_start" }, ...reads,
      { type: "message", text: MD_REPLY },
      { type: "idle" },
    ],
  });
  seedChat({ title: "Orchestrate subagents to review the build", ageMs: 7 * D, dir: hockeyDir });
  seedChat({ title: "Review Notion practice exam", ageMs: 3 * D, dir: dp });
  seedChat({ title: "Access noop data", ageMs: 2 * H });
  seedChat({ title: "Open Pheme on Mac", ageMs: 2 * D, pinned: true });
  seedChat({ title: "Pheme desktop shell", ageMs: 3 * D, pinned: true });
});

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await page.clock.setFixedTime(base + 30_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    const css = "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important}";
    document.addEventListener("DOMContentLoaded", () => { const s = document.createElement("style"); s.textContent = css; document.head.appendChild(s); });
  });
  await api(page, "PUT", "/api/settings", { theme: THEME, autoApproveAll: false });
});

test("chat", async ({ page }) => {
  await visit(page, `#/chat/${mainChat}`);
  await expect(tid(page, "assistant-block").first()).toContainText("What I fixed");
  await expect(page.getByRole("table")).toBeVisible();
  files.chat = await shoot(page, "chat");
});

test("capabilities", async ({ page }) => {
  const skills: [string, string][] = [["computer-use", "Drive the desktop background-first; escalate on signal."], ["apple-notes", "Manage Apple Notes via memo CLI: create, search, edit."], ["apple-reminders", "Apple Reminders via remindctl: add, list, complete."], ["findmy", "Track Apple devices and AirTags via FindMy.app."], ["imessage", "Send and receive iMessage and SMS via the imsg CLI."], ["write-tests", "Add a regression test before fixing a bug."]];
  for (const [name, d] of skills) await api(page, "PUT", `/api/skills/${name}`, { content: `---\nname: ${name}\ndescription: ${d}\n---\n\n## Procedure\n1. Read the relevant files.\n2. Make the change.\n` });
  await visit(page, "#/skills");
  await expect(page.getByText("apple-notes").first()).toBeVisible();
  files.capabilities = await shoot(page, "capabilities");
});

test("settings", async ({ page }) => {
  await visit(page, "#/settings");
  await expect(tid(page, "settings-panel").filter({ visible: true }).first()).toBeVisible();
  files.settings = await shoot(page, "settings");
});

test("right-panel", async ({ page }) => {
  await visit(page, `#/chat/${mainChat}`);
  await page.getByRole("button", { name: /^Changes/ }).click();
  await expect(tid(page, "change-row").first()).toBeVisible();
  // Pheme's Changes panel is a dialog; the Files list (FilesPanel) is not reachable from the UI yet.
  files["right-panel"] = await shoot(page, "right-panel", page.getByRole("dialog", { name: "Changes" }));
});

test("approval", async ({ page }) => {
  await visit(page, "#/");
  const chat = await (await api(page, "POST", "/api/chats", {})).json() as { id: string };
  await api(page, "PATCH", `/api/chats/${chat.id}`, { title: "Run the test suite", projectDir: hockeyDir });
  await api(page, "POST", `/api/chats/${chat.id}/messages`, { text: "run npm test" });
  await visit(page, `#/chat/${chat.id}`);
  await expect(tid(page, "approval")).toBeVisible();
  files.approval = await shoot(page, "approval");
  await tid(page, "approval-deny").click(); // leave nothing pending
});

test("composer", async ({ page }) => {
  await visit(page, `#/chat/${mainChat}`);
  await page.locator("input[type=file]").setInputFiles({ name: "notes.md", mimeType: "text/markdown", buffer: Buffer.from("# Notes\nreset flow\n") });
  await expect(page.getByRole("list", { name: "Files to send" }).getByRole("listitem")).toHaveCount(1);
  await tid(page, "composer-input").fill("Add a regression test for the reset flow too, and note the sign-in work for later.");
  files.composer = await shoot(page, "composer");
});

test.afterAll(async ({ browser }) => {
  for (const [state, file] of Object.entries(files)) await composite(browser, state, file);
});
