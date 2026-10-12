import Link from "next/link";
import { ChapterCards } from "@/components/ChapterCards";
import { DotField } from "@/components/DotField";
import { PlayerCard } from "@/components/PlayerCard";

export default function Home() {
  return (
    <>
      <section className="cover">
        <div className="cover-inner">
          <div>
            <div className="eyebrow" style={{ marginBottom: 12 }}>The LazyLab Playbook</div>
            <h1>
              Run GPU clusters
              <br />
              <span className="lime">like you built them.</span>
            </h1>
            <p>
              An interactive book on GPU cluster architecture, operations, optimization, monitoring, performance and security.
              Read a section, play with the live model, clear the checkpoint, then take on the boss: a broken cluster with a
              real terminal.
            </p>
            <DotField />
          </div>
          <PlayerCard />
        </div>
      </section>
      <section className="chapters">
        <div className="row" style={{ alignItems: "baseline", marginBottom: 14 }}>
          <h2 style={{ margin: 0 }}>Contents</h2>
          <span className="spacer" />
          <Link href="/lab/" className="muted">Or skip to free play in the Lab →</Link>
        </div>
        <ChapterCards />
      </section>
    </>
  );
}
