import { ATLAS } from "@/content/atlas";
import { CHAPTERS } from "@/content/chapters";
import { MISSIONS } from "@/missions";
import { LegacyLang } from "@/components/LegacyLang";

// Old /es/... links (from before the language picker) keep working: they switch to Spanish and
// redirect to the same page at its normal address.
export function generateStaticParams() {
  return [
    { path: [] },
    { path: ["lab"] },
    { path: ["missions"] },
    { path: ["atlas"] },
    ...CHAPTERS.map((c) => ({ path: ["play", c.track] })),
    ...MISSIONS.map((m) => ({ path: ["missions", m.id] })),
    ...ATLAS.map((e) => ({ path: ["atlas", e.slug] })),
  ];
}

export default async function Page({ params }: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await params;
  return <LegacyLang code="es" to={`/${path.join("/")}${path.length ? "/" : ""}`} />;
}
