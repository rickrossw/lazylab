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

function LanguageToggle() {
  const { lang, setChoice } = useLangState();
  const other = lang === "es" ? LANGUAGES[0] : LANGUAGES[1];
  return (
    <button className="lang-btn" onClick={() => setChoice(other.code)} lang={other.code} title={other.name} aria-label={other.name}>
      {other.code.toUpperCase()}
    </button>
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
        <LanguageToggle />
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
