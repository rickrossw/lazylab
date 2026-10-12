// Skill-map rules: which levels and bosses are unlocked, and what to play next.

import { ATLAS } from "@/content/atlas";
import { TRACK_BOSSES, TRACK_LEVELS, TRACK_ORDER } from "@/content/levels";
import type { TrackId } from "@/missions";
import type { Progress } from "./progress";

export function trackOf(slug: string): TrackId | undefined {
  return TRACK_ORDER.find((t) => TRACK_LEVELS[t].includes(slug));
}

export function isMastered(p: Progress, slug: string): boolean {
  return !!p.levels[slug];
}

export function masteredIn(p: Progress, t: TrackId): number {
  return TRACK_LEVELS[t].filter((s) => isMastered(p, s)).length;
}

/** Bosses open once half of the track's levels are mastered. */
export function bossUnlocked(p: Progress, t: TrackId): boolean {
  return masteredIn(p, t) >= Math.ceil(TRACK_LEVELS[t].length / 2);
}

export function bossTrack(missionId: string): TrackId | undefined {
  return TRACK_ORDER.find((t) => TRACK_BOSSES[t].includes(missionId));
}

export type NextUp = { kind: "level"; slug: string; track: TrackId } | { kind: "boss"; id: string; track: TrackId } | null;

/** Suggests what to do next: an unlocked boss you haven't beaten, else the next unmastered section in book order. */
export function nextUp(p: Progress): NextUp {
  for (const t of TRACK_ORDER) {
    if (!bossUnlocked(p, t)) continue;
    const boss = TRACK_BOSSES[t].find((id) => !p.missions[id]);
    if (boss) return { kind: "boss", id: boss, track: t };
  }
  for (const t of TRACK_ORDER) {
    const slug = TRACK_LEVELS[t].find((s) => !isMastered(p, s));
    if (slug) return { kind: "level", slug, track: t };
  }
  return null;
}

export const LEVEL_COUNT = TRACK_ORDER.reduce((n, t) => n + TRACK_LEVELS[t].length, 0);

/** Sanity: every Atlas entry is a level exactly once. */
export function levelCoverage(): { missing: string[]; extra: string[] } {
  const all = TRACK_ORDER.flatMap((t) => TRACK_LEVELS[t]);
  return { missing: ATLAS.map((e) => e.slug).filter((s) => !all.includes(s)), extra: all.filter((s) => !ATLAS.some((e) => e.slug === s)) };
}
