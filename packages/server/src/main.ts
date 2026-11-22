import { spawn } from "node:child_process";
import { App } from "./app.ts";
import { loadAssets } from "./assets.ts";
import { CopilotEngine } from "./copilot.ts";
import { runDoctor } from "./doctor.ts";
import { FakeEngine } from "./fake.ts";
import { dataDir } from "./paths.ts";
import { startServer } from "./server.ts";

const VERSION = "0.1.0";

const HELP = `Pheme ${VERSION}

Usage: pheme [command] [options]
  (none)           start Pheme and open it in your browser
  doctor           check this computer is ready (Node, Copilot CLI, sign-in, network, data folder)

Options:
  --fake           use the built-in fake engine (no Copilot needed; for demos and tests)
  --port <n>       port to listen on (default 7676, falls back to a free port)
  --no-open        do not open the browser
  --data-dir <p>   data folder (default ~/.pheme or %USERPROFILE%\\.pheme)
  -h, --help       show this help
`;

function arg(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function openBrowser(url: string) {
  const [cmd, args] = process.platform === "win32" ? ["cmd", ["/c", "start", "", url.replace(/&/g, "^&")]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true, windowsHide: true }).on("error", () => {}).unref();
  } catch {
    /* the URL is printed anyway */
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("-h") || args.includes("--help")) return console.log(HELP);
  const dir = dataDir(arg(args, "--data-dir"));
  if (args[0] === "doctor") {
    const ok = await runDoctor(dir);
    process.exit(ok ? 0 : 1);
  }
  const fake = args.includes("--fake");
  const engine = fake ? new FakeEngine(undefined, 25) : new CopilotEngine();
  const app = new App(dir, engine);
  const wantPort = Number(arg(args, "--port") ?? 7676);
  const assets = loadAssets();
  const opts = { app, fake, version: VERSION, assets };
  let server;
  try {
    server = await startServer({ ...opts, port: wantPort });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EADDRINUSE") throw e;
    server = await startServer({ ...opts, port: 0 });
  }
  console.log(`Pheme is running${fake ? " (fake engine)" : ""}.\nOpen: ${server.url}\nData folder: ${dir}\nPress Ctrl+C to stop.`);
  app.scheduler.start();
  if (!args.includes("--no-open")) openBrowser(server.url);
  const stop = async () => {
    await app.shutdown().catch(() => {});
    await server.close();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((e) => {
  console.error(`Pheme failed to start: ${(e as Error).message}`);
  process.exit(1);
});
