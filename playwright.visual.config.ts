import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defineConfig } from "@playwright/test";

// Separate config for the visual capture harness (`npm run visual`). The default `npx playwright test`
// (playwright.config.ts) ignores e2e/visual.spec.ts, so the smoke run stays just the smoke tests.
const PORT = 7734;
const TOKEN = "visual-token-0123456789abcdefghij";
const dataDir = path.join(os.tmpdir(), "pheme-visual-data");
// Reset only in the main process: Playwright workers load this file again and must not wipe a running server's data.
if (!process.env.TEST_WORKER_INDEX) {
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });
}

export default defineConfig({
  testDir: "e2e",
  testMatch: "visual.spec.ts",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  projects: [{ name: "visual" }],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    channel: process.env.PW_CHANNEL || undefined,
    launchOptions: process.env.PW_EXECUTABLE_PATH ? { executablePath: process.env.PW_EXECUTABLE_PATH } : undefined,
    trace: "off",
  },
  metadata: { token: TOKEN, dataDir },
  webServer: {
    command: `node dist/pheme.mjs --fake --no-open --port ${PORT} --data-dir "${dataDir}"`,
    url: `http://127.0.0.1:${PORT}/`,
    env: { PHEME_TOKEN: TOKEN, GIT_AUTHOR_NAME: "V", GIT_AUTHOR_EMAIL: "v@example.com", GIT_COMMITTER_NAME: "V", GIT_COMMITTER_EMAIL: "v@example.com" },
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
