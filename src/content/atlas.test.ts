import { describe, expect, test } from "vitest";
import { ATLAS, getEntry } from "./atlas";
import { SOURCES } from "./sources";
import { MISSIONS } from "@/missions";

describe("atlas content integrity", () => {
  test("slugs are unique", () => {
    expect(new Set(ATLAS.map((e) => e.slug)).size).toBe(ATLAS.length);
  });
  test("every [[link]], related slug and source resolves", () => {
    for (const e of ATLAS) {
      for (const m of e.body.matchAll(/\[\[([^\]|\\]+)/g)) expect(getEntry(m[1].trim()), `${e.slug} → ${m[1]}`).toBeDefined();
      for (const r of e.related) expect(getEntry(r), `${e.slug} related ${r}`).toBeDefined();
      for (const s of e.sources) expect(SOURCES[s], `${e.slug} source ${s}`).toBeDefined();
    }
  });
  test("missions link to existing atlas entries", () => {
    for (const m of MISSIONS) for (const a of m.atlas) expect(getEntry(a), `${m.id} → ${a}`).toBeDefined();
  });
});
