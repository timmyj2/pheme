import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LazyMarkdown, preloadMarkdown } from "../src/LazyMarkdown.tsx";

describe("LazyMarkdown", () => {
  it("shows the words at once and then the formatted result", async () => {
    const { container } = render(<LazyMarkdown text={"**bold** and `code`"} />);
    // Either the plain fallback or the finished render may be showing first; the text is never missing.
    expect(container.textContent).toContain("bold");
    expect(await screen.findByText("bold", { selector: "strong" })).toBeInTheDocument();
    expect(container.querySelector("code")?.textContent).toBe("code");
  });
  it("preload is safe to call repeatedly", () => {
    expect(() => { preloadMarkdown(); preloadMarkdown(); }).not.toThrow();
  });
});
