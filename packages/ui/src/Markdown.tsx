import { Component, memo, type ComponentPropsWithoutRef, useEffect, useRef, useState, type ReactNode } from "react";
import ReactMarkdown, { type Components, type ExtraProps } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import plaintext from "highlight.js/lib/languages/plaintext";
import powershell from "highlight.js/lib/languages/powershell";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import shell from "highlight.js/lib/languages/shell";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import "./markdown.css";

const languages = { javascript, typescript, json, bash, shell, python, xml, css, yaml, markdown, diff, sql, powershell, csharp, java, go, rust, c, cpp, plaintext };

type MdNode = { type: string; value?: string; children?: MdNode[] };

/** Remark plugin: a single newline inside text becomes a hard line break (chat answers rely on it). Code nodes are untouched. */
function remarkSoftBreaks() {
  const walk = (node: MdNode) => {
    if (!node.children) return;
    const out: MdNode[] = [];
    for (const child of node.children) {
      if (child.type === "text" && child.value && child.value.includes("\n")) {
        child.value.split("\n").forEach((part, i) => {
          if (i) out.push({ type: "break" });
          if (part) out.push({ type: "text", value: part });
        });
      } else {
        walk(child);
        out.push(child);
      }
    }
    node.children = out;
  };
  return (tree: MdNode) => walk(tree);
}

/** Only http(s) and mailto links survive; everything else (javascript:, data:, relative...) is dropped. */
function safeUrl(url: string | undefined): string {
  if (!url) return "";
  const u = url.trim();
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(u)) return "";
  return /^(https?:|mailto:)/i.test(u) ? u : "";
}

function textOf(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (typeof node === "object" && "props" in node) return textOf((node.props as { children?: ReactNode }).children);
  return "";
}

function CodeBlock({ language, code, children }: { language: string; code: string; children: ReactNode }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async () => {
    let next: "copied" | "failed" = "copied";
    try {
      if (!navigator.clipboard?.writeText) throw new Error("no clipboard");
      await navigator.clipboard.writeText(code);
    } catch {
      next = "failed";
    }
    setState(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 1500);
  };
  return (
    <div className="code-block">
      <div className="code-head">
        <span className="code-lang">{language}</span>
        <button type="button" className="code-copy" aria-label="Copy code" onClick={() => void copy()}>
          {state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : "Copy"}
        </button>
      </div>
      <pre>{children}</pre>
    </div>
  );
}

const components: Components = {
  pre({ children }) {
    const el = Array.isArray(children) ? children[0] : children;
    const props = (el && typeof el === "object" && "props" in el ? el.props : {}) as { className?: string; children?: ReactNode };
    const language = /language-([^\s]+)/.exec(props.className ?? "")?.[1] ?? "text";
    return (
      <CodeBlock language={language} code={textOf(props.children).replace(/\n$/, "")}>
        {el}
      </CodeBlock>
    );
  },
  a({ href, children }: ComponentPropsWithoutRef<"a"> & ExtraProps) {
    const url = safeUrl(href);
    if (!url) return <>{children}</>;
    return (
      <a href={url} target="_blank" rel="noopener noreferrer nofollow">
        {children}
      </a>
    );
  },
  img({ src, alt }: ComponentPropsWithoutRef<"img"> & ExtraProps) {
    const url = safeUrl(typeof src === "string" ? src : undefined);
    if (!url) return <>{alt}</>;
    return (
      <a href={url} target="_blank" rel="noopener noreferrer nofollow">
        {alt || url}
      </a>
    );
  },
  table({ children }) {
    return (
      <div className="table-wrap">
        <table>{children}</table>
      </div>
    );
  },
  input({ type, checked }) {
    return type === "checkbox" ? <input type="checkbox" checked={!!checked} disabled readOnly /> : null;
  },
};

export class MarkdownBoundary extends Component<{ text: string; children: ReactNode }, { failed: boolean; text: string }> {
  state = { failed: false, text: this.props.text };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  static getDerivedStateFromProps(props: { text: string }, state: { failed: boolean; text: string }) {
    // New text (streaming) gets a fresh attempt at the full pipeline.
    return props.text !== state.text ? { failed: false, text: props.text } : null;
  }
  render() {
    return this.state.failed ? <pre className="md-fallback">{this.props.text}</pre> : this.props.children;
  }
}

const remarkPlugins = [remarkGfm, remarkSoftBreaks];
const rehypePlugins = [[rehypeHighlight, { languages, detect: false, ignoreMissing: true }]] as never;

export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="md">
      <MarkdownBoundary text={text}>
        <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={components} urlTransform={safeUrl}>
          {text}
        </ReactMarkdown>
      </MarkdownBoundary>
    </div>
  );
});
