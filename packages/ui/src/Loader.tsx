import { useEffect, useState } from "react";

/**
 * The old loader choice (marching grid, spheres) is gone: every chat shows the quiet working row
 * (components/thread/WorkingRow.tsx). The saved key and these helpers stay only because the Settings page
 * still imports them; remove them together with its loader picker.
 */
export const LOADERS = ["grid", "light", "mist"] as const;
export type LoaderKind = (typeof LOADERS)[number];
const KEY = "pheme-loader";

export const LOADER_LABEL: Record<LoaderKind, string> = {
  grid: "Marching grid",
  light: "Sphere of light",
  mist: "Sphere of mist",
};

/** The saved choice. Anything else, including a blocked store, is the default. */
export function loaderKind(): LoaderKind {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "grid" || v === "light" || v === "mist") return v;
  } catch { /* private mode: the default still shows */ }
  return "grid";
}

export function setLoaderKind(kind: LoaderKind): void {
  try { localStorage.setItem(KEY, kind); } catch { /* this tab still shows it */ }
  window.dispatchEvent(new Event("pheme-loader"));
}

export function useLoaderKind(): LoaderKind {
  const [kind, setKind] = useState<LoaderKind>(loaderKind);
  useEffect(() => {
    const sync = () => setKind(loaderKind());
    window.addEventListener("pheme-loader", sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener("pheme-loader", sync); window.removeEventListener("storage", sync); };
  }, []);
  return kind;
}

/** The working square alone, for the legacy picker preview. Ignores the kind. */
export function Loader({ kind, quiet = false }: { kind: LoaderKind; quiet?: boolean }) {
  return <span className="working-square loader" aria-hidden={quiet || undefined} data-loader={kind} />;
}
