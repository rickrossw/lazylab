"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AccountButton } from "./Auth";
import { useLang } from "@/i18n/client";
import { basePathOf, localize, type Lang } from "@/i18n";
import type { UIKey } from "@/i18n/ui";

const LINKS: { href: string; key: UIKey }[] = [
  { href: "/", key: "nav.playbook" },
  { href: "/lab/", key: "nav.lab" },
  { href: "/missions/", key: "nav.missions" },
  { href: "/atlas/", key: "nav.glossary" },
];

const LANG_KEY = "lazylab.lang";

function savedLang(): Lang | null {
  try {
    const v = localStorage.getItem(LANG_KEY);
    return v === "en" || v === "es" ? v : null;
  } catch {
    return null;
  }
}

export function Nav() {
  const path = usePathname() ?? "/";
  const router = useRouter();
  const { lang, t, L } = useLang();
  const plain = basePathOf(path);
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    const th = document.documentElement.dataset.theme;
    setTheme(th === "light" || th === "dark" ? th : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  }, []);

  // Keep <html lang> in sync, and send visitors to their language: a saved choice wins,
  // otherwise a Spanish-language browser starts in Spanish.
  useEffect(() => {
    document.documentElement.lang = lang;
    let pref = savedLang();
    if (!pref && navigator.language?.toLowerCase().startsWith("es")) {
      pref = "es";
      try {
        localStorage.setItem(LANG_KEY, pref);
      } catch {}
    }
    if (pref === "es" && lang === "en") router.replace(localize("es", plain) + window.location.hash);
  }, [lang, plain, router]);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("lazylab.theme", next);
    } catch {}
    setTheme(next);
  };

  const other: Lang = lang === "en" ? "es" : "en";
  const switchLang = (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      localStorage.setItem(LANG_KEY, other);
    } catch {}
    router.push(localize(other, plain) + window.location.hash);
  };

  return (
    <header className="nav">
      <div className="container nav-inner">
        <Link href={L("/")} className="brand" aria-label={t("nav.home")}>
          LazyLab
        </Link>
        <nav className="nav-links">
          {LINKS.map((l) => (
            <Link key={l.href} href={L(l.href)} className={(l.href === "/" ? plain === "/" || plain.startsWith("/play") : plain.startsWith(l.href.replace(/\/$/, ""))) ? "active" : ""}>
              {t(l.key)}
            </Link>
          ))}
        </nav>
        <span className="spacer" />
        <AccountButton />
        <a href={localize(other, plain)} className="lang-btn" onClick={switchLang} aria-label={t("nav.lang")} title={t("nav.lang")} hrefLang={other} lang={other}>
          {other.toUpperCase()}
        </a>
        <button className="icon-btn" onClick={toggleTheme} aria-label={t("nav.theme")} title={t("nav.theme")}>
          {theme === "dark" ? "☀" : "☾"}
        </button>
      </div>
    </header>
  );
}

export function Footer() {
  const { t } = useLang();
  return (
    <footer className="footer">
      <div className="container">
        <p style={{ marginBottom: 8 }}>{t("footer.about")}</p>
        <div className="row" style={{ gap: 18 }}>
          <span>{t("footer.shoulders")}</span>
          <a href="https://prace-ri.eu/wp-content/uploads/Best-Practice-Guide_GPGPU.pdf">PRACE GPGPU guide</a>
          <a href="https://ttsugriy.github.io/distributed-training-book/">Distributed Training book</a>
          <a href="https://modal.com/gpu-glossary">Modal GPU Glossary</a>
          <a href="https://github.com/NVIDIA/grcuda">grCUDA</a>
          <a href="https://github.com/NVIDIA/open-gpu-kernel-modules">open-gpu-kernel-modules</a>
        </div>
      </div>
    </footer>
  );
}
