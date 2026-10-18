"use client";

import Link from "next/link";
import { ChapterCards } from "@/components/ChapterCards";
import { DotField } from "@/components/DotField";
import { PlayerCard } from "@/components/PlayerCard";
import { useLang } from "@/i18n/client";

export function HomeView() {
  const { t } = useLang();
  return (
    <>
      <section className="cover">
        <div className="cover-inner">
          <div>
            <h1>
              {t("home.title1")}
              <br />
              <span className="lime">{t("home.title2")}</span>
            </h1>
            <p>{t("home.lede")}</p>
            <DotField />
          </div>
          <PlayerCard />
        </div>
      </section>
      <section className="chapters">
        <div className="row" style={{ alignItems: "baseline", marginBottom: 14 }}>
          <h2 style={{ margin: 0 }}>{t("home.contents")}</h2>
          <span className="spacer" />
          <Link href="/lab/" className="muted">{t("home.skipToLab")}</Link>
        </div>
        <ChapterCards />
      </section>
    </>
  );
}
