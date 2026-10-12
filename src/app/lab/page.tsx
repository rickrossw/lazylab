import type { Metadata } from "next";
import { LabView } from "@/views/OtherViews";
import { meta } from "@/views/meta";

export const metadata: Metadata = meta("en", "lab");

export default function Page() {
  return <LabView lang="en" />;
}
