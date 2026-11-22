import { describe, expect, it } from "vitest";
import { dataDirCheck, networkCheck, nodeCheck } from "../src/doctor.ts";
import { tmpDir } from "./helpers.ts";

describe("doctor checks", () => {
  it("node version", () => {
    expect(nodeCheck("22.12.0").ok).toBe(true);
    expect(nodeCheck("22.11.9").ok).toBe(false);
    expect(nodeCheck("20.0.0").ok).toBe(false);
    expect(nodeCheck("26.1.0").ok).toBe(true);
  });
  it("data folder", () => {
    expect(dataDirCheck(tmpDir()).ok).toBe(true);
    expect(dataDirCheck("/proc/definitely/not/writable\0").ok).toBe(false);
  });
  it("network", async () => {
    expect((await networkCheck((async () => new Response("", { status: 200 })) as typeof fetch)).ok).toBe(true);
    expect((await networkCheck((async () => { throw new Error("offline"); }) as typeof fetch)).detail).toMatch(/offline/);
  });
});
