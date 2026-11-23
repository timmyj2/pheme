import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { ACCEPT, checkFiles, DEFAULT_TEXT, isImage, nameForPasted, sizeLabel } from "./attach.ts";
import { loadDraft, loadHistory, pushHistory, saveDraft } from "./drafts.ts";

/** The server rejects bodies over 1,000,000 bytes; stay safely under that. */
export const MAX_CHARS = 250_000;

const NEW_PLACEHOLDERS = ["What can I help with?", "Give Pheme a task", "What's on your mind?", "Describe what you need", "Ask anything", "Start with a goal"];
const FOLLOWUP_PLACEHOLDERS = ["Send a follow-up", "Add more context", "Refine the request", "What's next?", "Keep it going"];

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
  onSend: (text: string, files: File[]) => void;
  onStop: () => void;
  onRemoveQueued: (i: number) => void;
}

export const Composer = forwardRef<ComposerHandle, Props>(function Composer({ chatId, busy, offline, queue, hasMessages, onSend, onStop, onRemoveQueued }, ref) {
  const [text, setText] = useState(() => loadDraft(chatId));
  const latest = useRef(text); // the current text, readable from cleanup code after the textarea is gone
  latest.current = text;
  const ta = useRef<HTMLTextAreaElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [fileNote, setFileNote] = useState("");
  const [dragging, setDragging] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const filesRef = useRef(files);
  filesRef.current = files;
  const histIdx = useRef(-1); // -1 = not browsing history
  const stash = useRef("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const placeholder = useMemo(() => {
    const list = hasMessages ? FOLLOWUP_PLACEHOLDERS : NEW_PLACEHOLDERS;
    return list[Math.floor(Math.random() * list.length)];
  }, [chatId, hasMessages]);

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

  return (
    <div
      className={`composer-wrap${dragging ? " dragging" : ""}`}
      onDragOver={(e) => { if (e.dataTransfer?.types.includes("Files")) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false); }}
      onDrop={(e) => { if (e.dataTransfer?.files.length) { e.preventDefault(); setDragging(false); addFiles([...e.dataTransfer.files]); } }}
    >
      {queue.length > 0 && (
        <ul className="queue" aria-label="Queued messages">
          {queue.map((q, i) => (
            <li key={i}>
              <span className="queue-n">Queued</span>
              <span className="queue-text">{q}</span>
              <button className="icon-btn" aria-label={`Remove queued message ${i + 1}`} onClick={() => onRemoveQueued(i)}>×</button>
            </li>
          ))}
        </ul>
      )}
      {files.length > 0 && (
        <ul className="att-draft" aria-label="Files to send">
          {files.map((f, i) => (
            <li key={`${f.name}-${f.size}-${i}`}>
              {isImage(f) ? <Thumb file={f} /> : <span aria-hidden="true">📎</span>}
              <span className="att-name">{f.name}</span>
              <span className="muted small">{sizeLabel(f.size)}</span>
              <button className="icon-btn" aria-label={`Remove ${f.name}`} onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))}>×</button>
            </li>
          ))}
        </ul>
      )}
      <div className={`composer${tooLong ? " too-long" : ""}`}>
        <input ref={picker} type="file" multiple hidden accept={ACCEPT} aria-hidden="true" tabIndex={-1} onChange={(e) => { addFiles([...(e.target.files ?? [])]); e.target.value = ""; }} />
        <button className="icon-btn attach-btn" aria-label="Attach files" title="Attach images or text files (or drop or paste them)" disabled={offline} onClick={() => picker.current?.click()}>📎</button>
        <textarea
          ref={ta}
          value={text}
          rows={1}
          aria-label="Message"
          placeholder={offline ? "Reconnecting to Pheme…" : busy ? "Pheme is replying. Type to queue a follow-up…" : placeholder}
          onChange={(e) => { histIdx.current = -1; update(e.target.value); }}
          onKeyDown={onKeyDown}
          onPaste={(e) => {
            const pasted = [...(e.clipboardData?.files ?? [])];
            if (pasted.length) { e.preventDefault(); addFiles(pasted, true); } // text pastes are left alone
          }}
          spellCheck
        />
        {busy && !text.trim() ? (
          <button className="btn danger" onClick={onStop} aria-label="Stop the reply">Stop</button>
        ) : (
          <button className="btn primary" onClick={submit} disabled={!canSend} aria-label={busy ? "Queue message" : "Send message"}>{busy ? "Queue" : "Send"}</button>
        )}
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
  return url ? <img className="att-mini" src={url} alt="" /> : <span aria-hidden="true">🖼</span>;
}
