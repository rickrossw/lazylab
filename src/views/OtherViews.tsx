"use client";

import Link from "next/link";
import { notFound } from "next/navigation";
import { ATLAS, CATEGORIES, byCategory, getEntry, type AtlasCategory } from "@/content/atlas";
import { CHAPTERS } from "@/content/chapters";
import { categoryText, chapterText, entryText, missionText, trackText, type Dict } from "@/content/localized";
import { SOURCES, type Source } from "@/content/sources";
import { MISSIONS, TRACKS, getMission, type TrackId } from "@/missions";
import { trackOf } from "@/lib/game";
import { Markdown } from "@/components/Markdown";
import { Widget } from "@/components/widgets/Widgets";
import { AtlasSearch, MarkRead, SideReadMarks } from "@/components/AtlasClient";
import { MissionCards } from "@/components/MissionCards";
import { MissionRunner } from "@/components/MissionRunner";
import { LabClient } from "@/components/LabClient";
import { useLang } from "@/i18n/client";

const cat = (c: AtlasCategory, d: Dict) => categoryText(c, d);

export function LabView() {
  const { t } = useLang();
  return (
    <div className="container" style={{ padding: "24px 20px" }}>
      <div style={{ marginBottom: 14 }}>
        <div className="eyebrow">{t("lab.eyebrow")}</div>
        <h1 style={{ fontSize: "2rem", marginBottom: 4 }}>{t("lab.title")}</h1>
        <p className="muted" style={{ margin: 0 }}>{t("lab.lede")}</p>
      </div>
      <LabClient />
    </div>
  );
}

export function MissionsView() {
  const { t, d } = useLang();
  return (
    <div className="container" style={{ padding: "36px 20px" }}>
      <div className="eyebrow">{t("missions.eyebrow")}</div>
      <h1 style={{ fontSize: "2.4rem" }}>{t("missions.title")}</h1>
      <p className="muted" style={{ fontSize: 18, maxWidth: "42em" }}>{t("missions.lede")}</p>
      <div className="row" style={{ margin: "14px 0 24px" }}>
        {(Object.keys(TRACKS) as TrackId[]).map((id) => {
          const tr = trackText(id, d);
          return (
            <span key={id} className="chip" title={tr.blurb}>
              <span className="dot" style={{ background: tr.color }} />
              {tr.name}
            </span>
          );
        })}
      </div>
      <MissionCards missions={MISSIONS.map(({ id, title, track, difficulty, tagline, kind }) => ({ id, title, track, difficulty, tagline, kind }))} />
    </div>
  );
}

export function MissionView({ id }: { id: string }) {
  if (!getMission(id)) notFound();
  return (
    <div className="container" style={{ padding: "24px 20px" }}>
      <MissionRunner id={id} />
    </div>
  );
}

export function GlossaryView() {
  const { t, d } = useLang();
  return (
    <div className="container" style={{ padding: "36px 20px" }}>
      <div className="eyebrow">{t("glossary.eyebrow")}</div>
      <h1 style={{ fontSize: "2.4rem" }}>{t("glossary.title")}</h1>
      <p className="muted" style={{ fontSize: 18, maxWidth: "40em" }}>{t("glossary.lede")}</p>
      <div style={{ marginTop: 22 }}>
        <AtlasSearch
          items={ATLAS.map((e) => {
            const tx = entryText(e.slug, d)!;
            return { slug: e.slug, title: tx.title, summary: tx.summary, category: cat(e.category, d) };
          })}
          categories={CATEGORIES.map((c) => cat(c, d))}
        />
      </div>
    </div>
  );
}

export function GlossaryEntryView({ slug }: { slug: string }) {
  const { t, d, L } = useLang();
  const e = getEntry(slug);
  if (!e) notFound();
  const tx = entryText(slug, d)!;
  const missions = MISSIONS.filter((m) => m.atlas.includes(e.slug));
  const tr = trackText(e.track, d);
  const base = CHAPTERS.find((c) => c.track === trackOf(e.slug));
  const chapter = base ? chapterText(base, d) : undefined;
  return (
    <div className="container atlas-layout">
      <aside className="atlas-side" aria-label={t("glossary.title")}>
        <Link href={L("/atlas/")} style={{ fontWeight: 600, color: "var(--text)" }}>{t("glossary.all")}</Link>
        {byCategory().map((g) => (
          <div key={g.category}>
            <h4>{cat(g.category, d)}</h4>
            {g.entries.map((x) => (
              <Link key={x.slug} href={L(`/atlas/${x.slug}/`)} data-slug={x.slug} className={x.slug === e.slug ? "active" : ""}>
                {entryText(x.slug, d)!.title}
              </Link>
            ))}
          </div>
        ))}
        <SideReadMarks slugs={ATLAS.map((x) => x.slug)} />
      </aside>
      <article className="prose">
        <MarkRead slug={e.slug} />
        <div className="row" style={{ marginBottom: 8 }}>
          <span className="eyebrow">{cat(e.category, d)}</span>
          <span className="chip">
            <span className="dot" style={{ background: tr.color }} />
            {t("glossary.track", { name: tr.name })}
          </span>
        </div>
        <h1 style={{ fontSize: "2.3rem" }}>{tx.title}</h1>
        {chapter && (
          <p>
            <Link href={L(`/play/${chapter.track}/#${e.slug}`)} className="btn small primary">
              {t("glossary.inChapter", { n: chapter.n })}
            </Link>
          </p>
        )}
        <p style={{ fontSize: 19, color: "var(--text-2)" }}>{tx.summary}</p>
        <Markdown source={tx.body} />
        {e.widget && <Widget id={e.widget} />}

        {missions.length > 0 && (
          <>
            <h2>{t("glossary.useIt")}</h2>
            <div className="grid grid-2">
              {missions.map((m) => {
                const copy = missionText(m, d);
                const mt = trackText(m.track, d);
                return (
                  <Link key={m.id} href={L(`/missions/${m.id}/`)} className="card card-link">
                    <div className="eyebrow" style={{ color: mt.color }}>{mt.name}</div>
                    <div style={{ fontWeight: 600 }}>{copy.title}</div>
                    <div className="muted" style={{ fontSize: 14 }}>{copy.tagline}</div>
                  </Link>
                );
              })}
            </div>
          </>
        )}

        <h2>{t("glossary.related")}</h2>
        <div className="row">
          {e.related.map((r) => (
            <Link key={r} href={L(`/atlas/${r}/`)} className="chip" style={{ textDecoration: "none", fontSize: 14 }}>
              {entryText(r, d)?.title}
            </Link>
          ))}
        </div>

        <h2>{t("glossary.sources")}</h2>
        <ul className="sources">
          {e.sources.map((id) => {
            const src: Source = SOURCES[id];
            return (
              <li key={id}>
                <a href={src.url} target="_blank" rel="noreferrer">{src.title}</a>
                {src.note ? <span className="muted"> — {src.note}</span> : null}
              </li>
            );
          })}
        </ul>
        <p className="muted" style={{ fontSize: 13 }}>{t("glossary.own")}</p>
      </article>
    </div>
  );
}
