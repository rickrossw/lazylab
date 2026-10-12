import { describe, expect, test } from "vitest";
import { ATLAS } from "./atlas";
import { CHALLENGES } from "./levels";
import { ATLAS_ES, CHALLENGES_ES, CHAPTERS_ES, MISSIONS_ES, TRACKS_ES } from "./es";
import { MISSIONS, TRACKS } from "@/missions";
import { CHAPTERS } from "./chapters";
import { checkNumber } from "./levels";

const links = (s: string) => [...s.matchAll(/\[\[([^\]|\\]+)/g)].map((m) => m[1].trim()).sort();

describe("Spanish content", () => {
  test("every Atlas entry is translated, with the same cross-links", () => {
    for (const e of ATLAS) {
      const es = ATLAS_ES[e.slug];
      expect(es, e.slug).toBeDefined();
      expect(es.title.length && es.summary.length && es.body.length, e.slug).toBeTruthy();
      expect(links(es.body), `${e.slug} links`).toEqual(links(e.body));
    }
    expect(Object.keys(ATLAS_ES).sort()).toEqual(ATLAS.map((e) => e.slug).sort());
  });

  test("checkpoints match the English exactly in structure and answers", () => {
    for (const [slug, qs] of Object.entries(CHALLENGES)) {
      const es = CHALLENGES_ES[slug];
      expect(es?.length, slug).toBe(qs.length);
      qs.forEach((q, i) => {
        const e = es[i];
        expect(e.kind, `${slug}#${i}`).toBe(q.kind);
        expect(e.code, `${slug}#${i} code`).toBe(q.code);
        if (q.kind === "choice" && e.kind === "choice") {
          expect(e.options.length, `${slug}#${i}`).toBe(q.options.length);
          expect(e.answer, `${slug}#${i}`).toBe(q.answer);
        }
        if (q.kind === "number" && e.kind === "number") {
          expect([e.answer, e.tolerance], `${slug}#${i}`).toEqual([q.answer, q.tolerance]);
          expect(checkNumber(e, String(e.answer))).toBe(true);
        }
      });
    }
  });

  test("chapters, tracks and missions are translated", () => {
    for (const c of CHAPTERS) expect(CHAPTERS_ES[c.track]?.title, c.track).toBeTruthy();
    for (const t of Object.keys(TRACKS)) expect(TRACKS_ES[t as keyof typeof TRACKS_ES]?.name, t).toBeTruthy();
    for (const m of MISSIONS) {
      const es = MISSIONS_ES[m.id];
      expect(es, m.id).toBeDefined();
      expect(es.objectives.length, `${m.id} objectives`).toBe(m.objectives.length);
      expect(es.hints.length, `${m.id} hints`).toBe(m.hints.length);
    }
  });
});
