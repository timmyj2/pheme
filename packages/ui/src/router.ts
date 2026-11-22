import { useCallback, useEffect, useState } from "react";

export type Route =
  | { view: "chat"; chatId: string | null }
  | { view: "skills"; name: string | null }
  | { view: "memory" }
  | { view: "agents" }
  | { view: "jobs" }
  | { view: "settings" };

export type View = Route["view"];

const ID_RE = /^[A-Za-z0-9-]{1,64}$/;
const NAME_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/** "#/chat/<id>", "#/skills/<name>", "#/memory", ... Unknown or malformed hashes fall back to a new chat. */
export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map((p) => {
    try {
      return decodeURIComponent(p);
    } catch {
      return "";
    }
  });
  const [head, arg] = parts;
  switch (head) {
    case "chat":
      return { view: "chat", chatId: arg && ID_RE.test(arg) ? arg : null };
    case "skills":
      return { view: "skills", name: arg && NAME_RE.test(arg) ? arg : null };
    case "memory":
    case "agents":
    case "jobs":
    case "settings":
      return { view: head };
    default:
      return { view: "chat", chatId: null };
  }
}

export function toHash(r: Route): string {
  switch (r.view) {
    case "chat":
      return r.chatId ? `#/chat/${r.chatId}` : "#/";
    case "skills":
      return r.name ? `#/skills/${encodeURIComponent(r.name)}` : "#/skills";
    default:
      return `#/${r.view}`;
  }
}

export function sameRoute(a: Route, b: Route): boolean {
  return toHash(a) === toHash(b);
}

/** Hash routing keeps reload, back/forward and deep links working with no server support. */
export function useRoute(): [Route, (r: Route, opts?: { replace?: boolean }) => void] {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const navigate = useCallback((r: Route, opts?: { replace?: boolean }) => {
    const h = toHash(r);
    if (opts?.replace) window.history.replaceState(null, "", h);
    else if (window.location.hash !== h) window.location.hash = h;
    setRoute(r);
  }, []);
  return [route, navigate];
}
