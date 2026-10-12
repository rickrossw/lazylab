"use client";

import Link from "next/link";
import { CHAPTERS } from "@/content/chapters";
import { TRACK_BOSSES, TRACK_LEVELS } from "@/content/levels";
import { useProgress } from "./useProgress";

export function ChapterCards() {
  const p = useProgress();
  return (
    <div className="chapter-grid">
      {CHAPTERS.map((c) => {
        const levels = TRACK_LEVELS[c.track];
        const done = levels.filter((s) => p.levels[s]).length;
        return (
          <Link key={c.track} href={`/play/${c.track}/`} className="chapter-card">
            <span className="n">Chapter {c.n}</span>
            <h3>{c.title}</h3>
            <p className="kick">{c.kicker}</p>
            <div className="sec-dots" aria-label={`${done} of ${levels.length} sections mastered`}>
              {levels.map((s) => (
                <i key={s} className={p.levels[s] ? "done" : ""} />
              ))}
              {TRACK_BOSSES[c.track].map((id) => (
                <i key={id} className={`boss${p.missions[id] ? " done" : ""}`} title="Boss mission" />
              ))}
            </div>
            <div className="row muted" style={{ fontSize: 13.5 }}>
              <span>{levels.length} sections · {TRACK_BOSSES[c.track].length} boss{TRACK_BOSSES[c.track].length > 1 ? "es" : ""}</span>
              <span className="spacer" />
              <span>{done ? `${done}/${levels.length} mastered` : "not started"}</span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
