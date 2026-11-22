import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => cleanup());

// jsdom has no matchMedia / scrollIntoView / ResizeObserver / clipboard; components rely on them.
if (!window.matchMedia) {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia;
}
Element.prototype.scrollIntoView = function () {};
Element.prototype.scrollTo = function (this: Element, o?: ScrollToOptions | number) { if (typeof o === "object" && o.top !== undefined) this.scrollTop = o.top; } as never;
if (!("ResizeObserver" in window)) {
  (window as unknown as Record<string, unknown>).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
}

// Node 26 has its own experimental `localStorage` global that shadows jsdom's and is unusable without a file.
// Use jsdom's real implementation so Storage.prototype spies work like they do in a browser.
const jsdomWindow = (globalThis as unknown as { jsdom?: { window: Window } }).jsdom?.window;
if (jsdomWindow) {
  Object.defineProperty(globalThis, "localStorage", { value: jsdomWindow.localStorage, configurable: true });
  Object.defineProperty(globalThis, "sessionStorage", { value: jsdomWindow.sessionStorage, configurable: true });
}
