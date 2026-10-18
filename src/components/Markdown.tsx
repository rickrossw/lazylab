"use client";

// Tiny Markdown renderer for our own content: headings, paragraphs, lists, code, quotes, tables,
// inline code/bold/italic, links and [[atlas-slug]] / [[slug|label]] cross-references.

import Link from "next/link";
import type { ReactNode } from "react";
import { trackOf } from "@/lib/game";
import { useLang } from "@/i18n/client";
import { titleResolver } from "@/content/localized";

type Resolve = (slug: string) => string | undefined;
type Href = (path: string) => string;

function inline(text: string, resolve: Resolve, keyBase: string, href: Href = (p) => p): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(\[\[[^\]]+\]\])|(\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyBase}-${i++}`;
    if (m[1]) out.push(<code key={key}>{tok.slice(1, -1)}</code>);
    else if (m[2]) out.push(<strong key={key}>{inline(tok.slice(2, -2), resolve, key, href)}</strong>);
    else if (m[3]) out.push(<em key={key}>{inline(tok.slice(1, -1), resolve, key, href)}</em>);
    else if (m[4]) {
      const [slug, label] = tok.slice(2, -2).split("|");
      const title = resolve(slug.trim());
      out.push(
        title ? (
          <Link key={key} className="xref" href={href(trackOf(slug.trim()) ? `/play/${trackOf(slug.trim())}/#${slug.trim()}` : `/atlas/${slug.trim()}/`)}>
            {label ?? title}
          </Link>
        ) : (
          <span key={key}>{label ?? slug}</span>
        ),
      );
    } else if (m[5]) {
      const mm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok)!;
      const external = /^https?:/.test(mm[2]);
      out.push(
        external ? (
          <a key={key} href={mm[2]} target="_blank" rel="noreferrer">
            {mm[1]}
          </a>
        ) : (
          <Link key={key} href={href(mm[2])}>
            {mm[1]}
          </Link>
        ),
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Splits a table row on "|" except when escaped (\\|) or inside [[...]]. */
function splitRow(row: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let depth = 0;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === "\\" && row[i + 1] === "|") {
      cur += "|";
      i++;
    } else if (ch === "[" && row[i + 1] === "[") {
      depth++;
      cur += "[[";
      i++;
    } else if (ch === "]" && row[i + 1] === "]") {
      depth = Math.max(0, depth - 1);
      cur += "]]";
      i++;
    } else if (ch === "|" && depth === 0) {
      cells.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

export function Markdown({ source }: { source: string }) {
  const { d } = useLang();
  const resolve = titleResolver(d);
  const href: Href = (p) => p;
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const line = lines[i];
    const key = `b${k++}`;
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.startsWith("```")) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) body.push(lines[i++]);
      i++;
      blocks.push(<pre key={key}>{body.join("\n")}</pre>);
      continue;
    }
    const h = /^(#{2,4})\s+(.*)$/.exec(line);
    if (h) {
      const Tag = (`h${h[1].length}` as "h2" | "h3" | "h4");
      blocks.push(<Tag key={key}>{inline(h[2], resolve, key, href)}</Tag>);
      i++;
      continue;
    }
    if (line.startsWith(">")) {
      const body: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) body.push(lines[i++].replace(/^>\s?/, ""));
      blocks.push(<blockquote key={key}>{inline(body.join(" "), resolve, key, href)}</blockquote>);
      continue;
    }
    if (line.trim().startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const cells = splitRow(lines[i].trim().replace(/^\||\|$/g, ""));
        if (!cells.every((c) => /^:?-+:?$/.test(c))) rows.push(cells);
        i++;
      }
      const [head, ...body] = rows;
      blocks.push(
        <table key={key}>
          <thead>
            <tr>{head.map((c, j) => <th key={j}>{inline(c, resolve, `${key}h${j}`, href)}</th>)}</tr>
          </thead>
          <tbody>
            {body.map((r, ri) => (
              <tr key={ri}>{r.map((c, j) => <td key={j}>{inline(c, resolve, `${key}r${ri}c${j}`, href)}</td>)}</tr>
            ))}
          </tbody>
        </table>,
      );
      continue;
    }
    const ul = /^\s*[-*]\s+/;
    const ol = /^\s*\d+\.\s+/;
    if (ul.test(line) || ol.test(line)) {
      const ordered = ol.test(line);
      const re = ordered ? ol : ul;
      const items: string[] = [];
      while (i < lines.length && re.test(lines[i])) {
        let item = lines[i++].replace(re, "");
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !re.test(lines[i])) item += " " + lines[i++].trim();
        items.push(item);
      }
      const Tag = ordered ? "ol" : "ul";
      blocks.push(
        <Tag key={key}>
          {items.map((it, j) => (
            <li key={j}>{inline(it, resolve, `${key}-${j}`, href)}</li>
          ))}
        </Tag>,
      );
      continue;
    }
    const para: string[] = [];
    if (/^(#{2,4}\s|```|>|\s*[-*]\s|\s*\d+\.\s|\s*\|)/.test(line)) para.push(lines[i++]);
    while (i < lines.length && lines[i].trim() && !/^(#{2,4}\s|```|>|\s*[-*]\s|\s*\d+\.\s|\s*\|)/.test(lines[i])) para.push(lines[i++]);
    blocks.push(<p key={key}>{inline(para.join(" "), resolve, key, href)}</p>);
  }
  return <>{blocks}</>;
}
