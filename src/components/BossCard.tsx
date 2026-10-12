"use client";

import Link from "next/link";
import { TRACK_LEVELS } from "@/content/levels";
import { bossUnlocked, masteredIn } from "@/lib/game";
import type { TrackId } from "@/missions";
import { useLang } from "@/i18n/client";
import { useProgress } from "./useProgress";

export function BossCard({ id, track, title, tagline }: { id: string; track: TrackId; title: string; tagline: string }) {
  const { t, L } = useLang();
  const p = useProgress();
  const open = bossUnlocked(p, track);
  const beaten = p.missions[id];
  const need = Math.ceil(TRACK_LEVELS[track].length / 2) - masteredIn(p, track);
  const href = L(`/missions/${id}/`);
  return (
    <div className="boss-card">
      <div className="lbl">{t("boss.label")}</div>
      <h3>{title}</h3>
      <p>{tagline}</p>
      <div className="row">
        {beaten ? (
          <>
            <span className="stars" aria-label={`${beaten.stars}/3`}>{"★".repeat(beaten.stars)}{"☆".repeat(3 - beaten.stars)}</span>
            <span style={{ color: "#b9cad5" }}>{t("boss.best", { score: beaten.bestScore })}</span>
            <Link href={href} className="btn small">{t("boss.playAgain")}</Link>
          </>
        ) : open ? (
          <Link href={href} className="btn lime">{t("boss.take")}</Link>
        ) : (
          <>
            <span style={{ color: "#b9cad5" }}>{t("boss.locked", { n: need })}</span>
            <Link href={href} className="btn small">{t("boss.anyway")}</Link>
          </>
        )}
      </div>
    </div>
  );
}
