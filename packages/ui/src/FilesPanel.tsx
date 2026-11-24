import { useCallback, useEffect, useState } from "react";
import { api, type DirList } from "./api.ts";

/** Read-only folder list. Names only. Cannot leave the chat's project folder, or the home folder when none is set. */
export function FilesPanel({ chatId, onClose }: { chatId: string; onClose: () => void }) {
  const [list, setList] = useState<DirList | null>(null);
  const [error, setError] = useState("");
  const [path, setPath] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (next: string) => {
    setLoading(true);
    setError("");
    try {
      setList(await api.files(chatId, next));
      setPath(next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [chatId]);

  useEffect(() => { setPath(""); void load(""); }, [load]);

  return (
    <aside className="changes-panel files-panel" aria-label="Files">
      <header className="changes-head">
        <h2>{list?.label ?? "Files"}</h2>
        <span className="spacer" />
        <button className="icon-btn" aria-label="Refresh files" title="Refresh" onClick={() => void load(path)} disabled={loading}>{loading ? "…" : "↻"}</button>
        <button className="icon-btn" aria-label="Close files" title="Close" onClick={onClose}>✕</button>
      </header>
      <div className="changes-body">
        {error && <p className="notice error" role="alert">{error}</p>}
        {list && list.parent !== null && (
          <button className="file-row" onClick={() => void load(list.parent ?? "")}>
            <span aria-hidden="true">↑</span>
            <span className="change-path">..</span>
          </button>
        )}
        <ul className="file-list">
          {(list?.entries ?? []).map((e) => (
            <li key={e.name}>
              {e.dir ? (
                <button className="file-row" onClick={() => void load(path ? `${path}/${e.name}` : e.name)}>
                  <span aria-hidden="true">▸</span>
                  <span className="change-path">{e.name}</span>
                </button>
              ) : (
                <div className="file-row file-plain"><span aria-hidden="true">·</span><span className="change-path">{e.name}</span></div>
              )}
            </li>
          ))}
        </ul>
        {list && list.entries.length === 0 && !error && <p className="muted small">This folder is empty.</p>}
        {!!list?.more && <p className="muted small">…and {list.more} more not shown.</p>}
        <p className="muted small">Names only. Pheme does not open these files from here.</p>
      </div>
    </aside>
  );
}
