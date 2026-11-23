import { Suspense, lazy } from "react";

// The markdown and syntax-highlighting code is about two thirds of the app's JavaScript. It loads in its own file,
// started right after the first paint, so the chat shell appears sooner and an empty chat never pays for it.
const load = () => import("./Markdown.tsx").then((m) => ({ default: m.Markdown }));
const Markdown = lazy(load);

/** Begin downloading the markdown code now (safe to call many times). */
export function preloadMarkdown(): void {
  void load().catch(() => {});
}
if (typeof window !== "undefined") {
  const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback;
  if (idle) idle(preloadMarkdown);
  else setTimeout(preloadMarkdown, 200);
}

/** Plain text while the renderer loads: the words are readable immediately, then become formatted. */
export function LazyMarkdown({ text }: { text: string }) {
  return (
    <Suspense fallback={<div className="md md-plain">{text}</div>}>
      <Markdown text={text} />
    </Suspense>
  );
}
