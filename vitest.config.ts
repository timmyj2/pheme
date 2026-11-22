import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    testTimeout: 15000,
    projects: [
      { esbuild: { jsx: "automatic" }, test: { name: "server", testTimeout: 15000, include: ["packages/server/test/**/*.test.ts"], environment: "node" } },
      {
        esbuild: { jsx: "automatic" },
        test: { name: "ui", testTimeout: 15000, include: ["packages/ui/test/**/*.test.{ts,tsx}"], environment: "jsdom", setupFiles: ["packages/ui/test/setup.ts"] },
      },
    ],
  },
});
