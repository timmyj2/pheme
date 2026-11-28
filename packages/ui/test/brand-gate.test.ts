import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Pheme must not show the upstream product name anywhere a person can see: strings, titles, index.html.
// Comments are exempt, and so is the MIT attribution header that every ported file must carry.
const ROOT = path.resolve(__dirname, "../../..");
const BANNED = /Hermes|Nous/;
const ATTRIBUTION = /Adapted from hermes-agent \(MIT, Copyright \(c\) 2025 Nous Research\)/;

function* files(dir: string): Generator<string> {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* files(p);
    else if (/\.(tsx?|css|html|json|ts)$/.test(e.name)) yield p;
  }
}
function isCommentLine(line: string) {
  const t = line.trim();
  return t.startsWith("//") || t.startsWith("/*") || t.startsWith("*") || t.startsWith("{/*");
}

describe("brand gate", () => {
  it("no Hermes or Nous in packages/ui/src or index.html outside comments and the attribution header", () => {
    const targets = [...files(path.join(ROOT, "packages/ui/src")), path.join(ROOT, "packages/ui/index.html")];
    const hits: string[] = [];
    for (const f of targets) {
      fs.readFileSync(f, "utf8").split("\n").forEach((line, i) => {
        if (BANNED.test(line) && !ATTRIBUTION.test(line) && !isCommentLine(line)) hits.push(`${path.relative(ROOT, f)}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(hits).toEqual([]);
  });
});
