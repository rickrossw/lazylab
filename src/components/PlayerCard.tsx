"use client";

import Link from "next/link";
import { LEVEL_COUNT, nextUp } from "@/lib/game";
import { RANKS, rankFor } from "@/content/levels";
import { entryText, missionTitle, rankText } from "@/content/localized";
import { MISSIONS } from "@/missions";
import { streak, totalXp } from "@/lib/progress";
import { useLang } from "@/i18n/client";
import { useProgress } from "./useProgress";


export function PlayerCard() {
  const { lang, t, L, d } = useLang();
  const p = useProgress();
  const xp = totalXp(p);
  const rank = rankFor(xp);
  const rt = (title: string) => rankText(title, d);
  const mastered = Object.keys(p.levels).length;
  const bosses = Object.keys(p.missions).length;
  const s = streak(p);
  const next = nextUp(p);
  const floor = [...RANKS].reverse().find((r) => xp >= r.xp)?.xp ?? 0;
  const pct = rank.next ? Math.min(100, ((xp - floor) / (rank.next.xp - floor)) * 100) : 100;
  const href = !next ? L("/lab/") : next.kind === "boss" ? L(`/missions/${next.id}/`) : L(`/play/${next.track}/#${next.slug}`);
  const label = !next ? t("player.lab") : next.kind === "boss" ? t("player.boss", { title: missionTitle(next.id, d) }) : entryText(next.slug, d)?.title;
  return (
    <div className="player" aria-label={t("player.label")}>
      <div className="k">{t("player.rank")}</div>
      <div className="rank">{rt(rank.title)}</div>
      <div className="xpbar" aria-hidden>
        <div style={{ width: `${pct}%` }} />
      </div>
      <div className="k">{rank.next ? t("player.toNext", { xp, left: rank.next.xp - xp, next: rt(rank.next.title) }) : t("player.top", { xp })}</div>
      <div className="readout" style={{ gridTemplateColumns: "repeat(3, 1fr)", marginTop: 14 }}>
        <div>
          <div className="k">{t("player.sections")}</div>
          <div className="v">{mastered}/{LEVEL_COUNT}</div>
        </div>
        <div>
          <div className="k">{t("player.bosses")}</div>
          <div className="v">{bosses}/{MISSIONS.length}</div>
        </div>
        <div>
          <div className="k">{t("player.streak")}</div>
          <div className="v">{s} {s === 1 ? t("player.day") : t("player.days")}</div>
        </div>
      </div>
      <Link href={href} className="btn lime">
        {mastered + bosses === 0 ? t("player.start") : t("player.continue")}: {label} →
      </Link>
    </div>
  );
}
