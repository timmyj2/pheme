import { GlyphSpinner } from "./components/ui/glyph-spinner.tsx";
import { IconArrowUp, IconFile, IconFolder, IconRefresh } from "./lib/icons.ts";
import { useCallback, useEffect, useState } from "react";
import { api, type DirList } from "./api.ts";

/** One row of the file tree: a line icon and the name, 22px tall, like the reference. */
const TREE_ROW = "flex h-[22px] w-full items-center gap-2 border-0 bg-transparent px-3 text-left text-[12px] text-foreground/85 hover:bg-foreground/[0.05]";

/** Read-only folder list. Names only. Cannot leave the chat's project folder, or the home folder when none is set. */
export function FilesPanel({ chatId }: { chatId: string }) {
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
    <div className="flex min-h-0 flex-1 flex-col" aria-label="Files" data-testid="files-panel">
      <div className="flex h-6 flex-none items-center justify-end px-2">
        <button className="icon-btn rounded p-0.5 text-muted-foreground hover:text-foreground" aria-label="Refresh files" title="Refresh" onClick={() => void load(path)} disabled={loading}>{loading ? <GlyphSpinner /> : <IconRefresh className="size-3.5" aria-hidden="true" />}</button>
      </div>
      <div className="changes-body files-body">
        {error && <p className="notice error" role="alert">{error}</p>}
        {list && list.parent !== null && (
          <button className="file-row" onClick={() => void load(list.parent ?? "")}>
            <IconArrowUp className="size-3.5" aria-hidden="true" />
            <span className="change-path">..</span>
          </button>
        )}
        <ul className="flex flex-col">
          {(list?.entries ?? []).map((e) => (
            <li key={e.name}>
              {e.dir ? (
                <button className={TREE_ROW} onClick={() => void load(path ? `${path}/${e.name}` : e.name)}>
                  <IconFolder className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{e.name}</span>
                </button>
              ) : (
                <div className={`${TREE_ROW} text-muted-foreground`}><IconFile className="size-3.5 shrink-0" aria-hidden="true" /><span className="min-w-0 flex-1 truncate">{e.name}</span></div>
              )}
            </li>
          ))}
        </ul>
        {list && list.entries.length === 0 && !error && <p className="muted small">This folder is empty.</p>}
        {!!list?.more && <p className="muted small">…and {list.more} more not shown.</p>}
        <p className="muted small">Names only. Pheme does not open these files from here.</p>
      </div>
    </div>
  );
}
