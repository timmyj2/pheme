import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { listDir } from "../src/files.ts";
import { HttpError } from "../src/http-error.ts";

describe("listDir", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pheme-files-"));
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(path.join(root, "src", "a.ts"), "x");
  fs.writeFileSync(path.join(root, "readme.md"), "y");
  fs.mkdirSync(path.join(root, "src", "deep"));

  it("lists folders first, then files, and stays under the root", () => {
    const top = listDir(root);
    expect(top.path).toBe("");
    expect(top.parent).toBeNull();
    expect(top.entries.map((e) => e.name)).toEqual(["src", "readme.md"]);
    expect(top.entries[0].dir).toBe(true);
    const inner = listDir(root, "src");
    expect(inner.path).toBe("src");
    expect(inner.parent).toBe("");
    expect(inner.entries.map((e) => e.name)).toContain("a.ts");
    expect(listDir(root, "src/deep").parent).toBe("src");
  });

  it("refuses a path that leaves the root, a missing folder, and a file", () => {
    expect(() => listDir(root, "../")).toThrow(HttpError);
    expect(() => listDir(root, "src/../../etc")).toThrow(HttpError);
    expect(() => listDir(root, "nope")).toThrow(HttpError);
    expect(() => listDir(root, "readme.md")).toThrow(HttpError);
    expect(() => listDir(root, "a\0b")).toThrow(HttpError);
  });

  it("caps a huge folder and counts the rest", () => {
    const big = fs.mkdtempSync(path.join(os.tmpdir(), "pheme-files-big-"));
    for (let i = 0; i < 320; i++) fs.writeFileSync(path.join(big, `f${String(i).padStart(3, "0")}.txt`), "x");
    const listed = listDir(big);
    expect(listed.entries).toHaveLength(300);
    expect(listed.more).toBe(20);
  });
});
