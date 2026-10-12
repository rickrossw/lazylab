import type { Metadata } from "next";
import { ATLAS } from "@/content/atlas";
import { GlossaryEntryView } from "@/views/OtherViews";
import { entryMeta } from "@/views/meta";

export function generateStaticParams() {
  return ATLAS.map((e) => ({ slug: e.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return entryMeta("es", (await params).slug);
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  return <GlossaryEntryView lang="es" slug={(await params).slug} />;
}
