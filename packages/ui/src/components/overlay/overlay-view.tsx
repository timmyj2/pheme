// Adapted from hermes-agent (MIT, Copyright (c) 2025 Nous Research), apps/desktop/src/app/overlays/overlay-view.tsx @ 5688461d
// Pheme has no titlebar in a browser, so the card keeps the Hermes geometry (inset, radius, scrim, close button) without the titlebar offsets.
import { type ReactNode, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { IconX } from "../../lib/icons.ts";
import { cn } from "../../lib/utils.ts";
import "./overlay.css";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

interface OverlayViewProps {
  children: ReactNode;
  onClose: () => void;
  /** Accessible name of the card (the overlay is a modal dialog). */
  label: string;
  closeLabel?: string;
  /** Chrome pinned to the card's top edge, centred and straddling the border (the settings search pill). Rendered beside the card. */
  edgeBadge?: ReactNode;
}

/** A centred card over a dimmed, blurred scrim. Escape, the scrim and the X close it; Tab stays inside it. */
export function OverlayView({ children, onClose, label, closeLabel = "Close", edgeBadge }: OverlayViewProps) {
  const card = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    card.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      const el = card.current;
      if (!el) return;
      if (e.key === "Escape") {
        // A control that already handled Escape (a search box clearing itself) or a nested dialog keeps it.
        const target = e.target instanceof Element ? e.target : null;
        const nested = target?.closest('[role="dialog"],[role="alertdialog"],[role="listbox"],[role="menu"]');
        if (e.defaultPrevented || (nested && !el.contains(nested))) return;
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      // Focus trap: Tab and Shift+Tab wrap inside the card.
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => !n.closest("[hidden]"));
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      if (!el.contains(active) || (e.shiftKey ? active === first || active === el : active === last)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/22 p-[2.4rem_2.2rem_1.75rem] backdrop-blur-[0.125rem]"
      data-overlay-surface=""
      onClick={(e) => { if (e.target === e.currentTarget) onCloseRef.current(); }}
      role="presentation"
    >
      <div className="relative h-full min-h-0">
        <div
          aria-label={label}
          aria-modal="true"
          className="settings-overlay relative flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-chat-surface-background) text-[13px] text-(--ui-text-primary) shadow-md outline-none"
          ref={card}
          role="dialog"
          tabIndex={-1}
        >
          <button
            aria-label={closeLabel}
            className="overlay-close absolute right-3 top-3 z-10 flex size-7 items-center justify-center rounded-md text-(--ui-text-tertiary) transition-colors hover:bg-(--ui-control-hover-background) hover:text-foreground focus-visible:outline-hidden focus-visible:ring-[0.1875rem] focus-visible:ring-ring/50"
            onClick={() => onCloseRef.current()}
            type="button"
          >
            <IconX className="size-4" aria-hidden="true" />
          </button>
          <div className={cn("flex min-h-0 flex-1 flex-col")}>{children}</div>
        </div>
        {edgeBadge && <div className="absolute left-1/2 top-0 z-20 -translate-x-1/2 -translate-y-1/2">{edgeBadge}</div>}
      </div>
    </div>,
    document.body,
  );
}
