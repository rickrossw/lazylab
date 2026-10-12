import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CHAPTERS, getChapter } from "@/content/chapters";
import { ATLAS, atlasTitle, getEntry } from "@/content/atlas";
import { TRACK_BOSSES, TRACK_LEVELS } from "@/content/levels";
import { SOURCES, type Source } from "@/content/sources";
import { getMission } from "@/missions";
import { Markdown } from "@/components/Markdown";
import { Widget } from "@/components/widgets/Widgets";
import { Checkpoint } from "@/components/Checkpoint";
import { PlaybookToc } from "@/components/PlaybookToc";
import { BossCard } from "@/components/BossCard";

export function generateStaticParams() {
  return CHAPTERS.map((c) => ({ track: c.track }));
}

export async function generateMetadata({ params }: { params: Promise<{ track: string }> }): Promise<Metadata> {
  const c = getChapter((await params).track);
  return c ? { title: `${c.n}. ${c.title}`, description: c.kicker } : {};
}

const TITLES = Object.fromEntries(ATLAS.map((e) => [e.slug, e.title]));

export default async function ChapterPage({ params }: { params: Promise<{ track: string }> }) {
  const c = getChapter((await params).track);
  if (!c) notFound();
  const next = CHAPTERS[c.n];
  return (
    <div className="pb-layout">
      <aside className="pb-toc">
        <PlaybookToc current={c.track} titles={TITLES} />
      </aside>
      <article className="pb-article">
        <details className="pb-mobile-toc">
          <summary>Contents</summary>
          <div className="pb-toc">
            <PlaybookToc current={c.track} titles={TITLES} />
          </div>
        </details>
        <header className="pb-head">
          <div className="num">Chapter {c.n}</div>
          <h1>{c.title}</h1>
          <p className="kicker">{c.kicker}</p>
          <p className="pb-intro">{c.intro}</p>
        </header>

        {TRACK_LEVELS[c.track].map((slug, i) => {
          const e = getEntry(slug)!;
          return (
            <section key={slug} id={slug} className="pb-section">
              <div className="main prose" style={{ maxWidth: "none" }}>
                <h2>
                  <span className="n">{c.n}.{i + 1}</span>
                  {e.title}
                </h2>
                <Markdown source={e.body} resolve={atlasTitle} />
                {e.widget && <Widget id={e.widget} />}
                <Checkpoint slug={slug} />
              </div>
              <aside className="pb-aside">
                <span className="lbl">In short</span>
                <p>{e.summary}</p>
                <div className="refs">
                  <span className="lbl">Sources</span>
                  {e.sources.slice(0, 3).map((id) => {
                    const src: Source = SOURCES[id];
                    return (
                      <p key={id} style={{ marginBottom: 6 }}>
                        <a href={src.url} target="_blank" rel="noreferrer">{src.title}</a>
                      </p>
                    );
                  })}
                </div>
              </aside>
            </section>
          );
        })}

        <div id="boss" style={{ scrollMarginTop: 80 }}>
          {TRACK_BOSSES[c.track].map((id) => {
            const m = getMission(id)!;
            return <BossCard key={id} id={id} track={c.track} title={m.title} tagline={m.tagline} />;
          })}
        </div>

        <div className="row" style={{ margin: "26px 0 10px" }}>
          {c.n > 1 && (
            <Link href={`/play/${CHAPTERS[c.n - 2].track}/`} className="btn">
              ← {CHAPTERS[c.n - 2].title}
            </Link>
          )}
          <span className="spacer" />
          {next ? (
            <Link href={`/play/${next.track}/`} className="btn primary">
              Chapter {next.n}: {next.title} →
            </Link>
          ) : (
            <Link href="/" className="btn primary">Back to contents</Link>
          )}
        </div>
      </article>
    </div>
  );
}
