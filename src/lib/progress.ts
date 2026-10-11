// Per-browser progress (no account needed). Every access is guarded: storage can be unavailable.

export interface MissionProgress {
  bestScore: number;
  stars: number;
  completedAt: string;
}

export interface Progress {
  missions: Record<string, MissionProgress>;
  atlasRead: string[];
}

const KEY = "lazylab.progress.v1";
const EMPTY: Progress = { missions: {}, atlasRead: [] };

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY, missions: {}, atlasRead: [] };
    const p = JSON.parse(raw) as Partial<Progress>;
    return { missions: p.missions ?? {}, atlasRead: p.atlasRead ?? [] };
  } catch {
    return { missions: {}, atlasRead: [] };
  }
}

function save(p: Progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {}
}

export function recordMission(id: string, score: number, stars: number): Progress {
  const p = loadProgress();
  const prev = p.missions[id];
  if (!prev || score > prev.bestScore) p.missions[id] = { bestScore: score, stars, completedAt: new Date().toISOString() };
  save(p);
  return p;
}

export function markRead(slug: string) {
  const p = loadProgress();
  if (!p.atlasRead.includes(slug)) {
    p.atlasRead.push(slug);
    save(p);
  }
}
