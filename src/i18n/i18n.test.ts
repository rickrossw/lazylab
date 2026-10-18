import { describe, expect, test } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { LANGUAGES, matchLanguage } from "./languages";

const root = path.resolve(__dirname, "../..");
const source: Record<string, string> = JSON.parse(readFileSync(path.join(root, "i18n/en.json"), "utf8"));

const links = (s: string) => [...s.matchAll(/\[\[([^\]|\\]+)/g)].map((m) => m[1].trim()).sort();
const code = (s: string) => [...s.matchAll(/`[^`]+`/g)].map((m) => m[0]).sort();
const vars = (s: string) => [...s.matchAll(/\{\w+\}/g)].map((m) => m[0]).sort();

describe("translation files", () => {
  for (const lang of LANGUAGES.filter((l) => l.code !== "en")) {
    test(`${lang.code}: complete, and links/code/placeholders intact`, () => {
      const file = path.join(root, "public/i18n", `${lang.code}.json`);
      expect(existsSync(file), `${file} missing; run npm run i18n:translate`).toBe(true);
      const d: Record<string, string> = JSON.parse(readFileSync(file, "utf8"));
      for (const [k, en] of Object.entries(source)) {
        expect(d[k], `${lang.code} ${k} missing`).toBeTypeOf("string");
        expect(links(d[k]), `${lang.code} ${k} links`).toEqual(links(en));
        expect(vars(d[k]), `${lang.code} ${k} placeholders`).toEqual(vars(en));
        if (lang.machine) expect(code(d[k]), `${lang.code} ${k} code`).toEqual(code(en));
      }
    });
  }
});

describe("automatic language", () => {
  test("matches browser preferences to supported languages", () => {
    expect(matchLanguage(["es-MX", "en"])).toBe("es");
    expect(matchLanguage(["en-GB"])).toBe("en");
    expect(matchLanguage(["fr-FR", "es"])).toBe("es");
    expect(matchLanguage(["fr-FR"])).toBe("en");
  });
});
