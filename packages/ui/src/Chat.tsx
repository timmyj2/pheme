import { useEffect, useRef, type RefObject } from "react";
import { Composer, type ComposerHandle } from "./Composer.tsx";
import { Transcript, copyText } from "./Transcript.tsx";
import { useToast } from "./toast.tsx";
import { useChat } from "./useChat.ts";

interface Props {
  /** null = a new chat that is created when the first message is sent. */
  chatId: string | null;
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

export function ChatView({ chatId, offline, composerRef, autoSend, onAutoSent, onCreate, onChanged, onOpenChat, onBusy }: Props) {
  const toast = useToast();
  const chat = useChat(chatId, { onChange: onChanged, onError: (m) => toast.error(m) });
  const sentAuto = useRef(false);

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
    </section>
  );
}
