"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AccountButton } from "./Auth";
import { useLang, useLangState } from "@/i18n/client";
import { LANGUAGES } from "@/i18n/languages";
import type { UIKey } from "@/i18n/ui";

const LINKS: { href: string; key: UIKey }[] = [
  { href: "/", key: "nav.home.label" },
  { href: "/lab/", key: "nav.lab" },
  { href: "/missions/", key: "nav.missions" },
  { href: "/atlas/", key: "nav.glossary" },
];

function LanguageMenu() {
  const { choice, setChoice } = useLangState();
  const { t } = useLang();
  return (
    <label className="lang-menu" title={t("nav.lang")}>
      <span aria-hidden className="globe">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18" />
        </svg>
      </span>
      <span className="sr-only">{t("nav.lang")}</span>
      <select value={choice} onChange={(e) => setChoice(e.target.value)} aria-label={t("nav.lang")}>
        <option value="auto">{t("nav.auto")}</option>
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code} lang={l.code}>
            {l.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Nav() {
  const path = usePathname() ?? "/";
  const { t } = useLang();
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    const th = document.documentElement.dataset.theme;
    setTheme(th === "light" || th === "dark" ? th : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("lazylab.theme", next);
    } catch {}
    setTheme(next);
  };

  return (
    <header className="nav">
      <div className="container nav-inner">
        <Link href="/" className="brand" aria-label={t("nav.home")}>
          LazyLab
        </Link>
        <nav className="nav-links">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={(l.href === "/" ? path === "/" || path.startsWith("/play") : path.startsWith(l.href.replace(/\/$/, ""))) ? "active" : ""}>
              {t(l.key)}
            </Link>
          ))}
        </nav>
        <span className="spacer" />
        <AccountButton />
        <LanguageMenu />
        <button className="icon-btn" onClick={toggleTheme} aria-label={t("nav.theme")} title={t("nav.theme")}>
          {theme === "dark" ? "☀" : "☾"}
        </button>
      </div>
    </header>
  );
}

export function Footer() {
  const { t, machine } = useLang();
  return (
    <footer className="footer">
      <div className="container">
        {machine && <p style={{ marginBottom: 8, color: "var(--text-2)" }}>{t("mt.notice")}</p>}
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
