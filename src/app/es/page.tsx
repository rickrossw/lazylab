import type { Metadata } from "next";
import { HomeView } from "@/views/HomeView";
import { meta } from "@/views/meta";

export const metadata: Metadata = meta("es", "home");

export default function Page() {
  return <HomeView lang="es" />;
}
