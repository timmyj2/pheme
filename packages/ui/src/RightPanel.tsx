// Adapted from hermes-agent (MIT, Copyright (c) 2025 Nous Research), apps/desktop/src/app/shell/right-sidebar (docked column, bottom tab row) and docs/visual/hermes-reference/right-panel-files.png @ 5688461d (layout only).
import { useState } from "react";
import { ChangesPanel } from "./ChangesPanel.tsx";
import { FilesPanel } from "./FilesPanel.tsx";
import { SectionLabel } from "./components/ui/rail.tsx";
import type { GitStatus } from "./api.ts";
import { TID } from "./testids.ts";

interface Props {
  chatId: string;
  /** The chat's project folder. Its name is the column heading. */
  dir: string | undefined;
  status: GitStatus | null;
  error: string;
  loading: boolean;
  busy: boolean;
  onRefresh: () => void;
}

/** Docked right column (about 209px): the project's file tree and its Git changes, as two tabs at the bottom. */
export function RightPanel({ chatId, dir, status, error, loading, busy, onRefresh }: Props) {
  const [tab, setTab] = useState<"files" | "changes">("files");
  const name = dir ? dir.split(/[\\/]/).filter(Boolean).pop() ?? dir : "Project";
  const count = (status?.files.length ?? 0) + (status?.moreFiles ?? 0);
  const tabBtn = (id: "files" | "changes", label: string) => (
    <button
      role="tab"
      aria-selected={tab === id}
      data-testid={id === "files" ? TID.rightTabFiles : TID.rightTabChanges}
      className={`flex flex-1 items-center justify-center gap-1 border-b-2 text-[11px] font-medium uppercase tracking-[0.04em] ${tab === id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
      onClick={() => setTab(id)}
    >
      {label}
    </button>
  );
  return (
    <aside className="flex h-full min-h-0 w-[209px] flex-none flex-col border-l border-border/60 bg-background" aria-label="Right panel" data-testid={TID.rightPanel}>
      <header className="flex h-8 flex-none items-center px-3">
        <SectionLabel className="min-w-0 truncate">
          <span className="truncate" title={dir}>{name}</span>
        </SectionLabel>
      </header>
      <div className="flex min-h-0 flex-1 flex-col" role="tabpanel">
        {tab === "files" ? (
          <FilesPanel chatId={chatId} />
        ) : (
          <ChangesPanel chatId={chatId} status={status} error={error} loading={loading} onRefresh={onRefresh} busy={busy} />
        )}
      </div>
      <div className="flex h-7 flex-none items-stretch border-t border-border/60" role="tablist" aria-label="Right panel tabs">
        {tabBtn("files", "Files")}
        {tabBtn("changes", count ? `Changes ${count}` : "Changes")}
      </div>
    </aside>
  );
}
