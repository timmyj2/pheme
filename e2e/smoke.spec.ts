import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const TOKEN = "e2e-token-0123456789abcdefghij";
const open = (page: Page, hash = "#/") => page.goto(`/?token=${TOKEN}${hash}`);
const MOD = process.platform === "darwin" ? "Meta" : "Control";
const composer = (page: Page) => page.getByRole("textbox", { name: /message/i }).or(page.locator("textarea")).first();

async function send(page: Page, text: string) {
  const box = composer(page);
  await box.fill(text);
  await box.press("Enter");
}

test.describe("Pheme in a real browser", () => {
  test("loads, shows no console errors, and a message gets a reply", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await open(page);
    await expect(page.getByRole("button", { name: "New chat" })).toBeVisible();
    await send(page, "hello from the e2e test");
    await expect(page.locator(".bubble.user", { hasText: "hello from the e2e test" })).toBeVisible();
    await expect(page.locator(".assistant").first()).toBeVisible();
    await expect(page).toHaveURL(/#\/chat\//);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("the lazy-loaded markdown chunk loads with no failed requests, also after a reload", async ({ page }) => {
    await open(page);
    await send(page, "Show me:\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```js\nconst x = 1;\n```");
    await page.locator(".assistant").first().waitFor();
    // (The fake engine does not produce markdown; formatting itself is covered by unit tests and the real-Copilot runs.)
    await expect(page.locator(".assistant").first()).toBeVisible();
    const failed: string[] = [];
    page.on("response", (r) => { if (r.status() >= 400) failed.push(r.url()); });
    await page.reload();
    await expect(page.locator(".assistant").first()).toBeVisible();
    expect(failed).toEqual([]);
  });

  test("command palette opens with the shortcut, changes the theme, and Esc closes it", async ({ page }) => {
    await open(page);
    await page.keyboard.press(`${MOD}+KeyK`);
    const input = page.getByRole("combobox");
    await expect(input).toBeFocused();
    await input.fill("theme: sol");
    await expect(page.getByRole("option").first()).toContainText(/Solarized/i);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("combobox")).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--dt-background").trim())).toMatch(/^#/);
    await page.keyboard.press(`${MOD}+KeyK`);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("combobox")).toHaveCount(0);
  });

  test("keyboard: first Tab stop is the skip link, then the sidebar; every stop shows focus", async ({ page }) => {
    await open(page);
    await page.locator(".sidebar-wrap").waitFor(); // no click: keyboard focus then starts at the top of the page
    const seen: string[] = [];
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Tab");
      const info = await page.evaluate(() => {
        const e = document.activeElement as HTMLElement;
        const cs = getComputedStyle(e);
        const ring = (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== "none");
        return { label: (e.getAttribute("aria-label") || e.innerText || e.tagName).trim().slice(0, 30), ring: !!ring };
      });
      expect(info.ring, `no focus ring on "${info.label}"`).toBe(true);
      seen.push(info.label);
    }
    expect(seen[0]).toMatch(/skip/i);
  });

  test("narrow screen: the sidebar is a drawer that Esc closes and returns focus to the menu button", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await open(page);
    const menu = page.locator(".menu-btn");
    await menu.click();
    await expect(page.locator(".shell")).toHaveClass(/drawer-open/);
    await page.keyboard.press("Escape");
    await expect(page.locator(".shell")).not.toHaveClass(/drawer-open/);
    await expect(menu).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  });

  test("two tabs on one chat stay in sync", async ({ page, context }) => {
    await open(page);
    await send(page, "sync check");
    await expect(page).toHaveURL(/#\/chat\/[0-9a-f-]+/);
    // The app removes the access key from the address bar, so a second tab needs it again (a duplicated tab keeps it).
    const other = await context.newPage();
    await other.goto(`/?token=${TOKEN}${new URL(page.url()).hash}`);
    await expect(other.locator(".bubble.user", { hasText: "sync check" })).toBeVisible();
    await send(other, "second tab message");
    await expect(page.locator(".bubble.user", { hasText: "second tab message" })).toBeVisible();
    await other.close();
  });

  test("settings: search narrows the panels and a rebound shortcut takes effect", async ({ page }) => {
    await open(page, "#/settings");
    await page.getByLabel("Search settings").fill("backup");
    await expect(page.locator(".panel:not([hidden]) h3")).toHaveText(["Backup and restore"]);
    await page.getByLabel("Search settings").fill("");
    await page.getByRole("button", { name: /New chat: .* Change/ }).click();
    await page.keyboard.press("Alt+KeyJ");
    await expect(page.getByRole("button", { name: /New chat: .*J\. Change/ })).toBeVisible();
    await page.goto(`/?token=${TOKEN}#/settings`);
    await page.keyboard.press("Alt+KeyJ");
    await expect(page).toHaveURL(/#\/$|#\/chat\//);
    await page.evaluate(() => localStorage.removeItem("pheme-keys"));
  });

  test("git: choosing a project folder shows its changes, a diff, and commits to a new branch", async ({ page }) => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "pheme-e2e-repo-"));
    const git = (...a: string[]) => execFileSync("git", ["-c", "user.name=E2E", "-c", "user.email=e2e@example.com", "-c", "commit.gpgsign=false", ...a], { cwd: repo, encoding: "utf8" }).trim();
    git("init", "-q", "-b", "main");
    fs.writeFileSync(path.join(repo, "a.txt"), "one\ntwo\n");
    git("add", "."); git("commit", "-q", "-m", "init");
    fs.writeFileSync(path.join(repo, "a.txt"), "one\nTWO\n");
    fs.writeFileSync(path.join(repo, "new.txt"), "new\n");

    await open(page);
    await send(page, "git test chat");
    await expect(page).toHaveURL(/#\/chat\//);
    await page.getByRole("button", { name: /Choose a project folder/ }).click();
    await page.getByLabel("Folder path").fill(repo);
    await page.getByRole("button", { name: "Use this folder" }).click();
    const changes = page.getByRole("button", { name: /^Changes/ });
    await changes.click();
    await expect(page.locator(".change-row")).toHaveCount(2);
    await page.locator(".change-row", { hasText: "a.txt" }).click();
    await expect(page.locator(".diff .dl.add", { hasText: "+TWO" })).toBeVisible();

    await page.getByLabel("Commit message").fill("E2E commit");
    await page.getByRole("button", { name: /^Commit 2 files/ }).click();
    await page.getByRole("group", { name: "Confirm commit" }).getByRole("button", { name: "Commit" }).click();
    await expect(page.locator(".commit-done")).toContainText("E2E commit");
    expect(git("rev-parse", "--abbrev-ref", "HEAD")).toMatch(/^pheme\//); // never committed on main
    expect(git("rev-list", "--count", "main")).toBe("1");
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.locator(".commit-done")).toHaveCount(0);
    expect(git("rev-list", "--count", "HEAD")).toBe("1");
    // Windows keeps a folder locked while Pheme is still watching it; the temp folder is not important enough to fail the test.
    try { fs.rmSync(repo, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* left for the OS temp cleanup */ }
  });

  test("backup downloads a file that previews as a valid backup", async ({ page }) => {
    await open(page, "#/settings");
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download backup" }).click()]);
    expect(download.suggestedFilename()).toMatch(/^pheme-backup-\d{8}-\d{4}\.pheme-backup$/);
    const file = await download.path();
    await page.locator("input[type=file]").setInputFiles(file!);
    await expect(page.getByRole("group", { name: "Restore preview" })).toContainText(/chats?/);
  });
});
