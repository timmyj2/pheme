import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { App } from "../src/app.ts";
import { FakeEngine, type FakeScript } from "../src/fake.ts";
import type { SeqEvent } from "../src/protocol.ts";

export function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pheme-test-"));
}

export function makeApp(script?: FakeScript) {
  const dir = tmpDir();
  const engine = new FakeEngine(script);
  const app = new App(dir, engine);
  return { app, engine, dir };
}

export function eventsOf(app: App, chatId: string): SeqEvent[] {
  return app.store.events(chatId);
}
