"use client";

import type { Simulation } from "@/sim/sim";
import type { Gpu } from "@/sim/types";
import { useLang } from "@/i18n/client";

export type TopoMode = "util" | "temp" | "power";

export interface GpuRef {
  node: string;
  gpu: number;
}

/** 0..1 magnitude for the selected metric. Sequential encoding: one hue, receding to the surface at zero. */
function magnitude(g: Gpu, mode: TopoMode, tdp: number): number {
  if (mode === "util") return g.util;
  if (mode === "power") return g.powerW / tdp;
  return Math.max(0, Math.min(1, (g.tempC - 28) / (92 - 28)));
}

function fill(mode: TopoMode, m: number): string {
  const hue = mode === "temp" ? "var(--series-2)" : "var(--series-1)";
  const pct = Math.round(8 + m * 92);
  return `color-mix(in oklab, ${hue} ${pct}%, var(--surface-3))`;
}

function label(g: Gpu, mode: TopoMode): string {
  if (mode === "util") return `${Math.round(g.util * 100)}`;
  if (mode === "power") return `${Math.round(g.powerW)}`;
  return `${Math.round(g.tempC)}°`;
}

export function Topology({
  sim,
  mode,
  selected,
  onSelect,
}: {
  sim: Simulation;
  mode: TopoMode;
  selected?: GpuRef | null;
  onSelect?: (r: GpuRef) => void;
}) {
  const { t } = useLang();
  const tdp = sim.gpuSpec.tdpW;
  const nv = sim.gpuSpec.nvlinkGBs > 0;
  return (
    <div className="topo" role="list" aria-label="Cluster nodes">
      {sim.state.nodes.map((n) => {
        const job = sim.isAllocated(n.name);
        return (
          <div key={n.name} className={`node${n.drained ? " drained" : ""}`} role="listitem">
            <div className="node-head">
              <span>{n.name}</span>
              <span className="badges">
                {n.drained && <span className="badge warn" title={n.drainReason}>DRAIN</span>}
                {!n.ibUp && <span className="badge crit" title="InfiniBand port down">IB↓</span>}
                {!n.nvlinkUp && <span className="badge crit" title="NVLink fault">NVL↓</span>}
              </span>
            </div>
            <div className="gpus">
              {n.gpus.map((g) => {
                const m = magnitude(g, mode, tdp);
                const sel = selected?.node === n.name && selected.gpu === g.index;
                const flag = g.resetRequired ? "⚠" : g.thermalLatched ? "▲" : "";
                return (
                  <button
                    key={g.index}
                    className={`gpu${g.lost ? " lost" : ""}${sel ? " sel" : ""}${m < 0.45 ? " light-ink" : ""}`}
                    style={g.lost ? undefined : { background: fill(mode, m), color: m < 0.45 ? "var(--text-2)" : "#fff" }}
                    title={`${n.name} GPU ${g.index}: ${g.lost ? "LOST (Xid 79)" : `${Math.round(g.util * 100)}% util, ${Math.round(g.tempC)}°C, ${Math.round(g.powerW)} W${g.thermalLatched ? ", THERMAL SLOWDOWN" : ""}`}`}
                    onClick={() => onSelect?.({ node: n.name, gpu: g.index })}
                    aria-label={`${n.name} GPU ${g.index}`}
                  >
                    {g.lost ? "✕" : label(g, mode)}
                    {flag && <span className="flag" aria-hidden style={{ color: g.resetRequired ? "var(--critical)" : "var(--serious)" }}>{flag}</span>}
                  </button>
                );
              })}
            </div>
            <div className={`nvswitch${nv && !n.nvlinkUp ? " down" : ""}`} title={nv ? (n.nvlinkUp ? "NVSwitch / NVLink healthy" : "NVLink fault") : "PCIe only (no NVLink)"} style={nv ? undefined : { opacity: 0.35 }} />
            <div className="job-tag">{job ? `job ${job.id} · ${job.name}${job.phase === "init" ? ` ${t("cluster.starting")}` : ""}` : n.drained ? n.drainReason : t("cluster.idle")}</div>
          </div>
        );
      })}
    </div>
  );
}

export function TopoLegend({ mode }: { mode: TopoMode }) {
  const { t } = useLang();
  const hue = mode === "temp" ? "var(--series-2)" : "var(--series-1)";
  const [lo, hi] = mode === "util" ? ["0%", "100% util"] : mode === "power" ? ["idle", "TDP"] : ["28°C", "92°C"];
  return (
    <span className="legend">
      {lo}
      <span className="ramp" style={{ background: `linear-gradient(90deg, color-mix(in oklab, ${hue} 8%, var(--surface-3)), ${hue})` }} />
      {hi}
      <span style={{ color: "var(--serious)", marginLeft: 6 }}>{t("cluster.throttled")}</span>
      <span style={{ color: "var(--critical)" }}>{t("cluster.lost")}</span>
    </span>
  );
}

export function GpuDetail({ sim, sel }: { sim: Simulation; sel: GpuRef }) {
  const n = sim.node(sel.node);
  const g = n?.gpus[sel.gpu];
  if (!n || !g) return null;
  const spec = sim.gpuSpec;
  const procs = n.procs.filter((p) => p.gpu === g.index);
  const job = sim.isAllocated(n.name);
  return (
    <div className="gpu-detail">
      <span>device</span>
      <span>
        {n.name} / GPU {g.index} ({spec.name})
      </span>
      <span>status</span>
      <span style={{ color: g.lost || g.resetRequired ? "var(--critical)" : g.thermalLatched ? "var(--serious)" : undefined }}>
        {g.lost ? "lost (Xid 79)" : g.resetRequired ? "ECC DBE: reset required" : g.thermalLatched ? "HW thermal slowdown" : g.throttle === "power" ? "power capped" : "ok"}
      </span>
      <span>util</span>
      <span>{Math.round(g.util * 100)}%</span>
      <span>SM clock</span>
      <span>{Math.round(spec.maxClockMHz * g.clockFactor)} MHz</span>
      <span>temp</span>
      <span>{Math.round(g.tempC)}°C</span>
      <span>power</span>
      <span>
        {Math.round(g.powerW)} / {Math.round(g.powerLimitW)} W
      </span>
      <span>memory</span>
      <span>
        {g.memUsedGB.toFixed(1)} / {spec.memGB} GB
      </span>
      <span>owner</span>
      <span>{job && g.index < job.gpusPerNode ? `job ${job.id} (${job.user})` : procs.length ? `pid ${procs[0].pid} (${procs[0].user}), no job` : "—"}</span>
    </div>
  );
}
