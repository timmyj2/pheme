import fs from "node:fs";
import path from "node:path";
import { CopilotEngine, copilotVersion, findCopilotCli } from "./copilot.ts";

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
  /** A failed check that does not block use: shown as WARN and not counted as a failure. */
  warn?: boolean;
}

const MIN_NODE = [22, 12];

export function nodeCheck(version = process.versions.node): Check {
  const [maj, min] = version.split(".").map(Number);
  const ok = maj > MIN_NODE[0] || (maj === MIN_NODE[0] && min >= MIN_NODE[1]);
  return { name: "Node.js", ok, detail: ok ? `v${version}` : `v${version} is too old; need ${MIN_NODE.join(".")} or newer` };
}

export function dataDirCheck(dir: string): Check {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const f = path.join(dir, `.doctor-${process.pid}`);
    fs.writeFileSync(f, "ok");
    fs.rmSync(f);
    return { name: "Data folder", ok: true, detail: `${dir} is writable` };
  } catch (e) {
    return { name: "Data folder", ok: false, detail: `${dir}: ${(e as Error).message}` };
  }
}

export async function networkCheck(fetchFn: typeof fetch = fetch): Promise<Check> {
  try {
    const r = await fetchFn("https://api.github.com/", { signal: AbortSignal.timeout(10000) });
    return { name: "Network to GitHub", ok: r.status < 500, detail: `api.github.com answered ${r.status}` };
  } catch (e) {
    return { name: "Network to GitHub", ok: false, detail: `cannot reach api.github.com (${(e as Error).message}). Check proxy settings.` };
  }
}

export async function runDoctor(dataDir: string, log: (line: string) => void = console.log): Promise<boolean> {
  const checks: Check[] = [];
  const add = (c: Check) => {
    checks.push(c);
    log(`${c.ok ? "PASS" : c.warn ? "WARN" : "FAIL"}  ${c.name}: ${c.detail}`);
  };
  add(nodeCheck());
  add(dataDirCheck(dataDir));
  const cli = findCopilotCli();
  if (!cli) add({ name: "Copilot CLI", ok: false, detail: "not found on PATH. Install with: npm i -g @github/copilot (or set COPILOT_CLI_PATH)" });
  else {
    const v = copilotVersion(cli);
    add({ name: "Copilot CLI", ok: !!v, detail: v ? `${v} at ${cli}` : `found at ${cli} but --version failed` });
  }
  add(await networkCheck());
  if (cli) {
    const engine = new CopilotEngine(cli);
    try {
      const auth = (await engine.authStatus()) as { isAuthenticated?: boolean; login?: string; statusMessage?: string };
      add({ name: "Copilot sign-in", ok: !!auth.isAuthenticated, detail: auth.isAuthenticated ? `signed in${auth.login ? " as " + auth.login : ""}` : `not signed in. Run: copilot, then /login. ${auth.statusMessage ?? ""}`.trim() });
      if (auth.isAuthenticated) {
        const models = await engine.listModels();
        const real = models.filter((m) => m.id !== "auto");
        add({ name: "Models allowed", ok: real.length > 0, warn: true, detail: real.length ? real.map((m) => m.id).join(", ") : "Copilot listed no models for this account; Pheme will use Auto" });
      }
    } catch (e) {
      add({ name: "Copilot sign-in", ok: false, detail: (e as Error).message });
    } finally {
      await engine.close();
    }
  }
  const failed = checks.filter((c) => !c.ok && !c.warn).length;
  log(failed ? `\n${failed} check(s) failed.` : "\nAll checks passed.");
  return failed === 0;
}
