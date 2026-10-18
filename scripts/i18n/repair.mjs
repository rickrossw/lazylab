// Safety net for machine translations: any line whose cross-links, code snippets or {placeholders}
// don't match the English line is replaced by the English line. Run after translating.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";

const en = JSON.parse(readFileSync("i18n/en.json", "utf8"));
const sig = (s) =>
  JSON.stringify([
    [...s.matchAll(/\[\[([^\]|\\]+)/g)].map((m) => m[1].trim()).sort(),
    [...s.matchAll(/`[^`]+`/g)].map((m) => m[0]).sort(),
    [...s.matchAll(/\{\w+\}/g)].map((m) => m[0]).sort(),
  ]);

for (const file of readdirSync("public/i18n").filter((f) => f.endsWith(".json") && f !== "es.json")) {
  const path = `public/i18n/${file}`;
  const d = JSON.parse(readFileSync(path, "utf8"));
  let fixed = 0;
  for (const [k, src] of Object.entries(en)) {
    const tr = d[k];
    if (typeof tr !== "string") { d[k] = src; fixed++; continue; }
    if (sig(tr) === sig(src)) continue;
    const a = src.split("\n"), b = tr.split("\n");
    d[k] = a.length === b.length ? b.map((line, i) => (sig(line) === sig(a[i]) ? line : a[i])).join("\n") : src;
    if (sig(d[k]) !== sig(src)) d[k] = src;
    fixed++;
  }
  writeFileSync(path, JSON.stringify(d));
  if (fixed) console.log(`${file}: ${fixed} string(s) repaired`);
}
