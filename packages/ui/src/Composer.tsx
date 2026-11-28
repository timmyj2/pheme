import { IconArrowUp, IconGitBranch, IconPaperclip, IconPhoto, IconPlus, IconX } from "./lib/icons.ts";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from "react";
import { ACCEPT, checkFiles, DEFAULT_TEXT, isImage, nameForPasted, sizeLabel } from "./attach.ts";
import { firstPlaceholder, PromptList, promptsFor, SaveAsPrompt, usePrompts } from "./PromptPicker.tsx";
import { loadDraft, loadHistory, pushHistory, saveDraft } from "./drafts.ts";
import { TID } from "./testids.ts";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "./components/ui/dropdown-menu.tsx";
import { StatusStack, type ActivityRun } from "./components/composer/status-stack.tsx";

/** The server rejects bodies over 1,000,000 bytes; stay safely under that. */
export const MAX_CHARS = 250_000;

/** Short hints that take turns in the empty box. The first one of each list is shown first. */
const NEW_PLACEHOLDERS = ["What can I help with?", "Give Pheme a task", "Describe what you need", "Ask anything"];
const FOLLOWUP_PLACEHOLDERS = ["Add more context", "Send a follow-up", "Refine the request", "What's next?"];
const PLACEHOLDER_MS = 5000;

/** The git facts the composer's top strip shows, from the chat's project folder. Null when there is no repository. */
export interface GitStrip { branch: string; behind: number; changed: number }

export interface ComposerHandle {
  focus: () => void;
  /** Replace the text (used by suggestion chips). */
  set: (text: string) => void;
  /** Append text (used to hand back queued messages after Stop). */
  insert: (text: string) => void;
  /** Put files back in the composer (used when an upload fails, so nothing is lost). */
  addFiles: (files: File[]) => void;
}

interface Props {
  chatId: string | null;
  busy: boolean;
  offline: boolean;
  queue: string[];
  hasMessages: boolean;
  /** The chat's project folder, so project-specific prompts are offered. */
  projectDir?: string;
  onSend: (text: string, files: File[]) => void;
  onStop: () => void;
  onRemoveQueued: (i: number) => void;
  /** Sits in the box, before Send. Used for the model and effort pills. */
  extra?: ReactNode;
  /** The chat's repository, for the strip at the top of the box. Omitted when the folder is not a repository. */
  git?: GitStrip | null;
  /** Agent runs still going in this chat (shown in the status stack). */
  activity?: ActivityRun[];
}

