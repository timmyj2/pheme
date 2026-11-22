import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { acquireLock, parsePort } from "../src/lock.ts";
import { tmpDir } from "./helpers.ts";

describe("single instance lock", () => {
  it("blocks a second live instance, allows after release, and replaces a stale lock", () => {
    const d = tmpDir();
    const release = acquireLock(d, process.pid);
    // pid 1 (init/launchd) is always alive, so pretend it is the other instance
    fs.writeFileSync(path.join(d, "pheme.lock"), "1");
    expect(() => acquireLock(d, process.pid)).toThrow(/already running/);
    fs.writeFileSync(path.join(d, "pheme.lock"), "2147483000"); // no such process
    const again = acquireLock(d, process.pid);
    again();
    expect(fs.existsSync(path.join(d, "pheme.lock"))).toBe(false);
    release();
  });
  it("ignores a garbage lock file", () => {
    const d = tmpDir();
    fs.writeFileSync(path.join(d, "pheme.lock"), "not a pid");
    expect(() => acquireLock(d)).not.toThrow();
  });
});

describe("--port", () => {
  it("validates", () => {
    expect(parsePort(undefined, 7676)).toBe(7676);
    expect(parsePort("0", 7676)).toBe(0);
    expect(parsePort("8080", 1)).toBe(8080);
    for (const bad of ["abc", "99999", "-1", "80.5", ""]) expect(() => parsePort(bad, 1)).toThrow(/--port/);
  });
});
