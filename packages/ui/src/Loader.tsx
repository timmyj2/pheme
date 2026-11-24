import { useEffect, useState } from "react";

export const LOADERS = ["grid", "light", "mist"] as const;
export type LoaderKind = (typeof LOADERS)[number];
const KEY = "pheme-loader";

export const LOADER_LABEL: Record<LoaderKind, string> = {
  grid: "Marching grid",
  light: "Sphere of light",
  mist: "Sphere of mist",
};

/** The saved choice. Anything else, including a blocked store, is the marching grid. */
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

/** The working mark in a chat. Original motion, coloured with the theme accent. */
export function Loader({ kind, label = "Pheme is working", quiet = false }: { kind: LoaderKind; label?: string; quiet?: boolean }) {
  return (
    <div className={`loader loader-${kind}`} role={quiet ? undefined : "status"} aria-label={quiet ? undefined : label} aria-hidden={quiet || undefined} data-loader={kind}>
      {kind === "grid" && Array.from({ length: 25 }, (_, i) => <i key={i} style={{ animationDelay: `${i * 0.06}s` }} />)}
      {kind === "light" && <i />}
      {kind === "mist" && Array.from({ length: 18 }, (_, i) => {
        const a = (i / 18) * Math.PI * 2;
        const r = 38 + (i % 3) * 8;
        return <i key={i} style={{ left: `${50 + Math.cos(a) * r}%`, top: `${50 + Math.sin(a) * r}%`, animationDelay: `${(i % 6) * 0.18}s` }} />;
      })}
    </div>
  );
}
