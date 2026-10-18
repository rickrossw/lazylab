// Flattens every translatable string into i18n/en.json (source) and i18n/es.json (hand-written
// Spanish). Keys are stable ids; scripts/i18n/translate.py machine-translates en.json into the
// other languages, and the site loads the result from public/i18n/<code>.json.
import { writeFileSync, mkdirSync } from "node:fs";
import { ATLAS, CATEGORIES } from "@/content/atlas";
import { CHAPTERS } from "@/content/chapters";
import { CHALLENGES, RANKS, type Question } from "@/content/levels";
import { MISSIONS, TRACKS } from "@/missions";
import { UI_KEYS, t } from "@/i18n/ui";
import { ATLAS_ES, CHALLENGES_ES, CHAPTERS_ES, MISSIONS_ES, TRACKS_ES } from "@/content/es";
import { CATEGORY_ES, RANKS_ES } from "@/content/es/labels";

type Flat = Record<string, string>;

function questions(prefix: string, qs: Question[], out: Flat) {
  qs.forEach((q, i) => {
    const k = `${prefix}.${i}`;
    out[`${k}.prompt`] = q.prompt;
    out[`${k}.explain`] = q.explain;
    if (q.kind === "choice") q.options.forEach((o, j) => (out[`${k}.opt.${j}`] = o));
    else if (q.unit) out[`${k}.unit`] = q.unit;
  });
}

function build(lang: "en" | "es"): Flat {
  const out: Flat = {};
  for (const k of UI_KEYS) out[`ui.${k}`] = t(lang, k);
  for (const e of ATLAS) {
    const x = lang === "es" ? ATLAS_ES[e.slug] : e;
    out[`atlas.${e.slug}.title`] = x.title;
    out[`atlas.${e.slug}.summary`] = x.summary;
    out[`atlas.${e.slug}.body`] = x.body;
  }
  for (const c of CHAPTERS) {
    const x = lang === "es" ? CHAPTERS_ES[c.track] : c;
    out[`chapter.${c.track}.title`] = x.title;
    out[`chapter.${c.track}.kicker`] = x.kicker;
    out[`chapter.${c.track}.intro`] = x.intro;
  }
  for (const [id, tr] of Object.entries(TRACKS)) {
    const x = lang === "es" ? TRACKS_ES[id as keyof typeof TRACKS_ES] : tr;
    out[`track.${id}.name`] = x.name;
    out[`track.${id}.blurb`] = x.blurb;
  }
  for (const m of MISSIONS) {
    const x = lang === "es" ? MISSIONS_ES[m.id] : { title: m.title, tagline: m.tagline, briefing: m.briefing, debrief: m.debrief, hints: m.hints, objectives: m.objectives.map((o) => o.text) };
    out[`mission.${m.id}.title`] = x.title;
    out[`mission.${m.id}.tagline`] = x.tagline;
    out[`mission.${m.id}.briefing`] = x.briefing;
    out[`mission.${m.id}.debrief`] = x.debrief;
    x.objectives.forEach((o, i) => (out[`mission.${m.id}.objective.${i}`] = o));
    x.hints.forEach((h, i) => (out[`mission.${m.id}.hint.${i}`] = h));
  }
  for (const [slug, qs] of Object.entries(CHALLENGES)) questions(`cp.${slug}`, lang === "es" ? CHALLENGES_ES[slug] : qs, out);
  for (const c of CATEGORIES) out[`category.${c}`] = lang === "es" ? CATEGORY_ES[c] : c;
  for (const r of RANKS) out[`rank.${r.title}`] = lang === "es" ? RANKS_ES[r.title] ?? r.title : r.title;
  return out;
}

mkdirSync("i18n", { recursive: true });
mkdirSync("public/i18n", { recursive: true });
const en = build("en");
const es = build("es");
writeFileSync("i18n/en.json", JSON.stringify(en, null, 1));
writeFileSync("public/i18n/es.json", JSON.stringify(es));
console.log(`extracted ${Object.keys(en).length} strings, ${Object.values(en).join(" ").split(/\s+/).length} words`);
