// Adapted from hermes-agent (MIT, Copyright (c) 2025 Nous Research), apps/desktop/src/components/ui/glyph-spinner.tsx @ 5688461d
// Rewritten: the upstream frame sets come from the unicode-animations package and pause on pane visibility. Pheme keeps one
// braille set inline and takes an explicit `paused` prop instead.
import type { CSSProperties } from "react";
import "./glyph-spinner.css";
import { cn } from "../../lib/utils";

// The braille "dots" spinner from unicode-animations (MIT), one character per frame.
const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const INTERVAL_MS = 80;

export type GlyphSpinnerVars = CSSProperties & {
  "--glyph-spinner-duration": string;
  "--glyph-spinner-frames": number;
};

interface GlyphSpinnerProps {
  ariaLabel?: string;
  className?: string;
  /** Freeze the animation while the spinner stays mounted. */
  paused?: boolean;
}

/** Compositor-only braille spinner: every frame is in the DOM and a CSS transform steps through them. */
export function GlyphSpinner({ ariaLabel = "Loading", className, paused = false }: GlyphSpinnerProps) {
  const vars: GlyphSpinnerVars = {
    "--glyph-spinner-duration": `${FRAMES.length * INTERVAL_MS}ms`,
    "--glyph-spinner-frames": FRAMES.length,
  };
  return (
    <span aria-label={ariaLabel} className={cn("inline-flex items-center justify-center font-mono leading-none tabular-nums", className)} role="status">
      <span aria-hidden="true" className="glyph-spinner" data-paused={paused ? "true" : undefined}>
        <span className="glyph-spinner__strip" style={vars}>
          {FRAMES.map((frame, index) => (
            <span className="glyph-spinner__frame" key={index}>
              {frame}
            </span>
          ))}
        </span>
      </span>
    </span>
  );
}
