// Adapted from hermes-agent (MIT, Copyright (c) 2025 Nous Research), apps/desktop/src/lib/use-enter-animation.ts @ 5688461d
import { useCallback, useRef } from "react";

/**
 * One-shot enter slide via the Web Animations API. The callback ref plays once when the element attaches and never
 * replays for the same key. Transform only (no opacity keyframes), so a paused document cannot leave a row invisible.
 * Off under prefers-reduced-motion. `enabled` is read at mount time only.
 */
const played = new Set<string>();
const order: string[] = [];
const MAX_TRACKED = 2048;

function remember(key: string): void {
  if (played.has(key)) return;
  played.add(key);
  order.push(key);
  if (order.length > MAX_TRACKED) {
    const evicted = order.shift();
    if (evicted) played.delete(evicted);
  }
}

export function useEnterAnimation(enabled: boolean, animationKey?: string): (el: HTMLElement | null) => void {
  const enabledRef = useRef(enabled);
  const keyRef = useRef(animationKey);
  enabledRef.current = enabled;
  keyRef.current = animationKey;
  return useCallback((el: HTMLElement | null) => {
    if (!el || !enabledRef.current || typeof window === "undefined" || typeof el.animate !== "function") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const key = keyRef.current;
    if (key && played.has(key)) return;
    el.animate([{ transform: "translateY(0.375rem)" }, { transform: "translateY(0)" }], {
      duration: 180,
      easing: "cubic-bezier(0.16, 1, 0.3, 1)",
      fill: "backwards",
    });
    if (key) queueMicrotask(() => { if (el.isConnected) remember(key); });
  }, []);
}
