import { Fragment, type ReactNode } from "react";

function safeLink(value: string): boolean {
  if (/\s|\\/.test(value) || value.startsWith("//")) return false;
  try { return ["http:", "https:"].includes(new URL(value, "https://lumenfde.com").protocol); } catch { return false; }
}

/** A small, deliberately restricted Markdown renderer. Raw HTML is always escaped by React. */
export function AnswerContent({ content, labels = [], messageIndex = 0 }: { content: string; labels?: string[]; messageIndex?: number }) {
  const inline = (text: string): ReactNode[] => text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*|\[S\d+\]|\[[^\]\n]+\]\([^\s)]+\))/g).map((part, n) => {
    if (part.startsWith("`") && part.endsWith("`")) return <code key={n}>{part.slice(1, -1)}</code>;
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={n}>{part.slice(2, -2)}</strong>;
    if (/^\[S\d+\]$/.test(part) && labels.includes(part.slice(1, -1))) {
      const id = `ask-source-${messageIndex}-${part.slice(1, -1)}`;
      return <a key={n} className="ask-citation" href={`#${id}`} onClick={() => {
        const target = document.getElementById(id), details = target?.closest("details");
        if (details) details.open = true;
        requestAnimationFrame(() => target?.focus());
      }}>{part}</a>;
    }
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link && safeLink(link[2])) return <a key={n} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a>;
    return <Fragment key={n}>{part}</Fragment>;
  });
  const lines = content.replace(/\r\n/g, "\n").split("\n"), blocks: ReactNode[] = [];
  const cells = (line: string) => line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
  for (let at = 0; at < lines.length;) {
    const line = lines[at];
    if (!line.trim()) { at++; continue; }
    const fence = line.match(/^\s*```([\w+-]*)/);
    if (fence) {
      const code: string[] = []; at++;
      while (at < lines.length && !/^\s*```/.test(lines[at])) code.push(lines[at++]);
      if (at < lines.length) at++;
      blocks.push(<pre key={`code-${at}`}><code>{code.join("\n")}</code></pre>); continue;
    }
    const heading = line.match(/^#{1,6}\s+(.+)$/);
    if (heading) { blocks.push(<h3 key={`heading-${at}`}>{inline(heading[1])}</h3>); at++; continue; }
    if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) { blocks.push(<hr key={`rule-${at}`} />); at++; continue; }
    if (line.includes("|") && /^\s*\|?\s*:?-{3,}/.test(lines[at + 1] || "")) {
      const header = cells(line), rows: string[][] = []; at += 2;
      while (at < lines.length && lines[at].includes("|") && lines[at].trim()) rows.push(cells(lines[at++]));
      blocks.push(<div className="answer-table" key={`table-${at}`}><table><thead><tr>{header.map((cell, n) => <th key={n}>{inline(cell)}</th>)}</tr></thead><tbody>{rows.map((row, n) => <tr key={n}>{header.map((_, c) => <td key={c}>{inline(row[c] || "")}</td>)}</tr>)}</tbody></table></div>); continue;
    }
    const list = line.match(/^\s*(?:([-+*])|\d+[.)])\s+(.+)$/);
    if (list) {
      const ordered = !list[1], items: ReactNode[] = [];
      while (at < lines.length) {
        const item = lines[at].match(/^\s*(?:([-+*])|\d+[.)])\s+(.+)$/);
        if (!item || (item[1] === undefined) !== ordered) break;
        items.push(<li key={at}>{inline(item[2])}</li>); at++;
      }
      blocks.push(ordered ? <ol key={`ordered-${at}`}>{items}</ol> : <ul key={`list-${at}`}>{items}</ul>); continue;
    }
    const paragraph = [line]; at++;
    while (at < lines.length && lines[at].trim() && !/^\s*(?:#{1,6}\s|```|[-+*]\s|\d+[.)]\s)/.test(lines[at])) paragraph.push(lines[at++]);
    blocks.push(<p key={`paragraph-${at}`}>{inline(paragraph.join("\n"))}</p>);
  }
  return <div className="answer-content">{blocks}</div>;
}
