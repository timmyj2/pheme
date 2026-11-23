import { useEffect, useRef, useState, type RefObject } from "react";
import { api } from "./api.ts";
import { ChangesPanel } from "./ChangesPanel.tsx";
import { ModelPicker } from "./ModelPicker.tsx";
import { ProjectBar } from "./ProjectBar.tsx";
import { useGit } from "./useGit.ts";
import { Composer, type ComposerHandle } from "./Composer.tsx";
import { Transcript, copyText } from "./Transcript.tsx";
import { useToast } from "./toast.tsx";
import { useChat } from "./useChat.ts";

interface Props {
  /** null = a new chat that is created when the first message is sent. */
  chatId: string | null;
  /** The folder this chat works in, if one was chosen. */
  projectDir?: string;
  /** This chat's own model (undefined = follows the default) and the default from Settings. */
  model?: string;
  defaultModel: string;
  offline: boolean;
  composerRef: RefObject<ComposerHandle | null>;
  /** Text to send as soon as the chat has loaded (the message that created it). */
  autoSend?: string;
  onAutoSent: () => void;
  onCreate: (text: string) => void;
  onChanged: () => void;
  onOpenChat: (id: string) => void;
  onBusy: (busy: boolean) => void;
}

export function ChatView({ chatId, projectDir: dirProp, model: modelProp, defaultModel, offline, composerRef, autoSend, onAutoSent, onCreate, onChanged, onOpenChat, onBusy }: Props) {
  const toast = useToast();
  const chat = useChat(chatId, { onChange: onChanged, onError: (m) => toast.error(m) });
  const sentAuto = useRef(false);
  // The folder shown right away after a change; the chat list catches up on its next refresh.
  const [dirOverride, setDirOverride] = useState<{ dir: string | undefined } | null>(null);
  useEffect(() => { setDirOverride(null); }, [dirProp, chatId]);
  const projectDir = dirOverride ? dirOverride.dir : dirProp;
  const [modelOverride, setModelOverride] = useState<{ model: string | undefined } | null>(null);
  useEffect(() => { setModelOverride(null); }, [modelProp, chatId]);
  const model = modelOverride ? modelOverride.model : modelProp;
  const setModel = async (m: string | null) => {
    if (!chatId) return;
    const meta = await api.patchChat(chatId, { model: m });
    setModelOverride({ model: meta.model });
    onChanged();
  };
  const [panelOpen, setPanelOpen] = useState(() => localStorage.getItem("pheme-changes-open") === "1");
  const togglePanel = () => setPanelOpen((o) => { localStorage.setItem("pheme-changes-open", o ? "0" : "1"); return !o; });
  const git = useGit(chatId, projectDir, panelOpen, chat.busy);
  const setDir = async (dir: string | null) => {
    if (!chatId) return;
    const meta = await api.patchChat(chatId, { projectDir: dir });
    setDirOverride({ dir: meta.projectDir });
    onChanged();
  };

  useEffect(() => { onBusy(chat.busy); }, [chat.busy, onBusy]);

  // The first message of a new chat: the chat is created, the route changes, and the message is sent once it has loaded.
  useEffect(() => {
    if (chatId && autoSend && chat.loaded && !sentAuto.current) {
      sentAuto.current = true;
      chat.send(autoSend);
      onAutoSent();
    }
  }, [chatId, autoSend, chat.loaded]);

  const send = (text: string) => (chatId ? chat.send(text) : onCreate(text));

  const stop = async () => {
    const held = await chat.stop();
    if (held.length) composerRef.current?.insert(held.join("\n"));
  };

  const copy = async (text: string) => {
    if (await copyText(text)) toast.info("Copied");
    else toast.error("Could not copy to the clipboard");
  };

  if (chat.loadError) {
    return (
      <section className="chat">
        <div className="fatal"><h2>{chat.loadError}</h2><button className="btn" onClick={() => onOpenChat("")}>Start a new chat</button></div>
      </section>
    );
  }

  return (
    <section className="chat">
      {chatId && (
        <div className="chat-toolbar">
          <ProjectBar dir={projectDir} status={git.status} busy={chat.busy} panelOpen={panelOpen} onTogglePanel={togglePanel} onSetDir={setDir} />
          <ModelPicker value={model} defaultModel={defaultModel} disabled={chat.busy || offline} onChange={setModel} />
        </div>
      )}
      <div className="chat-split">
      <div className="chat-col">
      {chat.live === "reconnecting" && !offline && <div className="banner warn" role="status">Connection lost. Reconnecting…</div>}
      <Transcript
        events={chat.events}
        streaming={chat.streaming}
        busy={chat.busy}
        loaded={chat.loaded}
        pending={chat.pending}
        onAnswer={chat.answer}
        onCopy={(t) => void copy(t)}
        onRetry={(t) => chat.send(t)}
        onDismissPending={chat.dropPending}
        onResendPending={(p) => { chat.dropPending(p.id); chat.send(p.text); }}
        onSuggest={(t) => composerRef.current?.set(t)}
        onOpenChat={onOpenChat}
      />
      <Composer
        ref={composerRef}
        chatId={chatId}
        busy={chat.busy}
        offline={offline}
        queue={chat.queue}
        hasMessages={chat.events.length > 0}
        onSend={send}
        onStop={() => void stop()}
        onRemoveQueued={chat.removeQueued}
      />
      </div>
      {chatId && projectDir && panelOpen && <ChangesPanel chatId={chatId} status={git.status} error={git.error} loading={git.loading} onRefresh={() => void git.refresh()} onClose={togglePanel} busy={chat.busy} />}
      </div>
    </section>
  );
}
