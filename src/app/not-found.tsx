"use client";

import Link from "next/link";
import { useLang } from "@/i18n/client";

export default function NotFound() {
  const { t, L } = useLang();
  return (
    <div className="container narrow" style={{ padding: "80px 20px" }}>
      <div className="eyebrow">{t("404.eyebrow")}</div>
      <h1>{t("404.title")}</h1>
      <p className="muted">{t("404.body")}</p>
      <Link href={L("/")} className="btn primary">{t("404.home")}</Link>
    </div>
  );
}
