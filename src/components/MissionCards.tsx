"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TRACKS, type Mission } from "@/missions";
import { loadProgress, type Progress } from "@/lib/progress";

export function Difficulty({ level }: { level: number }) {
  return (
    <span className="diff" title={`Difficulty ${level}/3`} aria-label={`Difficulty ${level} of 3`}>
      {[1, 2, 3].map((i) => (
        <i key={i} className={i <= level ? "on" : ""} />
      ))}
    </span>
  );
}

export type MissionSummary = Pick<Mission, "id" | "title" | "track" | "difficulty" | "tagline" | "kind">;

export function MissionCards({ missions }: { missions: MissionSummary[] }) {
  const [p, setP] = useState<Progress | null>(null);
  useEffect(() => setP(loadProgress()), []);
  return (
    <div className="grid grid-2">
      {missions.map((m, i) => {
        const done = p?.missions[m.id];
        const t = TRACKS[m.track];
        return (
          <Link key={m.id} href={`/missions/${m.id}/`} className="card card-link track-card" style={{ ["--track" as string]: t.color }}>
            <div className="row" style={{ marginBottom: 6 }}>
              <span className="eyebrow">#{i + 1} · {t.name}</span>
              <span className="spacer" />
              <Difficulty level={m.difficulty} />
            </div>
            <h3 style={{ marginBottom: 4 }}>{m.title}</h3>
            <p className="muted" style={{ fontSize: 14.5, marginBottom: 10 }}>{m.tagline}</p>
            <div className="row" style={{ fontSize: 13 }}>
              <span className="chip">{m.kind === "designer" ? "design" : "terminal"}</span>
              <span className="spacer" />
              {done ? (
                <span>
                  <span className="stars" aria-label={`${done.stars} stars`}>{"★".repeat(done.stars)}{"☆".repeat(3 - done.stars)}</span>{" "}
                  <span className="mono muted">{done.bestScore}</span>
                </span>
              ) : (
                <span className="muted">not played</span>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
