"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Mission } from "@/missions";
import { missionText, trackText } from "@/content/localized";
import { getMission } from "@/missions";
import { useLang } from "@/i18n/client";
import { loadProgress, type Progress } from "@/lib/progress";

export function Difficulty({ level }: { level: number }) {
  const { t } = useLang();
  return (
    <span className="diff" title={t("missions.difficulty", { n: level })} aria-label={t("missions.difficulty", { n: level })}>
      {[1, 2, 3].map((i) => (
        <i key={i} className={i <= level ? "on" : ""} />
      ))}
    </span>
  );
}

export type MissionSummary = Pick<Mission, "id" | "title" | "track" | "difficulty" | "tagline" | "kind">;

export function MissionCards({ missions }: { missions: MissionSummary[] }) {
  const { lang, t, L } = useLang();
  const [p, setP] = useState<Progress | null>(null);
  useEffect(() => setP(loadProgress()), []);
  return (
    <div className="grid grid-2">
      {missions.map((m, i) => {
        const done = p?.missions[m.id];
        const tr = trackText(m.track, lang);
        const copy = missionText(getMission(m.id)!, lang);
        return (
          <Link key={m.id} href={L(`/missions/${m.id}/`)} className="card card-link track-card" style={{ ["--track" as string]: tr.color }}>
            <div className="row" style={{ marginBottom: 6 }}>
              <span className="eyebrow">#{i + 1} · {tr.name}</span>
              <span className="spacer" />
              <Difficulty level={m.difficulty} />
            </div>
            <h3 style={{ marginBottom: 4 }}>{copy.title}</h3>
            <p className="muted" style={{ fontSize: 14.5, marginBottom: 10 }}>{copy.tagline}</p>
            <div className="row" style={{ fontSize: 13 }}>
              <span className="chip">{m.kind === "designer" ? t("missions.design") : t("missions.terminal")}</span>
              <span className="spacer" />
              {done ? (
                <span>
                  <span className="stars" aria-label={`${done.stars} stars`}>{"★".repeat(done.stars)}{"☆".repeat(3 - done.stars)}</span>{" "}
                  <span className="mono muted">{done.bestScore}</span>
                </span>
              ) : (
                <span className="muted">{t("missions.notPlayed")}</span>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
