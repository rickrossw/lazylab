"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TRACK_BOSSES, TRACK_LEVELS } from "@/content/levels";
import { chaptersL, missionTitle } from "@/content/localized";
import type { TrackId } from "@/missions";
import { useLang } from "@/i18n/client";
import { useProgress } from "./useProgress";

export function PlaybookToc({ current, titles }: { current?: TrackId; titles: Record<string, string> }) {
  const { lang, t, L } = useLang();
  const p = useProgress();
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    if (!current) return;
    const els = TRACK_LEVELS[current].map((s) => document.getElementById(s)).filter((e): e is HTMLElement => !!e);
    const obs = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive(vis[0].target.id);
      },
      { rootMargin: "-80px 0px -60% 0px" },
    );
    els.forEach((e) => obs.observe(e));
    return () => obs.disconnect();
  }, [current]);

  return (
    <nav aria-label={t("toc.label")}>
      {chaptersL(lang).map((c) => (
        <div key={c.track}>
          <Link href={L(`/play/${c.track}/`)} className={`ch${c.track === current ? " current" : ""}`}>
            {c.n}. {c.title}
          </Link>
          {c.track === current &&
            TRACK_LEVELS[c.track].map((s, i) => (
              <a key={s} href={`#${s}`} className={`sec${active === s ? " active" : ""}`}>
                <span className={`tick${p.levels[s] ? " done" : ""}`}>{p.levels[s] ? "✓" : `${c.n}.${i + 1}`}</span>
                {titles[s]}
              </a>
            ))}
          {c.track === current &&
            TRACK_BOSSES[c.track].map((id) => (
              <a key={id} href="#boss" className="sec boss">
                <span className={`tick${p.missions[id] ? " done" : ""}`}>{p.missions[id] ? "✓" : "◆"}</span>
                {t("toc.boss", { title: missionTitle(id, lang) })}
              </a>
            ))}
        </div>
      ))}
    </nav>
  );
}
