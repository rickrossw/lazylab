import type { Metadata } from "next";
import { getChapter } from "@/content/chapters";
import { chapterText, entryText, missionText } from "@/content/localized";
import { getMission } from "@/missions";
type Lang = "en" | "es";

const PAGES = {
  home: {
    en: ["LazyLab — learn to run GPU clusters", "Learn GPU cluster architecture, operations, optimization, monitoring, performance and security by playing with a live simulated cluster."],
    es: ["LazyLab — aprende a operar clústeres de GPU", "Aprende arquitectura, operación, optimización, monitoreo, rendimiento y seguridad de clústeres de GPU jugando con un clúster simulado en vivo."],
    path: "/",
  },
  lab: {
    en: ["Lab", "A free-play simulated GPU cluster: submit Slurm jobs, inspect GPUs with nvidia-smi and DCGM, inject faults and watch what breaks."],
    es: ["Lab", "Un clúster de GPU simulado para jugar libremente: envía trabajos de Slurm, inspecciona GPUs con nvidia-smi y DCGM, inyecta fallas y mira qué se rompe."],
    path: "/lab/",
  },
  missions: {
    en: ["Missions", "Hands-on GPU cluster challenges: broken jobs, Xid errors, stragglers, MFU tuning, power capping, incident response and pod design."],
    es: ["Misiones", "Desafíos prácticos de clústeres de GPU: trabajos rotos, errores Xid, stragglers, ajuste de MFU, límites de potencia, respuesta a incidentes y diseño de pods."],
    path: "/missions/",
  },
  glossary: {
    en: ["Glossary", "Every GPU cluster concept from LazyLab as a cross-linked reference page."],
    es: ["Glosario", "Cada concepto de clústeres de GPU de LazyLab como página de referencia con enlaces cruzados."],
    path: "/atlas/",
  },
} as const;

function withAlternates(lang: Lang, path: string, title: string, description: string, absoluteTitle = false): Metadata {
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path, images: ["/og.png"] },
  };
}

export function meta(lang: Lang, page: keyof typeof PAGES): Metadata {
  const p = PAGES[page];
  const [title, description] = p[lang];
  return withAlternates(lang, p.path, title, description, page === "home");
}

export function chapterMeta(lang: Lang, track: string): Metadata {
  const c = getChapter(track);
  if (!c) return {};
  const tx = chapterText(c, null);
  return withAlternates(lang, `/play/${track}/`, `${tx.n}. ${tx.title}`, tx.kicker);
}

export function missionMeta(lang: Lang, id: string): Metadata {
  const m = getMission(id);
  if (!m) return {};
  const tx = missionText(m, null);
  return withAlternates(lang, `/missions/${id}/`, tx.title, tx.tagline);
}

export function entryMeta(lang: Lang, slug: string): Metadata {
  const tx = entryText(slug, null);
  return tx ? withAlternates(lang, `/atlas/${slug}/`, tx.title, tx.summary) : {};
}
