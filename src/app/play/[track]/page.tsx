import type { Metadata } from "next";
import { CHAPTERS } from "@/content/chapters";
import { ChapterView } from "@/views/ChapterView";
import { chapterMeta } from "@/views/meta";

export function generateStaticParams() {
  return CHAPTERS.map((c) => ({ track: c.track }));
}

export async function generateMetadata({ params }: { params: Promise<{ track: string }> }): Promise<Metadata> {
  return chapterMeta("en", (await params).track);
}

export default async function Page({ params }: { params: Promise<{ track: string }> }) {
  return <ChapterView track={(await params).track} />;
}
