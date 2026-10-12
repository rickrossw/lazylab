import type { Metadata } from "next";
import { MISSIONS } from "@/missions";
import { MissionView } from "@/views/OtherViews";
import { missionMeta } from "@/views/meta";

export function generateStaticParams() {
  return MISSIONS.map((m) => ({ id: m.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  return missionMeta("en", (await params).id);
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <MissionView id={(await params).id} />;
}
