import Link from "next/link";
import { HeroCluster } from "@/components/HeroCluster";
import { MissionCards } from "@/components/MissionCards";
import { ATLAS } from "@/content/atlas";
import { MISSIONS, TRACKS } from "@/missions";

const STEPS = [
  { n: "01", title: "Read", body: "The Atlas explains each concept in plain language, from warps and HBM to ZeRO, Xid errors and power capping, with live widgets you can poke." },
  { n: "02", title: "Play", body: "The Lab is a whole simulated GPU cluster in your browser. Submit Slurm jobs, run nvidia-smi and dcgmi, pull cables, melt fans." },
  { n: "03", title: "Prove", body: "Missions drop you into realistic incidents with objectives that check themselves. Every run reports its energy, cost and carbon." },
];

export default function Home() {
  return (
    <>
      <div className="container">
        <section className="hero">
          <div>
            <div className="eyebrow" style={{ marginBottom: 14 }}>Free · in your browser · no GPUs harmed</div>
            <h1>
              Learn GPU clusters
              <br />
              by <span className="hl">breaking them.</span>
            </h1>
            <p className="lede">
              LazyLab is an interactive playground for the people who build, run, tune and secure GPU clusters.
              Real commands, realistic failures and honest performance models, all in a simulator that boots in a second.
            </p>
            <div className="row" style={{ marginTop: 22 }}>
              <Link href={`/missions/${MISSIONS[0].id}/`} className="btn primary">Start mission 1 →</Link>
              <Link href="/lab/" className="btn">Open the Lab</Link>
              <Link href="/atlas/" className="btn">Browse the Atlas</Link>
            </div>
            <p className="muted" style={{ fontSize: 14, marginTop: 18 }}>
              {ATLAS.length} concepts · {MISSIONS.length} missions · 6 tracks · ~40 shell commands
            </p>
          </div>
          <HeroCluster />
        </section>

        <section className="section">
          <div className="steps">
            {STEPS.map((s) => (
              <div key={s.n} className="card">
                <div className="step-num">{s.n}</div>
                <h3 style={{ fontSize: "1.4rem", margin: "4px 0 8px" }}>{s.title}</h3>
                <p className="muted" style={{ margin: 0 }}>{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="section">
          <h2>Six tracks, one cluster</h2>
          <p className="muted" style={{ maxWidth: "44em" }}>
            Running a GPU fleet responsibly means thinking about all of it at once: the hardware, the scheduler, the math, the
            telemetry, the attack surface and the power bill.
          </p>
          <div className="grid grid-3" style={{ marginTop: 16 }}>
            {Object.entries(TRACKS).map(([id, t]) => (
              <div key={id} className="card track-card" style={{ ["--track" as string]: t.color }}>
                <h3>{t.name}</h3>
                <p className="muted" style={{ margin: 0, fontSize: 15 }}>{t.blurb}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="section">
          <div className="row" style={{ alignItems: "baseline" }}>
            <h2>Missions</h2>
            <span className="spacer" />
            <Link href="/missions/" className="muted">All missions →</Link>
          </div>
          <MissionCards missions={MISSIONS.map(({ id, title, track, difficulty, tagline, kind }) => ({ id, title, track, difficulty, tagline, kind }))} />
        </section>

        <section className="section">
          <div className="card" style={{ padding: 26 }}>
            <h2 style={{ marginBottom: 8 }}>Responsible by default</h2>
            <p className="muted" style={{ maxWidth: "52em", marginBottom: 0 }}>
              Every simulated run tracks kWh, dollars and CO₂e alongside throughput. Security missions are defensive: you
              detect, contain and harden, on a simulated cluster with no real targets. And the Atlas is written in our own
              words with citations to the primary sources: the PRACE GPGPU best-practice guide, the Distributed Training book,
              Modal&apos;s GPU Glossary, NVIDIA&apos;s open GPU kernel modules, grCUDA and the papers behind ZeRO, Megatron and MFU.
            </p>
          </div>
        </section>
      </div>
    </>
  );
}
