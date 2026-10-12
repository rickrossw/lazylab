"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AccountButton } from "./Auth";

const LINKS = [
  { href: "/", label: "Playbook" },
  { href: "/lab/", label: "Lab" },
  { href: "/missions/", label: "Missions" },
  { href: "/atlas/", label: "Glossary" },
];

export function Nav() {
  const path = usePathname() ?? "/";
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    const t = document.documentElement.dataset.theme;
    setTheme(t === "light" || t === "dark" ? t : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  }, []);

  const toggle = () => {
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
        <Link href="/" className="brand" aria-label="LazyLab home">
          LazyLab
        </Link>
        <nav className="nav-links">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={(l.href === "/" ? path === "/" : path.startsWith(l.href.replace(/\/$/, ""))) ? "active" : ""}>
              {l.label}
            </Link>
          ))}
        </nav>
        <span className="spacer" />
        <AccountButton />
        <button className="icon-btn" onClick={toggle} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} title="Toggle theme">
          {theme === "dark" ? "☀" : "☾"}
        </button>
      </div>
    </header>
  );
}
