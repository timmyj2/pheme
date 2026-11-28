import { IconPaperclip } from "./lib/icons.ts";
import { useEffect, useState } from "react";
import { api, type AttachmentRef } from "./api.ts";
import { sizeLabel } from "./attach.ts";

/** Files attached to a sent message: image thumbnails and file chips. Contents load through the authorised API, never by a bare link. */
export function Attachments({ chatId, items }: { chatId: string | null; items: AttachmentRef[] }) {
  if (!chatId || items.length === 0) return null;
  return (
    <ul className="att-list" aria-label="Attachments">
      {items.map((a) => <li key={a.id}><AttachmentItem chatId={chatId} a={a} /></li>)}
    </ul>
  );
}

function AttachmentItem({ chatId, a }: { chatId: string; a: AttachmentRef }) {
  const [url, setUrl] = useState("");
  const [gone, setGone] = useState(false);
  useEffect(() => {
    if (a.kind !== "image") return;
    let dead = false;
    let made = "";
    api.attachmentBlob(chatId, a.id).then((b) => { if (dead) return; made = URL.createObjectURL(b); setUrl(made); }).catch(() => { if (!dead) setGone(true); });
    return () => { dead = true; if (made) URL.revokeObjectURL(made); };
  }, [chatId, a.id, a.kind]);

  const open = async () => {
    try {
      const b = await api.attachmentBlob(chatId, a.id);
      const u = URL.createObjectURL(b);
      window.open(u, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(u), 60_000);
    } catch { setGone(true); }
  };

  if (gone) return <span className="att-chip gone" title="This file is no longer available"><IconPaperclip className="inline size-3.5 align-[-2px]" aria-hidden="true" /> {a.name} (no longer available)</span>;
  if (a.kind === "image") {
    return (
      <button className="att-thumb" onClick={() => void open()} aria-label={`Open image ${a.name}`} title={`${a.name} · ${sizeLabel(a.size)}`}>
        {url ? <img src={url} alt={a.name} /> : <span className="att-loading">{a.name}</span>}
      </button>
    );
  }
  return <button className="att-chip" onClick={() => void open()} title="Open"><IconPaperclip className="inline size-3.5 align-[-2px]" aria-hidden="true" /> {a.name} <span className="muted small">{sizeLabel(a.size)}</span></button>;
}
