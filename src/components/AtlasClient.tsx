"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { loadProgress, markRead } from "@/lib/progress";

export interface AtlasListItem {
  slug: string;
  title: string;
  summary: string;
  category: string;
}

export function AtlasSearch({ items, categories }: { items: AtlasListItem[]; categories: string[] }) {
  const [q, setQ] = useState("");
  const [read, setRead] = useState<string[]>([]);
  useEffect(() => setRead(loadProgress().atlasRead), []);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? items.filter((i) => (i.title + " " + i.summary + " " + i.category).toLowerCase().includes(s)) : items;
  }, [q, items]);
  return (
    <>
      <input className="atlas-search" placeholder={`Search ${items.length} concepts — try "nvlink", "xid", "zero"…`} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the Atlas" />
      <p className="muted" style={{ fontSize: 13.5, margin: "8px 4px 0" }}>
        {read.length} of {items.length} read on this device
      </p>
      {categories.map((cat) => {
        const list = filtered.filter((i) => i.category === cat);
        if (!list.length) return null;
        return (
          <section key={cat} style={{ marginTop: 28 }}>
            <h2 style={{ fontSize: "1.2rem" }}>{cat}</h2>
            <div className="term-list">
              {list.map((i) => (
                <Link key={i.slug} href={`/atlas/${i.slug}/`} className="card card-link">
                  <div className="t">
                    {i.title} {read.includes(i.slug) && <span style={{ color: "var(--good-text)", fontSize: 13 }}>✓</span>}
                  </div>
                  <div className="s">{i.summary}</div>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
      {!filtered.length && <p className="muted" style={{ marginTop: 24 }}>Nothing matches “{q}”.</p>}
    </>
  );
}

export function MarkRead({ slug }: { slug: string }) {
  useEffect(() => markRead(slug), [slug]);
  return null;
}

export function SideReadMarks({ slugs }: { slugs: string[] }) {
  useEffect(() => {
    const read = new Set(loadProgress().atlasRead);
    for (const s of slugs) {
      if (read.has(s)) document.querySelector(`[data-slug="${s}"]`)?.classList.add("read");
    }
  }, [slugs]);
  return null;
}
