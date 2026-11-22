import { describe, expect, it } from "vitest";
import { explainCopilotError, findCopilotCli } from "../src/copilot.ts";

describe("copilot helpers", () => {
  it("explains protocol mismatches", () => {
    const msg = explainCopilotError(new Error("SDK protocol version mismatch: SDK supports versions 3-3, but server reports version 4. Please update."));
    expect(msg).toContain("npm i -g @github/copilot@1.0.112");
    expect(explainCopilotError(new Error("boom"))).toBe("boom");
  });
  it("honours COPILOT_CLI_PATH and returns undefined when nothing is found", () => {
    expect(findCopilotCli({ COPILOT_CLI_PATH: process.execPath })).toBe(process.execPath);
    expect(findCopilotCli({ PATH: "/definitely/not/here" })).toBeUndefined();
  });
});
