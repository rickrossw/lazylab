// Languages offered on the site. English is the source; Spanish is hand-translated.

export interface Language {
  code: string;
  name: string;
  machine: boolean;
}

export const LANGUAGES: Language[] = [
  { code: "en", name: "English", machine: false },
  { code: "es", name: "Español", machine: false },
];

export const LANG_CODES = LANGUAGES.map((l) => l.code);

/** Best supported language for a list of browser preferences (e.g. navigator.languages). */
export function matchLanguage(prefs: readonly string[]): string {
  for (const raw of prefs) {
    const p = raw.toLowerCase();
    if (p.startsWith("zh")) return /tw|hk|mo|hant/.test(p) ? "zh-Hant" : "zh-Hans";
    if (p === "pt-br") return "pt-BR";
    if (p.startsWith("pt")) return "pt";
    if (p.startsWith("no") || p.startsWith("nn")) return "nb";
    const exact = LANGUAGES.find((l) => l.code.toLowerCase() === p);
    if (exact) return exact.code;
    const base = LANGUAGES.find((l) => l.code.toLowerCase() === p.split("-")[0]);
    if (base) return base.code;
  }
  return "en";
}
