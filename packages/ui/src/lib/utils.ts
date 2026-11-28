// Adapted from hermes-agent (MIT, Copyright (c) 2025 Nous Research), apps/desktop/src/lib/utils.ts @ 5688461d
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Join class names, then let later Tailwind utilities win over earlier conflicting ones. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
