import Link from "next/link";
import { notFound } from "next/navigation";
import { ATLAS, getEntry } from "@/content/atlas";
import { CHAPTERS, getChapter } from "@/content/chapters";
import { TRACK_BOSSES, TRACK_LEVELS } from "@/content/levels";
import { chapterText, entryText, missionText } from "@/content/localized";
import { SOURCES, type Source } from "@/content/sources";
import { getMission } from "@/missions";
import { Markdown } from "@/components/Markdown";
import { Widget } from "@/components/widgets/Widgets";
import { Checkpoint } from "@/components/Checkpoint";
import { PlaybookToc } from "@/components/PlaybookToc";
import { BossCard } from "@/components/BossCard";
import { localize, type Lang } from "@/i18n";
import { t } from "@/i18n/ui";

export function ChapterView({ lang, track }: { lang: Lang; track: string }) {
  const base = getChapter(track);
  if (!base) notFound();
  const c = chapterText(base, lang);
  const titles = Object.fromEntries(ATLAS.map((e) => [e.slug, entryText(e.slug, lang)!.title]));
  const next = CHAPTERS[c.n] ? chapterText(CHAPTERS[c.n], lang) : undefined;
  const prev = c.n > 1 ? chapterText(CHAPTERS[c.n - 2], lang) : undefined;
  const L = (p: string) => localize(lang, p);
  return (
    <div className="pb-layout">
      <aside className="pb-toc">
        <PlaybookToc current={c.track} titles={titles} />
      </aside>
      <article className="pb-article">
        <details className="pb-mobile-toc">
          <summary>{t(lang, "chapter.contents")}</summary>
          <div className="pb-toc">
            <PlaybookToc current={c.track} titles={titles} />
          </div>
        </details>
        <header className="pb-head">
          <div className="num">{t(lang, "chapter.n", { n: c.n })}</div>
          <h1>{c.title}</h1>
          <p className="kicker">{c.kicker}</p>
          <p className="pb-intro">{c.intro}</p>
        </header>

        {TRACK_LEVELS[c.track].map((slug, i) => {
          const e = getEntry(slug)!;
          const tx = entryText(slug, lang)!;
          return (
            <section key={slug} id={slug} className="pb-section">
              <div className="main prose" style={{ maxWidth: "none" }}>
                <h2>
                  <span className="n">{c.n}.{i + 1}</span>
                  {tx.title}
                </h2>
                <Markdown source={tx.body} lang={lang} />
                {e.widget && <Widget id={e.widget} />}
                <Checkpoint slug={slug} />
              </div>
              <aside className="pb-aside">
                <span className="lbl">{t(lang, "chapter.inShort")}</span>
                <p>{tx.summary}</p>
                <div className="refs">
                  <span className="lbl">{t(lang, "chapter.sources")}</span>
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
            const m = missionText(getMission(id)!, lang);
            return <BossCard key={id} id={id} track={c.track} title={m.title} tagline={m.tagline} />;
          })}
        </div>

        <div className="row" style={{ margin: "26px 0 10px" }}>
          {prev && (
            <Link href={L(`/play/${prev.track}/`)} className="btn">
              ← {prev.title}
            </Link>
          )}
          <span className="spacer" />
          {next ? (
            <Link href={L(`/play/${next.track}/`)} className="btn primary">
              {t(lang, "chapter.n", { n: next.n })}: {next.title} →
            </Link>
          ) : (
            <Link href={L("/")} className="btn primary">{t(lang, "chapter.backToContents")}</Link>
          )}
        </div>
      </article>
    </div>
  );
}
