import { describe, expect, it } from "vitest";
import * as server from "../../server/src/attachments.ts";
import { ACCEPT, checkFiles, DEFAULT_TEXT, IMAGE_EXT, MAX_IMAGE_BYTES, MAX_PER_MESSAGE, MAX_TEXT_BYTES, nameForPasted, TEXT_EXT, TEXT_NAMES } from "../src/attach.ts";

const file = (name: string, size = 10, type = "") => new File([new Uint8Array(size)], name, { type });

describe("checkFiles", () => {
  it("accepts images and text/code files, and explains every refusal in words", () => {
    const { accepted, problems } = checkFiles([file("a.png", 5, "image/png"), file("n.md"), file("Dockerfile"), file("a.exe"), file("b.zip"), file("empty.txt", 0), file("big.txt", MAX_TEXT_BYTES + 1), file("big.png", MAX_IMAGE_BYTES + 1, "image/png")], 0);
    expect(accepted.map((f) => f.name)).toEqual(["a.png", "n.md", "Dockerfile"]);
    expect(problems).toHaveLength(5);
    expect(problems.join("\n")).toMatch(/"a\.exe" can't be attached/);
    expect(problems.join("\n")).toMatch(/"empty\.txt" is empty/);
    expect(problems.join("\n")).toMatch(/"big\.txt" is 513 KB/);
    expect(problems.join("\n")).toMatch(/"big\.png" is 5\.0 MB/);
  });
  it("stops at five per message counting what is already attached, and ignores a file dropped twice", () => {
    const six = Array.from({ length: 6 }, (_, i) => file(`f${i}.txt`, 10 + i));
    const r = checkFiles(six, 0);
    expect(r.accepted).toHaveLength(MAX_PER_MESSAGE);
    expect(r.problems[0]).toMatch(/Only 5 files per message.*f5\.txt/);
    expect(checkFiles([file("x.txt")], 5).accepted).toHaveLength(0);
    expect(checkFiles([file("same.txt", 7), file("same.txt", 7)], 0).accepted).toHaveLength(1);
    expect(checkFiles([file("same.txt", 7), file("same.txt", 8)], 0).accepted).toHaveLength(2); // different contents
  });
  it("is case-insensitive and handles odd names", () => {
    expect(checkFiles([file("PHOTO.JPG", 3), file("Notes.MD"), file("noext.txt.bak"), file("."), file("")], 0).accepted.map((f) => f.name)).toEqual(["PHOTO.JPG", "Notes.MD"]);
  });
});

describe("pasted images", () => {
  it("gets a readable name with the right extension; real names are kept", () => {
    expect(nameForPasted(file("image.png", 5, "image/png"), 1).name).toBe("pasted-image.png");
    expect(nameForPasted(file("", 5, "image/jpeg"), 2).name).toBe("pasted-image-2.jpg");
    expect(nameForPasted(file("screenshot 1.png", 5, "image/png"), 1).name).toBe("screenshot 1.png");
    expect(nameForPasted(file("x", 5, "application/zip"), 1).name).toBe("x");
  });
  it("default text matches what the server would use", () => {
    expect(DEFAULT_TEXT(1)).toBe("Please take a look at the attached file.");
    expect(DEFAULT_TEXT(2)).toBe("Please take a look at the attached files.");
  });
});

describe("browser and server agree", () => {
  it("same limits and the same list of allowed kinds", async () => {
    expect(MAX_IMAGE_BYTES).toBe(server.MAX_IMAGE_BYTES);
    expect(MAX_TEXT_BYTES).toBe(server.MAX_TEXT_BYTES);
    expect(MAX_PER_MESSAGE).toBe(server.MAX_PER_MESSAGE);
    // Everything the browser lets through must be something the server accepts (given real content); nothing the server refuses by type may be offered.
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(8)]);
    const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(8)]);
    const gif = Buffer.concat([Buffer.from("GIF89a"), Buffer.alloc(8)]);
    const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(8)]);
    const real: Record<string, Buffer> = { png, jpg: jpg, jpeg: jpg, gif, webp };
    for (const e of IMAGE_EXT) expect(() => server.checkAttachment(`a.${e}`, real[e]), e).not.toThrow();
    for (const e of TEXT_EXT) expect(() => server.checkAttachment(`a.${e}`, Buffer.from("text")), e).not.toThrow();
    for (const n of TEXT_NAMES) expect(() => server.checkAttachment(n, Buffer.from("text")), n).not.toThrow();
    expect(ACCEPT).toContain(".png");
    expect(ACCEPT).toContain(".ts");
    for (const e of ["exe", "zip", "pdf", "svg", "dll", "docx"]) expect(ACCEPT).not.toContain(`.${e}`);
  });
});
