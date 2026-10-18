import type { Metadata } from "next";
import { GlossaryView } from "@/views/OtherViews";
import { meta } from "@/views/meta";

export const metadata: Metadata = meta("en", "glossary");

export default function Page() {
  return <GlossaryView />;
}
