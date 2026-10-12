import type { Metadata } from "next";
import { MissionsView } from "@/views/OtherViews";
import { meta } from "@/views/meta";

export const metadata: Metadata = meta("en", "missions");

export default function Page() {
  return <MissionsView lang="en" />;
}
