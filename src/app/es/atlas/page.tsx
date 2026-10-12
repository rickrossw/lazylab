import type { Metadata } from "next";
import { GlossaryView } from "@/views/OtherViews";
import { meta } from "@/views/meta";

export const metadata: Metadata = meta("es", "glossary");

export default function Page() {
  return <GlossaryView lang="es" />;
}
