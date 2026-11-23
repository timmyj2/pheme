import { describe, expect, it } from "vitest";
import { checkArgs } from "../src/args.ts";

describe("checkArgs", () => {
  it("accepts the documented command lines", () => {
    for (const a of [[], ["--fake"], ["doctor"], ["--fake", "--no-open", "--port", "0", "--data-dir", "/tmp/x"], ["doctor", "--data-dir", "d"], ["--help"]]) expect(checkArgs(a)).toBeNull();
  });
  it("rejects typos instead of silently starting the real engine", () => {
    expect(checkArgs(["--fak"])).toMatch(/Unknown option "--fak"/);
    expect(checkArgs(["--bogus"])).toMatch(/--help/);
    expect(checkArgs(["start"])).toMatch(/Unexpected "start"/);
    expect(checkArgs(["--fake", "doctor"])).toMatch(/Unexpected "doctor"/);
  });
  it("explains missing values and --name=value", () => {
    expect(checkArgs(["--port"])).toMatch(/needs a value/);
    expect(checkArgs(["--data-dir", "--fake"])).toMatch(/needs a value/);
    expect(checkArgs(["--port=7000"])).toMatch(/--port 7000/);
  });
});
