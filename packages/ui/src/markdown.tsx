import type { ReactNode } from "react";

/** Tiny safe markdown: fenced code, paragraphs, lists, **bold**, `code`. No raw HTML is ever rendered. */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    out.push(t.startsWith("`") ? <code key={i++}>{t.slice(1, -1)}</code> : <strong key={i++}>{t.slice(2, -2)}</strong>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const parts = text.split(/```/);
  parts.forEach((part, pi) => {
    if (pi % 2 === 1) {
      const nl = part.indexOf("\n");
      blocks.push(<pre key={pi}><code>{(nl >= 0 ? part.slice(nl + 1) : part).replace(/\n$/, "")}</code></pre>);
      return;
    }
    part.split(/\n{2,}/).forEach((para, i) => {
      const lines = para.split("\n").filter((l) => l.trim());
      if (!lines.length) return;
      if (lines.every((l) => /^\s*([-*]|\d+\.)\s+/.test(l))) {
        const ordered = /^\s*\d+\./.test(lines[0]);
        const items = lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*([-*]|\d+\.)\s+/, ""))}</li>);
        blocks.push(ordered ? <ol key={`${pi}-${i}`}>{items}</ol> : <ul key={`${pi}-${i}`}>{items}</ul>);
      } else {
        blocks.push(<p key={`${pi}-${i}`}>{lines.flatMap((l, j) => (j ? [<br key={`b${j}`} />, ...inline(l)] : inline(l)))}</p>);
      }
    });
  });
  return <div className="md">{blocks}</div>;
}
