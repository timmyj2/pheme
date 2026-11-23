// One command that runs every check CI runs, in order, and stops at the first failure.
// Usage: npm run verify            (add --e2e to also run the browser tests; set PW_CHANNEL=chrome if Playwright's own Chromium is unsupported)
import { spawnSync } from "node:child_process";

const steps = [
  ["lint", "npm", ["run", "lint"]],
  ["typecheck", "npm", ["run", "typecheck"]],
  ["unit and integration tests", "npm", ["test"]],
  ["build", "npm", ["run", "build"]],
  ["smoke test", "node", ["scripts/smoke.mjs"]],
  ["stress (20 probes)", "node", ["scripts/stress.mjs"]],
  ["scale stress", "node", ["scripts/stress-scale.mjs"]],
];
if (process.argv.includes("--e2e")) steps.push(["browser tests", "npx", ["playwright", "test"]]);

const win = process.platform === "win32";
for (const [name, cmd, args] of steps) {
  process.stdout.write(`\n=== ${name}\n`);
  const t = Date.now();
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: win });
  if (r.status !== 0) {
    console.error(`\nFAILED at "${name}" (exit ${r.status}). Nothing after it was run.`);
    process.exit(r.status || 1);
  }
  console.log(`--- ${name}: ok (${Math.round((Date.now() - t) / 1000)} s)`);
}
console.log("\nAll checks passed.");
