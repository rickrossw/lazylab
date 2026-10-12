import Link from "next/link";
import { ChapterCards } from "@/components/ChapterCards";
import { DotField } from "@/components/DotField";
import { PlayerCard } from "@/components/PlayerCard";
import { localize, type Lang } from "@/i18n";
import { t } from "@/i18n/ui";

export function HomeView({ lang }: { lang: Lang }) {
  return (
    <>
      <section className="cover">
        <div className="cover-inner">
          <div>
            <h1>
              {t(lang, "home.title1")}
              <br />
              <span className="lime">{t(lang, "home.title2")}</span>
            </h1>
            <p>{t(lang, "home.lede")}</p>
            <DotField />
          </div>
          <PlayerCard />
        </div>
      </section>
      <section className="chapters">
        <div className="row" style={{ alignItems: "baseline", marginBottom: 14 }}>
          <h2 style={{ margin: 0 }}>{t(lang, "home.contents")}</h2>
          <span className="spacer" />
          <Link href={localize(lang, "/lab/")} className="muted">{t(lang, "home.skipToLab")}</Link>
        </div>
        <ChapterCards />
      </section>
    </>
  );
}
