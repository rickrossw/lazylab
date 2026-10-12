"use client";

import Link from "next/link";
import { TRACK_LEVELS } from "@/content/levels";
import { bossUnlocked, masteredIn } from "@/lib/game";
import type { TrackId } from "@/missions";
import { useProgress } from "./useProgress";

export function BossCard({ id, track, title, tagline }: { id: string; track: TrackId; title: string; tagline: string }) {
  const p = useProgress();
  const open = bossUnlocked(p, track);
  const beaten = p.missions[id];
  const need = Math.ceil(TRACK_LEVELS[track].length / 2) - masteredIn(p, track);
  return (
    <div className="boss-card">
      <div className="lbl">◆ Boss mission</div>
      <h3>{title}</h3>
      <p>{tagline}</p>
      <div className="row">
        {beaten ? (
          <>
            <span className="stars" aria-label={`${beaten.stars} stars`}>{"★".repeat(beaten.stars)}{"☆".repeat(3 - beaten.stars)}</span>
            <span style={{ color: "#b9cad5" }}>best {beaten.bestScore}</span>
            <Link href={`/missions/${id}/`} className="btn small">Play again</Link>
          </>
        ) : open ? (
          <Link href={`/missions/${id}/`} className="btn lime">Take on the boss →</Link>
        ) : (
          <>
            <span style={{ color: "#b9cad5" }}>🔒 Master {need} more section{need === 1 ? "" : "s"} in this chapter to unlock.</span>
            <Link href={`/missions/${id}/`} className="btn small">Play anyway</Link>
          </>
        )}
      </div>
    </div>
  );
}