export const Composer = forwardRef<ComposerHandle, Props>(function Composer({ chatId, busy, offline, queue, hasMessages, projectDir, onSend, onStop, onRemoveQueued, extra, git, activity = [] }, ref) {
  const [text, setText] = useState(() => loadDraft(chatId));
  const latest = useRef(text); // the current text, readable from cleanup code after the textarea is gone
  latest.current = text;
  const ta = useRef<HTMLTextAreaElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [fileNote, setFileNote] = useState("");
  const [dragging, setDragging] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  // saved prompts: the "+" menu opens a searchable list; typing "/" at the start of the box does the same inline
  const [promptsOpen, setPromptsOpen] = useState(false);
  const [promptFilter, setPromptFilter] = useState("");
  const [active, setActive] = useState(0);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const [savingPrompt, setSavingPrompt] = useState(false);
  const filesRef = useRef(files);
  filesRef.current = files;
  const histIdx = useRef(-1); // -1 = not browsing history
  const stash = useRef("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [hint, setHint] = useState(0);
  const hints = hasMessages ? FOLLOWUP_PLACEHOLDERS : NEW_PLACEHOLDERS;
  const placeholder = hints[hint % hints.length];
  // The hint takes turns only while the box is empty and the tab is in view; the first one shows at once.
  const rotate = !text && !busy && !offline;
  useEffect(() => {
    if (!rotate) return;
    const id = setInterval(() => { if (!document.hidden) setHint((h) => h + 1); }, PLACEHOLDER_MS);
    return () => clearInterval(id);
  }, [rotate, chatId]);
  useEffect(() => { setHint(0); }, [chatId, hasMessages]);

  // Switching chats swaps the draft; the old chat's draft was already saved as it was typed.
  useEffect(() => {
    setText(loadDraft(chatId));
    histIdx.current = -1;
  }, [chatId]);

  const grow = useCallback(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 260) + "px";
  }, []);
  useEffect(grow, [text, grow]);

  const update = (v: string) => {
    setText(v);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveDraft(chatId, v), 250);
  };
  useEffect(() => () => clearTimeout(saveTimer.current), []);
  useEffect(() => {
    // Save the draft when the tab is hidden or closed, and when leaving this chat, so typing is never lost.
    const flush = () => saveDraft(chatId, latest.current);
    window.addEventListener("pagehide", flush);
    return () => { flush(); window.removeEventListener("pagehide", flush); };
  }, [chatId]);

  const addFiles = useCallback((incoming: File[], pasted = false) => {
    const prepared = pasted ? incoming.map((f, i) => nameForPasted(f, filesRef.current.length + i + 1)) : incoming;
    const { accepted, problems } = checkFiles(prepared, filesRef.current.length);
    if (accepted.length) setFiles((cur) => [...cur, ...accepted]);
    setFileNote(problems.join(" "));
  }, []);
  // Attachments belong to the message being written: switching chats starts with none.
  useEffect(() => { setFiles([]); setFileNote(""); }, [chatId]);

  useImperativeHandle(ref, () => ({
    focus: () => ta.current?.focus(),
    set: (t: string) => { update(t); ta.current?.focus(); },
    insert: (t: string) => { setText((cur) => (cur ? cur + "\n" : "") + t); ta.current?.focus(); },
    addFiles: (f: File[]) => addFiles(f),
  }), [addFiles]);

  const slashMode = /^\/[^\n]*$/.test(text) && dismissedFor !== text && !promptsOpen;
  const pickerVisible = promptsOpen || slashMode;
  const promptQuery = slashMode ? text.slice(1) : promptFilter;
  const prompts = usePrompts(pickerVisible);
  const promptItems = useMemo(() => promptsFor(prompts.all, projectDir, promptQuery), [prompts.all, projectDir, promptQuery]);
  useEffect(() => { setActive(0); }, [promptQuery, pickerVisible]);
  const closePrompts = () => { setPromptsOpen(false); setPromptFilter(""); setSavingPrompt(false); };

  const pickPrompt = (p: { text: string }) => {
    const base = slashMode || !text.trim() ? "" : text.replace(/\s+$/, "") + "\n";
    const next = base + p.text;
    update(next);
    closePrompts();
    setDismissedFor(null);
    requestAnimationFrame(() => {
      const el = ta.current;
      if (!el) return;
      el.focus();
      const ph = firstPlaceholder(p.text);
      if (ph) el.setSelectionRange(base.length + ph[0], base.length + ph[1]); // the first {{blank}} is selected, ready to type over
      else el.setSelectionRange(next.length, next.length);
    });
  };

  /** Arrow keys, Enter, Tab and Escape inside the prompt list. Returns true when the key was used. */
  const promptKey = (e: React.KeyboardEvent): boolean => {
    if (!pickerVisible) return false;
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); if (slashMode) setDismissedFor(text); closePrompts(); ta.current?.focus(); return true; }
    if (!promptItems.length) return false;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => (i + 1) % promptItems.length); return true; }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => (i - 1 + promptItems.length) % promptItems.length); return true; }
    if (e.key === "Enter" || (e.key === "Tab" && !e.shiftKey)) { e.preventDefault(); pickPrompt(promptItems[Math.min(active, promptItems.length - 1)]); return true; }
    return false;
  };

  const tooLong = text.length > MAX_CHARS;
  const waitingForReply = busy && files.length > 0; // the queue holds text only, so attachments go out once the reply is done
  const canSend = (!!text.trim() || files.length > 0) && !tooLong && !offline && !waitingForReply;

  const submit = () => {
    const t = text.trim();
    if ((!t && files.length === 0) || tooLong || offline || waitingForReply) return;
    if (t) pushHistory(t);
    histIdx.current = -1;
    onSend(t || DEFAULT_TEXT(files.length), files);
    clearTimeout(saveTimer.current);
    saveDraft(chatId, "");
    setText("");
    setFiles([]);
    setFileNote("");
    requestAnimationFrame(() => ta.current?.focus());
  };

  // After recalling a message the caret sits at its end; browsing must still continue from there, but not steal arrows from a multi-line edit.
  const onFirstLine = () => { const el = ta.current; return !el || !el.value.slice(0, el.selectionStart).includes("\n"); };
  const onLastLine = () => { const el = ta.current; return !el || !el.value.slice(el.selectionEnd).includes("\n"); };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // keyCode 229 = an IME (Japanese, Chinese...) is composing; Enter then confirms the candidate, not the message.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (slashMode && promptKey(e)) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    } else if (e.key === "Escape" && busy) {
      e.preventDefault();
      onStop();
    } else if (e.key === "ArrowUp" && !e.shiftKey && (text === "" || histIdx.current >= 0) && onFirstLine()) {
      const h = loadHistory();
      if (!h.length) return;
      e.preventDefault();
      if (histIdx.current < 0) stash.current = text;
      histIdx.current = Math.min(histIdx.current + 1, h.length - 1);
      setText(h[h.length - 1 - histIdx.current]);
    } else if (e.key === "ArrowDown" && histIdx.current >= 0 && onLastLine()) {
      e.preventDefault();
      const h = loadHistory();
      histIdx.current -= 1;
      setText(histIdx.current < 0 ? stash.current : h[h.length - 1 - histIdx.current]);
    }
  };

  const sendTitle = busy ? (text.trim() ? "Queue message" : "Stop the reply") : "Send message";
  const picking = () => picker.current?.click();

  return (
    <div
      className={`composer-wrap${dragging ? " dragging" : ""}`}
      data-testid={TID.composerWrap}
      data-dragging={dragging ? "true" : undefined}
      onDragOver={(e) => { if (e.dataTransfer?.types.includes("Files")) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false); }}
      onDrop={(e) => { if (e.dataTransfer?.files.length) { e.preventDefault(); setDragging(false); addFiles([...e.dataTransfer.files]); } }}
    >
      <StatusStack chatId={chatId} activity={activity} queue={queue} onRemoveQueued={onRemoveQueued} />
      {pickerVisible && (
        <div className="prompt-picker composer-panel-card" role="group" aria-label="Insert a saved prompt">
          {promptsOpen && (
            <input className="prompt-filter" autoFocus aria-label="Search prompts" placeholder="Search saved prompts…" value={promptFilter} onChange={(e) => setPromptFilter(e.target.value)} onKeyDown={(e) => { promptKey(e); }} />
          )}
          <PromptList items={promptItems} active={active} loading={prompts.loading} error={prompts.error} total={prompts.all.length} onPick={pickPrompt} onHover={setActive} onRetry={prompts.reload} />
          <div className="prompt-foot small">
            {slashMode ? <span className="muted">Enter to insert · Esc to close</span> : savingPrompt ? (
              <SaveAsPrompt text={text.trim()} projectDir={projectDir} onSaved={closePrompts} onCancel={() => setSavingPrompt(false)} />
            ) : (
              <>
                {text.trim() && <button className="link small" onClick={() => setSavingPrompt(true)}>Save this message as a prompt…</button>}
                <a className="link small" href="#/prompts" onClick={closePrompts}>Manage prompts</a>
              </>
            )}
          </div>
        </div>
      )}
      <div className={`composer${tooLong ? " too-long" : ""}${busy ? " is-busy" : ""}`} data-testid={TID.composerBox}>
        <input ref={picker} type="file" multiple hidden accept={ACCEPT} aria-hidden="true" tabIndex={-1} onChange={(e) => { addFiles([...(e.target.files ?? [])]); e.target.value = ""; }} />
        {git && (
          <div className="composer-strip" aria-label="Repository">
            <IconGitBranch className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="composer-strip-branch">{git.branch || "detached"}</span>
            <span className="composer-strip-spacer" />
            {git.behind > 0 && <span className="composer-strip-behind" title={`${git.behind} commit${git.behind === 1 ? "" : "s"} behind upstream`}>↓{git.behind}</span>}
            {git.changed > 0 && <span className="composer-strip-changed">{git.changed} changed</span>}
          </div>
        )}
        {files.length > 0 && (
          <ul className="att-draft" aria-label="Files to send">
            {files.map((f, i) => (
              <li key={`${f.name}-${f.size}-${i}`}>
                {isImage(f) ? <Thumb file={f} /> : <span className="att-icon"><IconPaperclip className="size-3.5" aria-hidden="true" /></span>}
                <span className="att-meta">
                  <span className="att-name">{f.name}</span>
                  <span className="att-size">{sizeLabel(f.size)}</span>
                </span>
                <button type="button" className="att-x" aria-label={`Remove ${f.name}`} onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))}><IconX className="size-3" aria-hidden="true" /></button>
              </li>
            ))}
          </ul>
        )}
        <div className="composer-row">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="composer-ghost" aria-label="Add files or saved prompts" title="Add files or saved prompts">
                <IconPlus className="size-4" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" sideOffset={8} className="w-56">
              <DropdownMenuItem disabled={offline} onSelect={picking} data-testid={TID.attachFiles}>Attach files or images</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem aria-label="Insert a saved prompt" onSelect={() => { setPromptsOpen((o) => !o); setSavingPrompt(false); setPromptFilter(""); }}>Saved prompts</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <textarea
            ref={ta}
            data-testid={TID.composerInput}
            value={text}
            rows={1}
            aria-label="Message"
            aria-controls={slashMode ? "prompt-listbox" : undefined}
            aria-activedescendant={slashMode && promptItems[active] ? `prompt-opt-${promptItems[active].id}` : undefined}
            placeholder={offline ? "Reconnecting to Pheme…" : busy ? "Pheme is replying. Type to queue a follow-up…" : placeholder}
            onChange={(e) => { histIdx.current = -1; update(e.target.value); }}
            onKeyDown={onKeyDown}
            onPaste={(e) => {
              const pasted = [...(e.clipboardData?.files ?? [])];
              if (pasted.length) { e.preventDefault(); addFiles(pasted, true); }
            }}
            spellCheck
          />
          <div className="composer-right">
            {extra && <div className="composer-extra">{extra}</div>}
            {busy && !text.trim() ? (
              <button type="button" className="composer-send is-stop" data-testid={TID.stopButton} onClick={onStop} aria-label="Stop the reply" title="Stop (Esc)">
                <span className="composer-stop-square" aria-hidden="true" />
              </button>
            ) : (
              <button type="button" className="composer-send" data-testid={TID.sendButton} onClick={submit} disabled={!canSend} aria-label={busy ? "Queue message" : "Send message"} title={sendTitle}>
                <IconArrowUp className="size-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </div>
      {fileNote && <div className="composer-note over" role="alert">{fileNote}</div>}
      {waitingForReply && <div className="composer-note muted" role="status">Attachments are sent once the current reply finishes.</div>}
      {(tooLong || text.length > 20_000) && (
        <div className={`composer-note ${tooLong ? "over" : "muted"}`}>{tooLong ? `Too long to send: ${text.length.toLocaleString()} of ${MAX_CHARS.toLocaleString()} characters. Shorten it and try again.` : `${text.length.toLocaleString()} characters`}</div>
      )}
    </div>
  );
});

/** A small preview of a picked image. The temporary address is released when the preview goes away. */
function Thumb({ file }: { file: File }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return url ? <img className="att-mini" src={url} alt="" /> : <IconPhoto className="size-4" aria-hidden="true" />;
}
