import type { CSSProperties, ReactNode } from "react";
import { useEnterAnimation } from "./enter-animation.ts";

/** A block wrapper that slides in once (see useEnterAnimation). */
export function Enter({ id, enabled, className, style, testId, children }: { id: string; enabled: boolean; className?: string; style?: CSSProperties; testId?: string; children: ReactNode }) {
  const ref = useEnterAnimation(enabled, id);
  return <div ref={ref} className={className} style={style} data-testid={testId}>{children}</div>;
}
