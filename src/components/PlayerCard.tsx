"use client";

import Link from "next/link";
import { LEVEL_COUNT, nextUp } from "@/lib/game";
import { RANKS, rankFor } from "@/content/levels";
import { atlasTitle } from "@/content/atlas";
import { MISSIONS, getMission } from "@/missions";
import { streak, totalXp } from "@/lib/progress";
import { useProgress } from "./useProgress";

export function PlayerCard() {
  const p = useProgress();
  const xp = totalXp(p);
  const rank = rankFor(xp);
  const mastered = Object.keys(p.levels).length;
  const bosses = Object.keys(p.missions).length;
  const s = streak(p);
  const next = nextUp(p);
  const floor = [...RANKS].reverse().find((r) => xp >= r.xp)?.xp ?? 0;
  const pct = rank.next ? Math.min(100, ((xp - floor) / (rank.next.xp - floor)) * 100) : 100;
  const href = !next ? "/lab/" : next.kind === "boss" ? `/missions/${next.id}/` : `/play/${next.track}/#${next.slug}`;
  const label = !next ? "Free play in the Lab" : next.kind === "boss" ? `Boss: ${getMission(next.id)?.title}` : atlasTitle(next.slug);
  return (
    <div className="player" aria-label="Your progress">
      <div className="k">Rank</div>
      <div className="rank">{rank.title}</div>
      <div className="xpbar" aria-hidden>
        <div style={{ width: `${pct}%` }} />
      </div>
      <div className="k">
        {xp} XP{rank.next ? ` · ${rank.next.xp - xp} to ${rank.next.title}` : " · top rank"}
      </div>
      <div className="readout" style={{ gridTemplateColumns: "repeat(3, 1fr)", marginTop: 14 }}>
        <div>
          <div className="k">Sections</div>
          <div className="v">{mastered}/{LEVEL_COUNT}</div>
        </div>
        <div>
          <div className="k">Bosses</div>
          <div className="v">{bosses}/{MISSIONS.length}</div>
        </div>
        <div>
          <div className="k">Streak</div>
          <div className="v">{s} {s === 1 ? "day" : "days"}</div>
        </div>
      </div>
      <Link href={href} className="btn lime">
        {mastered + bosses === 0 ? "Start reading" : "Continue"}: {label} →
      </Link>
    </div>
  );
}
