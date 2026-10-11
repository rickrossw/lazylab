import type { TrackId } from "@/missions";
import { HARDWARE } from "./atlas-hardware";
import { OPS } from "./atlas-ops";
import { PARALLELISM } from "./atlas-parallelism";
import { SOFTWARE } from "./atlas-software";
import type { SourceId } from "./sources";

export type WidgetId = "roofline" | "memory" | "allreduce" | "mig" | "scaling" | "power";

export const CATEGORIES = [
  "Hardware",
  "Interconnect",
  "Software stack",
  "Parallelism",
  "Performance",
  "Operations",
  "Security",
  "Responsible compute",
] as const;
export type AtlasCategory = (typeof CATEGORIES)[number];

export interface AtlasEntry {
  slug: string;
  title: string;
  category: AtlasCategory;
  summary: string;
  /** Markdown; [[slug]] or [[slug|label]] links to other entries. */
  body: string;
  widget?: WidgetId;
  related: string[];
  sources: SourceId[];
  track: TrackId;
}

export const ATLAS: AtlasEntry[] = [...HARDWARE, ...SOFTWARE, ...PARALLELISM, ...OPS];

const BY_SLUG = new Map(ATLAS.map((e) => [e.slug, e]));

export function getEntry(slug: string): AtlasEntry | undefined {
  return BY_SLUG.get(slug);
}

export function atlasTitle(slug: string): string | undefined {
  return BY_SLUG.get(slug)?.title;
}

export function byCategory(): { category: AtlasCategory; entries: AtlasEntry[] }[] {
  return CATEGORIES.map((category) => ({ category, entries: ATLAS.filter((e) => e.category === category) })).filter((g) => g.entries.length);
}
