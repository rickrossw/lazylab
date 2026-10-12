import type { Metadata } from "next";
import { MissionsView } from "@/views/OtherViews";
import { meta } from "@/views/meta";

export const metadata: Metadata = meta("es", "missions");

export default function Page() {
  return <MissionsView lang="es" />;
}
