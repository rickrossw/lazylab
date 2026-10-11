import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MISSIONS, getMission } from "@/missions";
import { MissionRunner } from "@/components/MissionRunner";

export function generateStaticParams() {
  return MISSIONS.map((m) => ({ id: m.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const m = getMission((await params).id);
  return m ? { title: `${m.title} — Mission`, description: m.tagline } : {};
}

export default async function MissionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!getMission(id)) notFound();
  return (
    <div className="container" style={{ padding: "24px 20px" }}>
      <MissionRunner id={id} />
    </div>
  );
}
