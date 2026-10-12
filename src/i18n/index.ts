// Locale routing: English lives at the root, Spanish under /es/.

export type Lang = "en" | "es";
export const LANGS: Lang[] = ["en", "es"];

export function langFromPath(path: string | null | undefined): Lang {
  return path && /^\/es(\/|$)/.test(path) ? "es" : "en";
}

/** Strips the /es prefix from a path. */
export function basePathOf(path: string): string {
  return path.replace(/^\/es(?=\/|$)/, "") || "/";
}

/** Returns `path` (an English-site path like "/play/running/") in the given language. */
export function localize(lang: Lang, path: string): string {
  if (lang === "en" || !path.startsWith("/")) return path;
  return path === "/" ? "/es/" : `/es${path}`;
}
