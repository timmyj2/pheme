import { expect, test } from "@playwright/test";

const TOKEN = "e2e-token-0123456789abcdefghij";

test.describe("design tokens in a real browser", () => {
  test("body metrics, radius scalar, default theme and the bundled mono font", async ({ page }) => {
    const external: string[] = [];
    page.on("request", (r) => { const u = new URL(r.url()); if (u.hostname !== "127.0.0.1" && !r.url().startsWith("data:")) external.push(r.url()); });
    // The e2e server is shared and earlier tests change the theme, so set the default explicitly (DEFAULT_SETTINGS.theme is pinned in a server test).
    await page.request.put("/api/settings", { headers: { "x-pheme-token": TOKEN, "content-type": "application/json" }, data: { theme: "pheme-gold-dark" } });
    await page.goto(`/?token=${TOKEN}#/`);
    await expect(page.getByRole("button", { name: "New chat" })).toBeVisible();
    const m = await page.evaluate(async () => {
      const cs = getComputedStyle(document.body);
      const root = getComputedStyle(document.documentElement);
      const probe = document.createElement("code");
      probe.style.fontFamily = "var(--dt-font-mono)";
      probe.textContent = "x";
      document.body.append(probe);
      await document.fonts.load('400 13px "JetBrains Mono"');
      await document.fonts.load('700 13px "JetBrains Mono"');
      await document.fonts.load('italic 400 13px "JetBrains Mono"');
      const out = {
        fontSize: cs.fontSize, lineHeight: cs.lineHeight, scalar: root.getPropertyValue("--radius-scalar").trim(),
        dark: document.documentElement.classList.contains("dark"), bg: cs.backgroundColor, primary: root.getPropertyValue("--theme-primary").trim().toLowerCase(),
        mono: ["400 13px", "700 13px", "italic 400 13px"].map((f) => document.fonts.check(`${f} "JetBrains Mono"`)),
        loaded: [...document.fonts].filter((f) => f.family.includes("JetBrains") && f.status === "loaded").length,
        textScale: root.getPropertyValue("--chat-text-scale").trim(),
      };
      probe.remove();
      return out;
    });
    expect(m.fontSize).toBe("13px");
    expect(m.lineHeight).toBe("19.5px"); // 1.5
    expect(parseFloat(m.scalar)).toBe(0.2);
    expect(m.dark).toBe(true);
    expect(m.primary).toBe("#ffbf00");
    // The chrome mix of the gold-on-navy seeds, about #171726. Chromium serialises color-mix results as color(srgb r g b).
    const ch = (/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)\)/.exec(m.bg) ?? /rgb\((\d+), (\d+), (\d+)\)/.exec(m.bg) ?? []).slice(1).map((v) => (m.bg.startsWith("color") ? Math.round(Number(v) * 255) : Number(v)));
    expect(ch).toEqual([23, 23, 38]);
    expect(m.mono).toEqual([true, true, true]);
    expect(m.loaded).toBe(3);
    expect(m.textScale).toBe("1.1");
    expect(external).toEqual([]);
  });
});
