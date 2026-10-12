// Language-aware accessors for all learning content. English is the source of truth; Spanish
// overrides the human-readable text and keeps every id, link, answer and number identical.

import type { Lang } from "@/i18n";
import { MISSIONS, TRACKS, type Mission, type TrackId } from "@/missions";
import { getEntry } from "./atlas";
import { CHAPTERS, type Chapter } from "./chapters";
import { CHALLENGES, type Question } from "./levels";
import { ATLAS_ES, CHALLENGES_ES, CHAPTERS_ES, MISSIONS_ES, TRACKS_ES } from "./es";

export function entryText(slug: string, lang: Lang): { title: string; summary: string; body: string } | undefined {
  const e = getEntry(slug);
  if (!e) return undefined;
  const es = lang === "es" ? ATLAS_ES[slug] : undefined;
  return es ?? { title: e.title, summary: e.summary, body: e.body };
}

export function titleResolver(lang: Lang) {
  return (slug: string) => entryText(slug, lang)?.title;
}

export function chapterText(c: Chapter, lang: Lang): Chapter {
  return lang === "es" ? { ...c, ...CHAPTERS_ES[c.track] } : c;
}

export function chaptersL(lang: Lang): Chapter[] {
  return CHAPTERS.map((c) => chapterText(c, lang));
}

export function trackText(id: TrackId, lang: Lang): { name: string; blurb: string; color: string } {
  const t = TRACKS[id];
  return lang === "es" ? { ...t, ...TRACKS_ES[id] } : t;
}

export function challengesL(slug: string, lang: Lang): Question[] {
  return (lang === "es" ? CHALLENGES_ES[slug] : undefined) ?? CHALLENGES[slug] ?? [];
}

export interface MissionCopy {
  title: string;
  tagline: string;
  briefing: string;
  objectives: string[];
  hints: string[];
  debrief: string;
}

export function missionText(m: Mission, lang: Lang): MissionCopy {
  const es = lang === "es" ? MISSIONS_ES[m.id] : undefined;
  if (es) return es;
  return { title: m.title, tagline: m.tagline, briefing: m.briefing, objectives: m.objectives.map((o) => o.text), hints: m.hints, debrief: m.debrief };
}

export function missionTitle(id: string, lang: Lang): string {
  const m = MISSIONS.find((x) => x.id === id);
  return m ? missionText(m, lang).title : id;
}
