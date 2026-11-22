import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Markdown, MarkdownBoundary } from "../src/Markdown.tsx";

const html = (text: string) => render(<Markdown text={text} />).container;

describe("GFM rendering", () => {
  it("renders headings h1-h6", () => {
    const c = html("# a\n\n## b\n\n### c\n\n#### d\n\n##### e\n\n###### f");
    for (const t of ["h1", "h2", "h3", "h4", "h5", "h6"]) expect(c.querySelector(t)).toBeTruthy();
  });
  it("renders inline formatting, quotes and rules", () => {
    const c = html("**b** *i* ~~s~~ `c`\n\n> quote\n\n---");
    expect(c.querySelector("strong")?.textContent).toBe("b");
    expect(c.querySelector("em")?.textContent).toBe("i");
    expect(c.querySelector("del")?.textContent).toBe("s");
    expect(c.querySelector("p code")?.textContent).toBe("c");
    expect(c.querySelector("blockquote")?.textContent).toContain("quote");
    expect(c.querySelector("hr")).toBeTruthy();
  });
  it("numbers nested lists correctly", () => {
    const c = html("1. one\n   - x\n   - y\n2. two\n3. three");
    const ol = c.querySelector("ol")!;
    expect(ol.children).toHaveLength(3);
    expect(ol.querySelectorAll(":scope > li > ul > li")).toHaveLength(2);
    expect(ol.children[2].textContent).toBe("three");
  });
  it("renders task lists with disabled checkboxes", () => {
    const boxes = html("- [x] done\n- [ ] todo").querySelectorAll<HTMLInputElement>("input[type=checkbox]");
    expect(boxes).toHaveLength(2);
    expect(boxes[0].checked).toBe(true);
    expect(boxes[1].checked).toBe(false);
    expect([...boxes].every((b) => b.disabled)).toBe(true);
  });
  it("renders tables inside a scroll wrapper", () => {
    const c = html("| a | b |\n|---|---|\n| 1 | 2 |");
    expect(c.querySelector(".table-wrap > table th")?.textContent).toBe("a");
    expect(c.querySelectorAll("td")).toHaveLength(2);
  });
  it("autolinks safely", () => {
    const a = html("see https://example.com now").querySelector("a")!;
    expect(a.getAttribute("href")).toBe("https://example.com");
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toBe("noopener noreferrer nofollow");
  });
  it("turns single newlines into line breaks but leaves lists and code alone", () => {
    const c = html("a\nb\n\n- x\n- y\n\n```\nl1\nl2\n```");
    expect(c.querySelectorAll("p br")).toHaveLength(1);
    expect(c.querySelectorAll("li br")).toHaveLength(0);
    expect(c.querySelectorAll("pre br")).toHaveLength(0);
    expect(c.querySelector("pre code")?.textContent).toBe("l1\nl2\n");
  });
});

describe("security", () => {
  const hostile = [
    "<img src=x onerror=alert(1)>",
    "<script>alert(1)</script>",
    "<iframe src=\"javascript:alert(1)\"></iframe>",
    "[x](javascript:alert(1))",
    "![x](javascript:alert(1))",
    "[x](  javascript:alert(1))",
    "[x](JaVaScRiPt:alert(1))",
    "<a href=\"javascript:alert(1)\">x</a>",
    "[x](data:text/html,<script>alert(1)</script>)",
    "[x](vbscript:msgbox(1))",
    "[x](file:///etc/passwd)",
    "[x](/relative/path)",
    "![x](https://evil.example/track.png)",
  ];
  for (const input of hostile) {
    it(`is inert: ${input}`, () => {
      const c = html(input);
      expect(c.querySelector("script, img, iframe, object, embed")).toBeNull();
      for (const el of c.querySelectorAll("*")) expect([...el.attributes].some((a) => /^on/i.test(a.name))).toBe(false);
      for (const a of c.querySelectorAll("a")) expect(a.getAttribute("href")).toMatch(/^(https?:|mailto:)/i);
    });
  }
  it("renders unsafe-scheme links as plain text", () => {
    const c = html("[click](javascript:alert(1)) and [rel](/x)");
    expect(c.querySelector("a")).toBeNull();
    expect(c.textContent).toContain("click");
    expect(c.textContent).toContain("rel");
  });
  it("renders images as links with alt text, or the URL", () => {
    const c = html("![cat](https://example.com/c.png) ![](http://example.com/d.png)");
    const links = c.querySelectorAll("a");
    expect(links[0].textContent).toBe("cat");
    expect(links[0].getAttribute("href")).toBe("https://example.com/c.png");
    expect(links[1].textContent).toBe("http://example.com/d.png");
    expect(c.querySelector("img")).toBeNull();
  });
  it("allows mailto links", () => {
    expect(html("[m](mailto:a@b.co)").querySelector("a")?.getAttribute("href")).toBe("mailto:a@b.co");
  });
  it("shows raw HTML as text, not elements", () => {
    const c = html("<b>x</b>");
    expect(c.querySelector("b")).toBeNull();
  });
});

