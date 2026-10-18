// Language-aware accessors for all text. `d` is the loaded translation dictionary for the current
// language (null for English); every lookup falls back to the English source, so a missing string
// never breaks a page.

import { MISSIONS, TRACKS, type Mission, type TrackId } from "@/missions";
import { getEntry, type AtlasCategory } from "./atlas";
import { CHAPTERS, type Chapter } from "./chapters";
import { CHALLENGES, type Question } from "./levels";

export type Dict = Record<string, string> | null;

const pick = (d: Dict, key: string, fallback: string) => (d && d[key]) || fallback;

export function entryText(slug: string, d: Dict): { title: string; summary: string; body: string } | undefined {
  const e = getEntry(slug);
  if (!e) return undefined;
  return {
    title: pick(d, `atlas.${slug}.title`, e.title),
    summary: pick(d, `atlas.${slug}.summary`, e.summary),
    body: pick(d, `atlas.${slug}.body`, e.body),
  };
}

export function titleResolver(d: Dict) {
  return (slug: string) => entryText(slug, d)?.title;
}

export function chapterText(c: Chapter, d: Dict): Chapter {
  return { ...c, title: pick(d, `chapter.${c.track}.title`, c.title), kicker: pick(d, `chapter.${c.track}.kicker`, c.kicker), intro: pick(d, `chapter.${c.track}.intro`, c.intro) };
}

export function chaptersL(d: Dict): Chapter[] {
  return CHAPTERS.map((c) => chapterText(c, d));
}

export function trackText(id: TrackId, d: Dict): { name: string; blurb: string; color: string } {
  const t = TRACKS[id];
  return { ...t, name: pick(d, `track.${id}.name`, t.name), blurb: pick(d, `track.${id}.blurb`, t.blurb) };
}

export function challengesL(slug: string, d: Dict): Question[] {
  return (CHALLENGES[slug] ?? []).map((q, i): Question => {
    const k = `cp.${slug}.${i}`;
    const base = { prompt: pick(d, `${k}.prompt`, q.prompt), explain: pick(d, `${k}.explain`, q.explain) };
    if (q.kind === "choice") return { ...q, ...base, options: q.options.map((o, j) => pick(d, `${k}.opt.${j}`, o)) };
    return { ...q, ...base, unit: q.unit ? pick(d, `${k}.unit`, q.unit) : undefined };
  });
}

export interface MissionCopy {
  title: string;
  tagline: string;
  briefing: string;
  objectives: string[];
  hints: string[];
  debrief: string;
}

export function missionText(m: Mission, d: Dict): MissionCopy {
  const k = `mission.${m.id}`;
  return {
    title: pick(d, `${k}.title`, m.title),
    tagline: pick(d, `${k}.tagline`, m.tagline),
    briefing: pick(d, `${k}.briefing`, m.briefing),
    debrief: pick(d, `${k}.debrief`, m.debrief),
    objectives: m.objectives.map((o, i) => pick(d, `${k}.objective.${i}`, o.text)),
    hints: m.hints.map((h, i) => pick(d, `${k}.hint.${i}`, h)),
  };
}

export function missionTitle(id: string, d: Dict): string {
  const m = MISSIONS.find((x) => x.id === id);
  return m ? missionText(m, d).title : id;
}

export function categoryText(c: AtlasCategory, d: Dict): string {
  return pick(d, `category.${c}`, c);
}

export function rankText(title: string, d: Dict): string {
  return pick(d, `rank.${title}`, title);
}
