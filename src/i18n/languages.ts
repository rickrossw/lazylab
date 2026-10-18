// Languages offered in the picker. English is the source; Spanish is hand-translated; the rest are
// machine-translated at build time with open-source models (scripts/i18n/translate.py).

export interface Language {
  code: string;
  name: string;
  machine: boolean;
}

export const LANGUAGES: Language[] = [
  { code: "en", name: "English", machine: false },
  { code: "es", name: "Español", machine: false },
  { code: "fr", name: "Français", machine: true },
  { code: "de", name: "Deutsch", machine: true },
  { code: "it", name: "Italiano", machine: true },
  { code: "pt", name: "Português (Portugal)", machine: true },
  { code: "pt-BR", name: "Português (Brasil)", machine: true },
  { code: "nl", name: "Nederlands", machine: true },
  { code: "pl", name: "Polski", machine: true },
  { code: "tr", name: "Türkçe", machine: true },
  { code: "id", name: "Bahasa Indonesia", machine: true },
  { code: "ro", name: "Română", machine: true },
  { code: "cs", name: "Čeština", machine: true },
  { code: "sv", name: "Svenska", machine: true },
  { code: "da", name: "Dansk", machine: true },
  { code: "fi", name: "Suomi", machine: true },
  { code: "nb", name: "Norsk bokmål", machine: true },
  { code: "zh-Hans", name: "简体中文", machine: true },
  { code: "zh-Hant", name: "繁體中文", machine: true },
  { code: "ja", name: "日本語", machine: true },
  { code: "ko", name: "한국어", machine: true },
  { code: "hi", name: "हिन्दी", machine: true },
  { code: "bn", name: "বাংলা", machine: true },
  { code: "vi", name: "Tiếng Việt", machine: true },
  { code: "th", name: "ไทย", machine: true },
  { code: "ru", name: "Русский", machine: true },
  { code: "uk", name: "Українська", machine: true },
  { code: "el", name: "Ελληνικά", machine: true },
  { code: "hu", name: "Magyar", machine: true },
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