describe("code blocks", () => {
  afterEach(() => vi.useRealTimers());
  const setClipboard = (writeText: unknown) => Object.defineProperty(navigator, "clipboard", { value: writeText === undefined ? undefined : { writeText }, configurable: true });

  it("shows language, highlights, and keeps raw code", () => {
    const c = html("```js\nconst a = 1;\n```");
    expect(c.querySelector(".code-lang")?.textContent).toBe("js");
    expect(c.querySelector(".hljs-keyword")?.textContent).toBe("const");
  });
  it("labels language-less fences 'text'", () => {
    expect(html("```\nhi\n```").querySelector(".code-lang")?.textContent).toBe("text");
  });
  it("does not throw on unknown languages and leaves them unhighlighted", () => {
    const c = html("```klingon\nqapla 'a\n```");
    expect(c.querySelector("pre code")?.textContent).toContain("qapla");
    expect(c.querySelector(".hljs-keyword")).toBeNull();
  });
  it("copies raw code and shows Copied then reverts", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard(writeText);
    html("```js\nconst a = 1;\nlet b;\n```");
    const btn = screen.getByRole("button", { name: "Copy code" });
    expect(btn.textContent).toBe("Copy");
    await act(async () => { fireEvent.click(btn); });
    expect(writeText).toHaveBeenCalledWith("const a = 1;\nlet b;");
    expect(btn.textContent).toBe("Copied");
    await act(async () => { vi.advanceTimersByTime(1600); });
    expect(btn.textContent).toBe("Copy");
  });
  it("shows Copy failed when the clipboard rejects or is missing", async () => {
    setClipboard(vi.fn().mockRejectedValue(new Error("denied")));
    html("```\nx\n```");
    const btn = screen.getByRole("button", { name: "Copy code" });
    await act(async () => { fireEvent.click(btn); });
    expect(btn.textContent).toBe("Copy failed");
    cleanupAndRetryMissing();
    function cleanupAndRetryMissing() { setClipboard(undefined); }
    await act(async () => { fireEvent.click(btn); });
    expect(btn.textContent).toBe("Copy failed");
  });
  it("renders an unterminated fence as a code block", () => {
    const c = html("text\n\n```python\nprint(1)");
    expect(c.querySelector(".code-block pre code")?.textContent).toContain("print(1)");
    expect(c.querySelector(".code-lang")?.textContent).toBe("python");
  });
});

describe("streaming robustness and performance", () => {
  it("does not throw on partial markdown", () => {
    for (const t of ["**bold", "| a | b |\n|---", "| a | b |\n|---|---|\n| 1", "- [", "[link](http://x", "![", "```", "1. a\n   - "]) {
      expect(() => html(t)).not.toThrow();
    }
  });
  it("falls back to a raw <pre> if rendering throws", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const Bomb = () => {
      throw new Error("boom");
    };
    const { container } = render(
      <MarkdownBoundary text="raw **text**">
        <Bomb />
      </MarkdownBoundary>,
    );
    spy.mockRestore();
    expect(container.querySelector("pre.md-fallback")?.textContent).toBe("raw **text**");
  });
  it("does not re-render when text is identical", () => {
    const { rerender, container } = render(<Markdown text="# hi" />);
    const h = container.querySelector("h1");
    rerender(<Markdown text="# hi" />);
    expect(container.querySelector("h1")).toBe(h);
  });
  it("renders 200 KB in under 1.5 s", () => {
    const para = "Some **bold** text with `code` and a [link](https://example.com) in a paragraph. " + "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(10) + "\n\n";
    const text = para.repeat(Math.ceil(200_000 / para.length));
    expect(text.length).toBeGreaterThanOrEqual(200_000);
    const t0 = performance.now();
    html(text);
    expect(performance.now() - t0).toBeLessThan(1500);
  });
  it("handles 5,000 short lines", () => {
    const text = Array.from({ length: 5000 }, (_, i) => `line ${i}`).join("\n");
    expect(() => html(text)).not.toThrow();
  });
  it("handles a 5,000-character word", () => {
    expect(html("a".repeat(5000)).textContent).toHaveLength(5000);
  });
});
