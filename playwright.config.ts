import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defineConfig } from "@playwright/test";

const PORT = 7733;
const TOKEN = "e2e-token-0123456789abcdefghij";
// A fresh data folder per run, so tests never see (or damage) real chats.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "pheme-e2e-"));

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // the tests share one server and one data folder
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    // CI installs Playwright's own Chromium; on a machine it does not support, set PW_CHANNEL=chrome to use installed Chrome.
    channel: process.env.PW_CHANNEL || undefined,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  metadata: { token: TOKEN, dataDir },
  webServer: {
    command: `node dist/pheme.mjs --fake --no-open --port ${PORT} --data-dir "${dataDir}"`,
    url: `http://127.0.0.1:${PORT}/`,
    // CI machines have no Git identity; give the server one so the commit test does not depend on the machine.
    env: { PHEME_TOKEN: TOKEN, GIT_AUTHOR_NAME: "E2E", GIT_AUTHOR_EMAIL: "e2e@example.com", GIT_COMMITTER_NAME: "E2E", GIT_COMMITTER_EMAIL: "e2e@example.com" },
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
