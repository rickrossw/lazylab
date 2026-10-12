"use client";

import { usePathname } from "next/navigation";
import { langFromPath, localize, type Lang } from "./index";
import { t as translate, type UIKey } from "./ui";

/** Language of the current page (from the /es prefix) plus helpers bound to it. */
export function useLang() {
  const lang: Lang = langFromPath(usePathname());
  return {
    lang,
    t: (key: UIKey, vars?: Record<string, string | number>) => translate(lang, key, vars),
    L: (path: string) => localize(lang, path),
  };
}
