// Player progress. Lives in localStorage so guests can play; when signed in, the sync layer
// (lib/auth) mirrors it to the server and merges with what's stored there.

export interface MissionProgress {
  bestScore: number;
  stars: number;
  completedAt: string;
}

export interface LevelProgress {
  xp: number;
  at: string;
}

export interface Progress {
  missions: Record<string, MissionProgress>;
  levels: Record<string, LevelProgress>;
  atlasRead: string[];
  /** Local dates (YYYY-MM-DD) on which the player earned XP, for streaks. */
  days: string[];
}

const KEY = "lazylab.progress.v1";

export function emptyProgress(): Progress {
  return { missions: {}, levels: {}, atlasRead: [], days: [] };
}

function normalize(p: Partial<Progress> | null | undefined): Progress {
  return {
    missions: p?.missions ?? {},
    levels: p?.levels ?? {},
    atlasRead: p?.atlasRead ?? [],
    days: p?.days ?? [],
  };
}

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? normalize(JSON.parse(raw)) : emptyProgress();
  } catch {
    return emptyProgress();
  }
}

type Listener = (p: Progress) => void;
const listeners = new Set<Listener>();

/** Subscribe to progress changes (local saves and merges from the server). */
export function onProgressChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function saveProgress(p: Progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {}
  for (const fn of listeners) fn(p);
}

export function today(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function touchDay(p: Progress) {
  const t = today();
  if (!p.days.includes(t)) p.days = [...p.days, t].sort().slice(-400);
}

/** XP a boss mission is worth for a given score (max 200). */
export function missionXp(score: number): number {
  return Math.round(Math.min(score, 1000) / 5);
}

export function recordMission(id: string, score: number, stars: number): Progress {
  const p = loadProgress();
  const prev = p.missions[id];
  if (!prev || score > prev.bestScore) p.missions[id] = { bestScore: score, stars: Math.max(stars, prev?.stars ?? 0), completedAt: new Date().toISOString() };
  touchDay(p);
  saveProgress(p);
  return p;
}

export function recordLevel(slug: string, xp: number): Progress {
  const p = loadProgress();
  const prev = p.levels[slug];
  if (!prev || xp > prev.xp) p.levels[slug] = { xp, at: new Date().toISOString() };
  touchDay(p);
  saveProgress(p);
  return p;
}

export function markRead(slug: string) {
  const p = loadProgress();
  if (!p.atlasRead.includes(slug)) {
    p.atlasRead.push(slug);
    saveProgress(p);
  }
}

export function totalXp(p: Progress): number {
  let xp = 0;
  for (const l of Object.values(p.levels)) xp += l.xp;
  for (const m of Object.values(p.missions)) xp += missionXp(m.bestScore);
  return xp;
}

/** Consecutive days with XP, ending today (or yesterday, so the streak survives until you play). */
export function streak(p: Progress, now = new Date()): number {
  const days = new Set(p.days);
  const d = new Date(now);
  if (!days.has(today(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(today(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

/** Combines two progress records (e.g. this device and the server), keeping the best of each. */
export function mergeProgress(a: Progress, b: Progress): Progress {
  const out = emptyProgress();
  for (const src of [a, b]) {
    for (const [id, m] of Object.entries(src.missions)) {
      const cur = out.missions[id];
      if (!cur || m.bestScore > cur.bestScore) out.missions[id] = { ...m, stars: Math.max(m.stars, cur?.stars ?? 0) };
      else cur.stars = Math.max(cur.stars, m.stars);
    }
    for (const [slug, l] of Object.entries(src.levels)) {
      const cur = out.levels[slug];
      if (!cur || l.xp > cur.xp) out.levels[slug] = { ...l };
    }
  }
  out.atlasRead = [...new Set([...a.atlasRead, ...b.atlasRead])].sort();
  out.days = [...new Set([...a.days, ...b.days])].sort().slice(-400);
  return out;
}

export function sameProgress(a: Progress, b: Progress): boolean {
  return JSON.stringify(mergeProgress(a, emptyProgress())) === JSON.stringify(mergeProgress(b, emptyProgress()));
}

export { normalize as normalizeProgress };
