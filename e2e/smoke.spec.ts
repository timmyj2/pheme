import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const TOKEN = "e2e-token-0123456789abcdefghij";
const open = (page: Page, hash = "#/") => page.goto(`/?token=${TOKEN}${hash}`);
const MOD = process.platform === "darwin" ? "Meta" : "Control";
// Stable test ids: keep in step with packages/ui/src/testids.ts (the single list). Never select app structure by CSS class.
const TID = {
  shell: "shell", sidebarWrap: "sidebar-wrap", menuButton: "menu-button", userMessage: "user-message", userBlock: "user-block",
  assistantBlock: "assistant-block", composerWrap: "composer-wrap", composerInput: "composer-input", contextMeter: "context-meter",
  settingsPanel: "settings-panel", changeRow: "change-row", diffLine: "diff-line", commitDone: "commit-done", branchPill: "branch-pill", stashItem: "stash-item",
  rightPanelToggle: "right-panel-toggle", rightTabChanges: "right-tab-changes", thinking: "thinking", todoRow: "todo-row",
} as const;
const tid = (page: Page, id: string) => page.getByTestId(id);
const composer = (page: Page) => tid(page, TID.composerInput);

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
    await expect(tid(page, TID.userBlock).filter({ hasText: "hello from the e2e test" })).toBeVisible();
    await expect(tid(page, TID.assistantBlock).first()).toBeVisible();
    await expect(page).toHaveURL(/#\/chat\//);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("thinking: a scripted reasoning run shows Thinking, then Thought for Ns, with todos, and the reasoning survives a reload", async ({ page }) => {
    await open(page);
    await send(page, "think about the folder");
    await expect(tid(page, TID.thinking).first()).toBeVisible();
    await expect(page.getByText("Thinking", { exact: true })).toBeVisible();
    await expect(tid(page, TID.todoRow).first()).toBeVisible();
    await expect(page.getByText(/^Thought for \d+s$/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Check the project folder").first()).toBeVisible();
    await page.reload();
    await expect(page.getByText(/^Thought for \d+s$/)).toBeVisible();
    await page.getByRole("button", { name: /^Thought for \d+s$/ }).click();
    await expect(page.getByText("The user wants a quick check", { exact: false })).toBeVisible();
  });

  test("the lazy-loaded markdown chunk loads with no failed requests, also after a reload", async ({ page }) => {
    await open(page);
    await send(page, "Show me:\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```js\nconst x = 1;\n```");
    await tid(page, TID.assistantBlock).first().waitFor();
    // (The fake engine does not produce markdown; formatting itself is covered by unit tests and the real-Copilot runs.)
    await expect(tid(page, TID.assistantBlock).first()).toBeVisible();
    const failed: string[] = [];
    page.on("response", (r) => { if (r.status() >= 400) failed.push(r.url()); });
    await page.reload();
    await expect(tid(page, TID.assistantBlock).first()).toBeVisible();
    expect(failed).toEqual([]);
  });

  test("command palette opens with the shortcut, changes the theme, and Esc closes it", async ({ page }) => {
    await open(page);
    await expect(page.getByRole("button", { name: "New chat" })).toBeVisible(); // wait until the app has started and bound its shortcuts
    await page.keyboard.press(`${MOD}+KeyK`);
    const input = page.getByRole("combobox");
    await expect(input).toBeFocused();
    await input.fill("theme: sol");
    await expect(page.getByRole("option").first()).toContainText(/Solarized/i);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("combobox")).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--theme-background-seed").trim())).toBe("#002b36"); // Solarized dark: the seed applyTheme wrote
    await page.keyboard.press(`${MOD}+KeyK`);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("combobox")).toHaveCount(0);
  });

  test("keyboard: first Tab stop is the skip link, then the sidebar; every stop shows focus", async ({ page }) => {
    await open(page);
    await tid(page, TID.sidebarWrap).waitFor(); // no click: keyboard focus then starts at the top of the page
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
    const menu = tid(page, TID.menuButton);
    await menu.click();
    await expect(tid(page, TID.shell)).toHaveAttribute("data-drawer-open", "true");
    // At 390px the open drawer must not push the page into a horizontal scroll either.
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    await page.keyboard.press("Escape");
    await expect(tid(page, TID.shell)).not.toHaveAttribute("data-drawer-open", "true");
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
    await expect(tid(other, TID.userBlock).filter({ hasText: "sync check" })).toBeVisible();
    await send(other, "second tab message");
    await expect(tid(page, TID.userBlock).filter({ hasText: "second tab message" })).toBeVisible();
    await other.close();
  });

  test("settings: search narrows the panels and a rebound shortcut takes effect", async ({ page }) => {
    await open(page, "#/settings");
    await page.getByLabel("Search settings").fill("backup");
    await expect(tid(page, TID.settingsPanel).filter({ visible: true }).getByRole("heading", { level: 3 })).toHaveText(["Backup and restore"]);
    await page.getByLabel("Search settings").fill("");
    await page.getByRole("button", { name: "Keyboard shortcuts" }).click();
    await page.getByRole("button", { name: /New chat: .* Change/ }).click();
    await page.keyboard.press("Alt+KeyJ");
    await expect(page.getByRole("button", { name: /New chat: .*J\. Change/ })).toBeVisible();
    await page.goto(`/?token=${TOKEN}#/settings`);
    await page.keyboard.press("Alt+KeyJ");
    await expect(page).toHaveURL(/#\/$|#\/chat\//);
    await page.evaluate(() => localStorage.removeItem("pheme-keys"));
  });

  test("settings overlay: opens over the app, Escape closes it, and the breadcrumb follows the page", async ({ page }) => {
    await open(page, "#/settings");
    const dialog = page.getByRole("dialog", { name: "Settings" });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Main model");
    await page.getByRole("button", { name: "Notifications" }).click();
    await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Notifications");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(/#\/$|#\/chat\//);
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
    await tid(page, TID.rightPanelToggle).click();
    await tid(page, TID.rightTabChanges).click();
    await expect(tid(page, TID.changeRow)).toHaveCount(2);
    await tid(page, TID.changeRow).filter({ hasText: "a.txt" }).click();
    await expect(page.locator(`[data-testid="${TID.diffLine}"][data-kind="add"]`, { hasText: "+TWO" })).toBeVisible();

    await page.getByLabel("Commit message").fill("E2E commit");
    await page.getByRole("button", { name: /^Commit 2 files/ }).click();
    await page.getByRole("group", { name: "Confirm commit" }).getByRole("button", { name: "Commit" }).click();
    await expect(tid(page, TID.commitDone)).toContainText("E2E commit");
    expect(git("rev-parse", "--abbrev-ref", "HEAD")).toMatch(/^pheme\//); // never committed on main
    expect(git("rev-list", "--count", "main")).toBe("1");
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(tid(page, TID.commitDone)).toHaveCount(0);
    expect(git("rev-list", "--count", "HEAD")).toBe("1");
    // Windows keeps a folder locked while Pheme is still watching it; the temp folder is not important enough to fail the test.
    try { fs.rmSync(repo, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* left for the OS temp cleanup */ }
  });

  test("branches and stash: create a branch, set work aside, restore it, and a switch that would overwrite asks first", async ({ page }) => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "pheme-e2e-br-"));
    // Git on Windows may store files with CRLF line endings; compare the text, not the line-ending style.
    const read = (f: string) => fs.readFileSync(path.join(repo, f), "utf8").replace(/\r\n/g, "\n");
    const git = (...a: string[]) => execFileSync("git", ["-c", "user.name=E2E", "-c", "user.email=e2e@example.com", "-c", "commit.gpgsign=false", ...a], { cwd: repo, encoding: "utf8" }).trim();
    git("init", "-q", "-b", "main");
    fs.writeFileSync(path.join(repo, "a.txt"), "base\n"); git("add", "."); git("commit", "-q", "-m", "init");
    git("switch", "-q", "-c", "other"); fs.writeFileSync(path.join(repo, "a.txt"), "other side\n"); git("commit", "-q", "-am", "other edits a.txt"); git("switch", "-q", "main");
    fs.writeFileSync(path.join(repo, "a.txt"), "my edit\n");

    await open(page);
    await send(page, "branch test chat");
    await expect(page).toHaveURL(/#\/chat\//);
    await page.getByRole("button", { name: /Choose a project folder/ }).click();
    await page.getByLabel("Folder path").fill(repo);
    await page.getByRole("button", { name: "Use this folder" }).click();
    await tid(page, TID.rightPanelToggle).click();
    await tid(page, TID.rightTabChanges).click();
    await tid(page, TID.branchPill).click();

    // switching onto a branch that would overwrite the edit asks first and changes nothing
    await page.getByRole("button", { name: /other/ }).filter({ hasText: "other edits a.txt" }).click();
    const confirm = page.getByRole("group", { name: "Confirm stash and switch" });
    await expect(confirm).toBeVisible();
    expect(git("rev-parse", "--abbrev-ref", "HEAD")).toBe("main");
    expect(read("a.txt")).toBe("my edit\n");
    await confirm.getByRole("button", { name: "Set aside and switch" }).click();
    await expect(tid(page, TID.stashItem)).toHaveCount(1);
    expect(git("rev-parse", "--abbrev-ref", "HEAD")).toBe("other");
    expect(read("a.txt")).toBe("other side\n");

    // back to main and restore: the edit returns, the stash list empties
    await page.getByRole("button", { name: /main/ }).filter({ hasText: "init" }).click();
    await expect.poll(() => git("rev-parse", "--abbrev-ref", "HEAD")).toBe("main");
    await page.getByRole("button", { name: /^Restore stash/ }).click();
    await expect(tid(page, TID.stashItem)).toHaveCount(0);
    expect(read("a.txt")).toBe("my edit\n");

    // a new branch keeps the edit
    await page.getByLabel("Branch to create from here").fill("feat/from-e2e");
    await page.getByRole("button", { name: "Create" }).click();
    await expect.poll(() => git("rev-parse", "--abbrev-ref", "HEAD")).toBe("feat/from-e2e");
    expect(read("a.txt")).toBe("my edit\n");
    try { fs.rmSync(repo, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows may still hold the folder */ }
  });

  test("attachments and the context meter: attach, send, see them in the chat, and a bad file is refused", async ({ page }) => {
    const PNG_1PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
    const dialogs: string[] = [];
    page.on("dialog", (d) => { dialogs.push(d.message()); void d.dismiss(); }); // the attached file contains <script>alert(1)</script>
    await open(page);
    const picker = page.locator("input[type=file]");
    await picker.setInputFiles([
      { name: "shot.png", mimeType: "image/png", buffer: PNG_1PX },
      { name: "notes.md", mimeType: "text/markdown", buffer: Buffer.from("# Notes\nhello <script>alert(1)</script>\n") },
      { name: "tool.exe", mimeType: "application/octet-stream", buffer: Buffer.from("MZ") },
    ]);
    await expect(page.getByRole("alert")).toContainText('"tool.exe" can\'t be attached');
    const draft = page.getByRole("list", { name: "Files to send" });
    await expect(draft.getByRole("listitem")).toHaveCount(2);
    await composer(page).fill("please check these [context:110000]");
    await composer(page).press("Enter");
    await expect(page).toHaveURL(/#\/chat\//);
    const msg = tid(page, TID.userMessage).first();
    await expect(msg.getByTestId(TID.userBlock)).toContainText("please check these");
    await expect(msg.getByRole("button", { name: /notes\.md/ })).toBeVisible();
    const thumb = msg.getByRole("img", { name: "shot.png" });
    await expect(thumb).toBeVisible();
    await expect.poll(() => thumb.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(1); // really decoded, through the authorised download
    await expect(page.getByRole("meter", { name: "Context used" })).toHaveAttribute("aria-valuetext", /110k of 128k tokens, 8\d percent/);
    await expect(tid(page, TID.contextMeter)).toContainText("getting full");
    await expect(page.getByRole("list", { name: "Files to send" })).toHaveCount(0); // the composer is empty again
    // open the text file the way a user would: it must show as text and never run
    const [popup] = await Promise.all([page.waitForEvent("popup"), msg.getByRole("button", { name: /notes\.md/ }).click()]);
    await popup.waitForLoadState();
    await expect(popup.locator("body")).toContainText("<script>alert(1)</script>");
    await popup.close();
    expect(dialogs).toEqual([]);
    // drag and drop onto the composer also attaches
    const dt = await page.evaluateHandle(() => { const d = new DataTransfer(); d.items.add(new File(["a,b\n1,2\n"], "data.csv", { type: "text/csv" })); return d; });
    await tid(page, TID.composerWrap).dispatchEvent("dragover", { dataTransfer: dt });
    await tid(page, TID.composerWrap).dispatchEvent("drop", { dataTransfer: dt });
    await expect(page.getByRole("list", { name: "Files to send" }).getByText("data.csv")).toBeVisible();
  });

  test("prompt library: save a prompt on the Prompts page, insert it with / in a chat, and the blank is selected", async ({ page }) => {
    await open(page, "#/prompts");
    await page.getByRole("button", { name: "New prompt" }).click();
    const form = page.getByRole("group", { name: "New prompt" });
    await form.getByLabel("Name").fill("Explain simply");
    await form.getByLabel("Text").fill("Explain {{this concept}} to me as if I am new to it.");
    await form.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Explain simply")).toBeVisible();
    // the same name again is refused with a reason
    await page.getByRole("button", { name: "New prompt" }).click();
    await form.getByLabel("Name").fill("explain SIMPLY");
    await form.getByLabel("Text").fill("dup");
    await form.getByRole("button", { name: "Save" }).click();
    await expect(form.getByRole("alert")).toContainText("already have a prompt");
    await form.getByRole("button", { name: "Cancel" }).click();

    await page.goto(`/?token=${TOKEN}#/`);
    const box = composer(page);
    await box.click();
    await box.pressSequentially("/expl");
    const option = page.getByRole("option", { name: /Explain simply/ });
    await expect(option).toBeVisible();
    await box.press("Enter"); // inserts, does not send
    await expect(box).toHaveValue("Explain {{this concept}} to me as if I am new to it.");
    await expect.poll(() => box.evaluate((t: HTMLTextAreaElement) => t.value.slice(t.selectionStart, t.selectionEnd))).toBe("{{this concept}}");
    await expect(page).not.toHaveURL(/#\/chat\//); // nothing was sent
    await page.keyboard.type("recursion"); // typing replaces the selected blank
    await expect(box).toHaveValue("Explain recursion to me as if I am new to it.");
    // clean up so other tests see an empty library
    await page.goto(`/?token=${TOKEN}#/prompts`);
    await page.getByRole("button", { name: "Delete Explain simply" }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByText("Explain simply")).toHaveCount(0);
  });

  test("installable: manifest and icons are public, Chrome finds nothing blocking install, no service worker, and a fresh window reuses the saved key", async ({ page, context, request }) => {
    await open(page);
    await expect(page.getByRole("button", { name: "New chat" })).toBeVisible();
    // the manifest and icons are plain public files (the API still needs the key)
    const m = await request.get("/manifest.webmanifest");
    expect(m.status()).toBe(200);
    expect(m.headers()["content-type"]).toBe("application/manifest+json");
    expect((await m.json()).display).toBe("standalone");
    for (const f of ["/icon-192.png", "/icon-512.png", "/icon-maskable-512.png"]) {
      const r = await request.get(f);
      expect(r.status(), f).toBe(200);
      expect(r.headers()["content-type"], f).toBe("image/png");
    }
    expect((await request.get("/api/state")).status()).toBe(401);
    // Chrome's own installability check
    const cdp = await context.newCDPSession(page);
    const { installabilityErrors } = (await cdp.send("Page.getInstallabilityErrors")) as { installabilityErrors: { errorId: string }[] };
    // (the test browser runs like a private window, which Chrome always reports; anything else would be a real problem)
    expect(installabilityErrors.map((e) => e.errorId).filter((id) => id !== "in-incognito")).toEqual([]);
    // nothing is cached or intercepted
    expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
    // an installed window starts with no address key and empty tab storage: it picks up the key this browser saved
    const fresh = await context.newPage();
    await fresh.goto("/");
    await expect(fresh.getByRole("button", { name: "New chat" })).toBeVisible();
    await fresh.close();
  });

  test("backup downloads a file that previews as a valid backup", async ({ page }) => {
    await open(page, "#/settings");
    await page.getByRole("button", { name: "Backup & transfer" }).click();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download backup" }).click()]);
    expect(download.suggestedFilename()).toMatch(/^pheme-backup-\d{8}-\d{4}\.pheme-backup$/);
    const file = await download.path();
    await page.locator("input[type=file]").setInputFiles(file!);
    await expect(page.getByRole("group", { name: "Restore preview" })).toContainText(/chats?/);
  });
});
