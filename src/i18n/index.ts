// Language plumbing. The site lives at one set of URLs; the chosen language is applied in place.

/** A language code from LANGUAGES (e.g. "en", "es", "pt-BR"). */
export type Lang = string;

/** Kept for links: paths are the same in every language. */
export function localize(_lang: Lang, path: string): string {
  return path;
}
