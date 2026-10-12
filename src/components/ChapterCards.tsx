"use client";

import Link from "next/link";
import { TRACK_BOSSES, TRACK_LEVELS } from "@/content/levels";
import { chaptersL } from "@/content/localized";
import { useLang } from "@/i18n/client";
import { useProgress } from "./useProgress";

export function ChapterCards() {
  const { lang, t, L } = useLang();
  const p = useProgress();
  return (
    <div className="chapter-grid">
      {chaptersL(lang).map((c) => {
        const levels = TRACK_LEVELS[c.track];
        const bosses = TRACK_BOSSES[c.track].length;
        const done = levels.filter((s) => p.levels[s]).length;
        return (
          <Link key={c.track} href={L(`/play/${c.track}/`)} className="chapter-card">
            <span className="n">{t("chapter.n", { n: c.n })}</span>
            <h3>{c.title}</h3>
            <p className="kick">{c.kicker}</p>
            <div className="sec-dots" aria-label={t("chapter.mastered", { done, n: levels.length })}>
              {levels.map((s) => (
                <i key={s} className={p.levels[s] ? "done" : ""} />
              ))}
              {TRACK_BOSSES[c.track].map((id) => (
                <i key={id} className={`boss${p.missions[id] ? " done" : ""}`} />
              ))}
            </div>
            <div className="row muted" style={{ fontSize: 13.5 }}>
              <span>
                {t("chapter.sections", { n: levels.length })} · {bosses > 1 ? t("chapter.bossN", { n: bosses }) : t("chapter.boss1")}
              </span>
              <span className="spacer" />
              <span>{done ? t("chapter.mastered", { done, n: levels.length }) : t("chapter.notStarted")}</span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
