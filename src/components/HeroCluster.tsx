"use client";

import { useEffect } from "react";
import { Simulation } from "@/sim/sim";
import { jobScript } from "@/missions";
import { Topology } from "./Topology";
import { TimeChart } from "./Charts";
import { useSimulation } from "./useSimulation";

const ARGS = "--model 7b --precision bf16 --micro-batch 2 --grad-accum 4 --zero 1 --overlap --workers 8";

function demo() {
  return new Simulation({
    seed: 7,
    gpu: "H100",
    fabric: "IB-NDR",
    nodes: 4,
    files: {
      "a.sh": jobScript({ name: "llama7b", nodes: 2, args: ARGS }),
      "b.sh": jobScript({ name: "vision", nodes: 2, args: ARGS }),
    },
    submit: ["a.sh", "b.sh"],
    faults: [{ t: 45, fault: { kind: "thermal", node: "node-4", gpu: 2 } }],
    warmup: 12,
  });
}

/** A self-running demo cluster for the landing page: two jobs, then a fan fails and a straggler appears. */
export function HeroCluster() {
  const ctl = useSimulation(demo);
  const { sim } = ctl;
  useEffect(() => {
    if (sim.state.t > 150) ctl.reset();
  }, [sim.state.t, ctl]);
  const job = sim.job(102);
  const lastLog = job?.log.filter((l) => l.includes("step")).slice(-1)[0] ?? "starting…";
  const alert = sim.state.alerts.find((a) => a.active);
  return (
    <div className="panel" style={{ boxShadow: "var(--shadow)" }} aria-label="Live simulated cluster demo">
      <div className="panel-head">
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--good)", display: "inline-block" }} aria-hidden />
        <strong>live sim</strong>
        <span className="muted mono">4 × 8 H100 · InfiniBand</span>
        <span className="spacer" />
        <span className="mono muted">t={sim.state.t}s</span>
      </div>
      <div className="panel-body">
        <Topology sim={sim} mode="util" />
        <div style={{ marginTop: 12 }}>
          <div className="metric-head">
            <span>Cluster throughput</span>
            <span className="v tnum">{((sim.state.history.at(-1)?.tokensPerSec ?? 0) / 1000).toFixed(0)}k tok/s</span>
          </div>
          <TimeChart points={sim.state.history.map((h) => ({ x: h.t, y: h.tokensPerSec }))} format={(v) => `${(v / 1000).toFixed(0)}k tok/s`} label="Cluster throughput" height={48} />
        </div>
        <div className="mono" style={{ fontSize: 11.5, marginTop: 10, color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          job 102 › {lastLog.replace("[rank0] ", "")}
        </div>
        <div className="mono" style={{ fontSize: 11.5, marginTop: 4, minHeight: 17, color: alert ? "var(--serious)" : "var(--muted)" }}>
          {alert ? `▲ ${alert.rule} ${alert.target}: can you spot the straggler?` : "all systems nominal"}
        </div>
      </div>
    </div>
  );
}
