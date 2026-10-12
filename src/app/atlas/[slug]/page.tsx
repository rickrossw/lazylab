import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ATLAS, atlasTitle, byCategory, getEntry } from "@/content/atlas";
import { SOURCES, type Source } from "@/content/sources";
import { MISSIONS, TRACKS } from "@/missions";
import { Markdown } from "@/components/Markdown";
import { Widget } from "@/components/widgets/Widgets";
import { MarkRead, SideReadMarks } from "@/components/AtlasClient";
import { CHAPTERS } from "@/content/chapters";
import { trackOf } from "@/lib/game";

export function generateStaticParams() {
  return ATLAS.map((e) => ({ slug: e.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const e = getEntry((await params).slug);
  return e ? { title: `${e.title} — Atlas`, description: e.summary } : {};
}

export default async function AtlasEntryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const e = getEntry(slug);
  if (!e) notFound();
  const groups = byCategory();
  const missions = MISSIONS.filter((m) => m.atlas.includes(e.slug));
  const track = TRACKS[e.track];
  const chapter = CHAPTERS.find((c) => c.track === trackOf(e.slug));
  return (
    <div className="container atlas-layout">
      <aside className="atlas-side" aria-label="Atlas contents">
        <Link href="/atlas/" style={{ fontWeight: 600, color: "var(--text)" }}>← All concepts</Link>
        {groups.map((g) => (
          <div key={g.category}>
            <h4>{g.category}</h4>
            {g.entries.map((x) => (
              <Link key={x.slug} href={`/atlas/${x.slug}/`} data-slug={x.slug} className={x.slug === e.slug ? "active" : ""}>
                {x.title}
              </Link>
            ))}
          </div>
        ))}
        <SideReadMarks slugs={ATLAS.map((x) => x.slug)} />
      </aside>
      <article className="prose">
        <MarkRead slug={e.slug} />
        <div className="row" style={{ marginBottom: 8 }}>
          <span className="eyebrow">{e.category}</span>
          <span className="chip">
            <span className="dot" style={{ background: track.color }} />
            {track.name} track
          </span>
        </div>
        <h1 style={{ fontSize: "2.3rem" }}>{e.title}</h1>
        {chapter && (
          <p>
            <Link href={`/play/${chapter.track}/#${e.slug}`} className="btn small primary">
              Read in the Playbook: Chapter {chapter.n} · checkpoint +50 XP →
            </Link>
          </p>
        )}
        <p style={{ fontSize: 19, color: "var(--text-2)" }}>{e.summary}</p>
        <Markdown source={e.body} resolve={atlasTitle} />
        {e.widget && <Widget id={e.widget} />}

        {missions.length > 0 && (
          <>
            <h2>Use it in a mission</h2>
            <div className="grid grid-2">
              {missions.map((m) => (
                <Link key={m.id} href={`/missions/${m.id}/`} className="card card-link">
                  <div className="eyebrow" style={{ color: TRACKS[m.track].color }}>{TRACKS[m.track].name}</div>
                  <div style={{ fontWeight: 600 }}>{m.title}</div>
                  <div className="muted" style={{ fontSize: 14 }}>{m.tagline}</div>
                </Link>
              ))}
            </div>
          </>
        )}

        <h2>Related</h2>
        <div className="row">
          {e.related.map((r) => (
            <Link key={r} href={`/atlas/${r}/`} className="chip" style={{ textDecoration: "none", fontSize: 14 }}>
              {atlasTitle(r)}
            </Link>
          ))}
        </div>

        <h2>Sources & further reading</h2>
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
        <p className="muted" style={{ fontSize: 13 }}>Written for LazyLab in our own words; sources are cited for depth and verification.</p>
      </article>
    </div>
  );
}
