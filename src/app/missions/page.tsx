import type { Metadata } from "next";
import { MISSIONS, TRACKS } from "@/missions";
import { MissionCards } from "@/components/MissionCards";

export const metadata: Metadata = {
  title: "Missions",
  description: "Hands-on GPU cluster challenges: fix multi-node jobs, chase Xid errors, find stragglers, tune MFU, cap power, respond to a cryptojacking incident and design a pod.",
};

export default function MissionsPage() {
  return (
    <div className="container" style={{ padding: "36px 20px" }}>
      <div className="eyebrow">Prove it</div>
      <h1 style={{ fontSize: "2.4rem" }}>Missions</h1>
      <p className="muted" style={{ fontSize: 18, maxWidth: "42em" }}>
        Each mission drops you into a simulated cluster with a real-world problem, a terminal and live dashboards. Objectives
        check themselves. Scores reward speed and fewer hints, and every run reports its energy, cost and carbon.
      </p>
      <div className="row" style={{ margin: "14px 0 24px" }}>
        {Object.values(TRACKS).map((t) => (
          <span key={t.name} className="chip" title={t.blurb}>
            <span className="dot" style={{ background: t.color }} />
            {t.name}
          </span>
        ))}
      </div>
      <MissionCards missions={MISSIONS.map(({ id, title, track, difficulty, tagline, kind }) => ({ id, title, track, difficulty, tagline, kind }))} />
    </div>
  );
}
