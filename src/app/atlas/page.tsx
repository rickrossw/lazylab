import type { Metadata } from "next";
import { ATLAS, CATEGORIES } from "@/content/atlas";
import { AtlasSearch } from "@/components/AtlasClient";

export const metadata: Metadata = {
  title: "Atlas",
  description: "A cross-linked field guide to GPU clusters: hardware, interconnects, the CUDA stack, parallelism, performance, operations, security and responsible compute.",
};

export default function AtlasIndex() {
  return (
    <div className="container" style={{ padding: "36px 20px" }}>
      <div className="eyebrow">Reference</div>
      <h1 style={{ fontSize: "2.4rem" }}>The Atlas</h1>
      <p className="muted" style={{ fontSize: 18, maxWidth: "40em" }}>
        A field guide to GPU clusters, from a single warp to a thousand-GPU training run. Every concept is cross-linked, many have a
        live widget, and each points to the missions where you'll use it.
      </p>
      <div style={{ marginTop: 22 }}>
        <AtlasSearch items={ATLAS.map(({ slug, title, summary, category }) => ({ slug, title, summary, category }))} categories={[...CATEGORIES]} />
      </div>
    </div>
  );
}
