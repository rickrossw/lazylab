import { describe, expect, test } from "vitest";
import { CHALLENGES, TRACK_BOSSES, TRACK_LEVELS, TRACK_ORDER, checkNumber, rankFor } from "@/content/levels";
import { getMission } from "@/missions";
import { bossUnlocked, levelCoverage, nextUp, LEVEL_COUNT } from "./game";
import { emptyProgress, mergeProgress, streak, totalXp, type Progress } from "./progress";

describe("levels content", () => {
  test("every Atlas entry is exactly one level and has a valid checkpoint", () => {
    expect(levelCoverage()).toEqual({ missing: [], extra: [] });
    const all = TRACK_ORDER.flatMap((t) => TRACK_LEVELS[t]);
    expect(new Set(all).size).toBe(all.length);
    expect(LEVEL_COUNT).toBe(44);
    for (const slug of all) {
      const qs = CHALLENGES[slug];
      expect(qs?.length, slug).toBeGreaterThan(0);
      for (const q of qs) {
        if (q.kind === "choice") {
          expect(q.answer, `${slug}: ${q.prompt}`).toBeGreaterThanOrEqual(0);
          expect(q.answer, `${slug}: ${q.prompt}`).toBeLessThan(q.options.length);
        } else {
          expect(checkNumber(q, String(q.answer)), `${slug}: ${q.prompt}`).toBe(true);
        }
        expect(q.explain.length).toBeGreaterThan(10);
      }
    }
  });
  test("bosses exist", () => {
    for (const t of TRACK_ORDER) for (const id of TRACK_BOSSES[t]) expect(getMission(id), id).toBeDefined();
  });
  test("number answers accept separators and units, reject wrong values", () => {
    const q = { kind: "number" as const, prompt: "", answer: 1200, tolerance: 0, explain: "" };
    expect(checkNumber(q, "1,200 kg")).toBe(true);
    expect(checkNumber(q, "1201")).toBe(false);
    expect(checkNumber(q, "")).toBe(false);
  });
});

describe("progress", () => {
  const lvl = (xp: number) => ({ xp, at: "2026-10-01T00:00:00Z" });
  test("merge keeps the best of both devices", () => {
    const a: Progress = { ...emptyProgress(), levels: { gpu: lvl(30) }, missions: { straggler: { bestScore: 800, stars: 2, completedAt: "x" } }, days: ["2026-10-01"], atlasRead: ["gpu"] };
    const b: Progress = { ...emptyProgress(), levels: { gpu: lvl(50), hbm: lvl(50) }, missions: { straggler: { bestScore: 700, stars: 3, completedAt: "y" } }, days: ["2026-10-02"], atlasRead: ["hbm"] };
    const m = mergeProgress(a, b);
    expect(m.levels.gpu.xp).toBe(50);
    expect(m.levels.hbm.xp).toBe(50);
    expect(m.missions.straggler.bestScore).toBe(800);
    expect(m.missions.straggler.stars).toBe(3);
    expect(m.days).toEqual(["2026-10-01", "2026-10-02"]);
    expect(m.atlasRead).toEqual(["gpu", "hbm"]);
    expect(mergeProgress(m, a)).toEqual(m);
  });
  test("xp, rank and streak", () => {
    const p: Progress = { ...emptyProgress(), levels: { gpu: lvl(50), hbm: lvl(30) }, missions: { "pod-design": { bestScore: 1000, stars: 3, completedAt: "z" } }, days: ["2026-10-09", "2026-10-10", "2026-10-11"] };
    expect(totalXp(p)).toBe(280);
    expect(rankFor(280).title).toBe("Junior SRE");
    expect(streak(p, new Date(2026, 9, 11))).toBe(3);
    expect(streak(p, new Date(2026, 9, 12))).toBe(3);
    expect(streak(p, new Date(2026, 9, 13))).toBe(0);
  });
  test("next up walks the book, and bosses unlock at half a chapter", () => {
    const p = emptyProgress();
    expect(nextUp(p)).toEqual({ kind: "level", slug: "gpu", track: "architecture" });
    for (const s of TRACK_LEVELS.architecture.slice(0, 4)) p.levels[s] = lvl(50);
    expect(bossUnlocked(p, "architecture")).toBe(true);
    expect(nextUp(p)).toEqual({ kind: "boss", id: "pod-design", track: "architecture" });
    p.missions["pod-design"] = { bestScore: 900, stars: 3, completedAt: "" };
    expect(nextUp(p)).toEqual({ kind: "level", slug: "nvlink", track: "architecture" });
  });
});
