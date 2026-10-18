"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Dict } from "@/content/localized";
import { LANG_CODES, LANGUAGES, matchLanguage } from "./languages";
import { t as translate, type UIKey } from "./ui";

const STORE = "lazylab.lang";
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

interface LangState {
  /** "auto" or a language code. */
  choice: string;
  /** The language actually shown. */
  lang: string;
  dict: Dict;
  setChoice: (c: string) => void;
}

const Ctx = createContext<LangState>({ choice: "auto", lang: "en", dict: null, setChoice: () => {} });

function readChoice(): string {
  try {
    const q = new URLSearchParams(window.location.search).get("lang");
    if (q && LANG_CODES.includes(q)) {
      localStorage.setItem(STORE, q);
      return q;
    }
    const v = localStorage.getItem(STORE);
    if (v === "auto" || (v && LANG_CODES.includes(v))) return v;
  } catch {}
  return "auto";
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState("auto");
  const [lang, setLang] = useState("en");
  const [dict, setDict] = useState<Dict>(null);

  useEffect(() => {
    const c = readChoice();
    setChoiceState(c);
    setLang(c === "auto" ? matchLanguage(navigator.languages?.length ? navigator.languages : [navigator.language]) : c);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    if (lang === "en") {
      setDict(null);
      return;
    }
    let cancelled = false;
    fetch(`${BASE}/i18n/${lang}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => !cancelled && setDict(d))
      .catch(() => !cancelled && setDict(null));
    return () => {
      cancelled = true;
    };
  }, [lang]);

  const setChoice = (c: string) => {
    try {
      localStorage.setItem(STORE, c);
    } catch {}
    setChoiceState(c);
    setLang(c === "auto" ? matchLanguage(navigator.languages?.length ? navigator.languages : [navigator.language]) : c);
  };

  // Until a dictionary arrives, keep showing English rather than a half-translated page.
  const shown = lang !== "en" && !dict ? "en" : lang;
  return <Ctx.Provider value={{ choice, lang: shown, dict: shown === "en" ? null : dict, setChoice }}>{children}</Ctx.Provider>;
}

export function useLangState() {
  return useContext(Ctx);
}

/** Current language plus helpers: `t` for interface strings, `d` for content lookups. */
export function useLang() {
  const { lang, dict } = useContext(Ctx);
  return useMemo(
    () => ({
      lang,
      d: dict,
      machine: LANGUAGES.find((l) => l.code === lang)?.machine ?? false,
      t: (key: UIKey, vars?: Record<string, string | number>) => {
        let s = (dict && dict[`ui.${key}`]) || translate("en", key);
        if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
        return s;
      },
      L: (path: string) => path,
    }),
    [lang, dict],
  );
}
