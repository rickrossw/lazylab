"use client";

import { useState } from "react";
import { FABRICS, GPUS, type FabricId, type GpuModelId } from "@/sim/hardware";
import { Simulation, type ScenarioSpec } from "@/sim/sim";
import type { FaultKind } from "@/sim/types";
import { jobScript } from "@/missions";
import { Console } from "./Console";
import { useSimulation } from "./useSimulation";

const FAULTS: { kind: FaultKind; label: string; what: string }[] = [
  { kind: "thermal", label: "Fan failure", what: "GPU overheats and engages HW thermal slowdown → straggler" },
  { kind: "xid79", label: "Xid 79", what: "GPU falls off the PCIe bus → jobs on it crash" },
  { kind: "ecc", label: "ECC DBE", what: "Uncorrectable memory error (Xid 48) → reset required" },
  { kind: "nvlink", label: "NVLink fault", what: "Xid 74, intra-node traffic falls back to PCIe" },
  { kind: "ib", label: "IB port down", what: "Multi-node collectives hang, then time out" },
  { kind: "miner", label: "Rogue process", what: "Something is using a GPU outside the scheduler" },
];

interface LabConfig {
  gpu: GpuModelId;
  nodes: number;
  fabric: FabricId;
}

function makeLab(cfg: LabConfig, seed: number): Simulation {
  const spec: ScenarioSpec = {
    seed,
    gpu: cfg.gpu,
    fabric: cfg.fabric,
    nodes: cfg.nodes,
    files: {
      "train.sh": jobScript({
        name: "llama7b",
        nodes: Math.min(2, cfg.nodes),
        args: "--model 7b --precision bf16 --micro-batch 2 --seq-len 4096 --grad-accum 4 --tp 1 --pp 1 --zero 1 --overlap --workers 8",
      }),
      "big.sh": jobScript({
        name: "llama70b",
        nodes: cfg.nodes,
        args: "--model 70b --precision bf16 --micro-batch 1 --seq-len 4096 --grad-accum 16 --tp 8 --pp 2 --zero 1 --overlap --workers 8",
      }),
      "README.md": [
        "# Welcome to the Lab",
        "",
        "Ideas to try:",
        "- sbatch train.sh, then watch the dashboards and `tail slurm-<id>.out`",
        "- nano train.sh and change --micro-batch, --tp, --zero, --ckpt ... then resubmit",
        "- break something with the fault buttons, then find it with nvidia-smi, dmesg, dcgmi diag",
        "- ssh node-1; sudo nvidia-smi -pl 450   (power capping)",
        "- all_reduce_perf -g 8 on an idle node (before and after an NVLink fault)",
        "",
      ].join("\n"),
    },
    submit: ["train.sh"],
  };
  return new Simulation(spec);
}

export function LabClient() {
  const [cfg, setCfg] = useState<LabConfig>({ gpu: "H100", nodes: 4, fabric: "IB-NDR" });
  const [draft, setDraft] = useState<LabConfig>(cfg);
  const [seed, setSeed] = useState(1);
  const ctl = useSimulation(() => makeLab(cfg, seed));
  const [faultNode, setFaultNode] = useState("node-1");
  const [faultGpu, setFaultGpu] = useState(0);
  const [log, setLog] = useState<string[]>([]);

  const rebuild = (next: LabConfig) => {
    setCfg(next);
    const s = seed + 1;
    setSeed(s);
    ctl.setSim(makeLab(next, s));
    setFaultNode("node-1");
    setLog([]);
  };

  const inject = (kind: FaultKind) => {
    ctl.sim.inject({ kind, node: faultNode, gpu: faultGpu });
    setLog((l) => [`t=${ctl.sim.state.t}s  ${kind} → ${faultNode}${["thermal", "xid79", "ecc", "miner", "nvlink"].includes(kind) ? ` gpu${faultGpu}` : ""}`, ...l].slice(0, 6));
    ctl.refresh();
  };

  const side = (
    <>
      <div className="panel">
        <div className="panel-head">
          <strong>Build</strong>
          <span className="muted">changes restart the lab</span>
        </div>
        <div className="panel-body">
          <div className="controls" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
            <div className="control">
              <label htmlFor="lab-gpu">GPU</label>
              <select id="lab-gpu" value={draft.gpu} onChange={(e) => setDraft({ ...draft, gpu: e.target.value as GpuModelId })}>
                {Object.values(GPUS).map((g) => (
                  <option key={g.id} value={g.id}>{g.id}</option>
                ))}
              </select>
            </div>
            <div className="control">
              <label htmlFor="lab-nodes">Nodes</label>
              <select id="lab-nodes" value={draft.nodes} onChange={(e) => setDraft({ ...draft, nodes: Number(e.target.value) })}>
                {[1, 2, 3, 4, 5, 6, 8].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            <div className="control">
              <label htmlFor="lab-fab">Network</label>
              <select id="lab-fab" value={draft.fabric} onChange={(e) => setDraft({ ...draft, fabric: e.target.value as FabricId })}>
                {Object.values(FABRICS).map((f) => (
                  <option key={f.id} value={f.id}>{f.id}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="row">
            <button className="btn small primary" onClick={() => rebuild(draft)}>Rebuild cluster</button>
            <button className="btn small" onClick={() => rebuild(cfg)}>Reset</button>
          </div>
        </div>
      </div>
      <div className="panel">
        <div className="panel-head">
          <strong>Chaos</strong>
          <span className="muted">inject a fault</span>
        </div>
        <div className="panel-body">
          <div className="controls" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div className="control">
              <label htmlFor="f-node">Node</label>
              <select id="f-node" value={faultNode} onChange={(e) => setFaultNode(e.target.value)}>
                {ctl.sim.state.nodes.map((n) => (
                  <option key={n.name}>{n.name}</option>
                ))}
              </select>
            </div>
            <div className="control">
              <label htmlFor="f-gpu">GPU</label>
              <select id="f-gpu" value={faultGpu} onChange={(e) => setFaultGpu(Number(e.target.value))}>
                {Array.from({ length: 8 }, (_, i) => (
                  <option key={i} value={i}>{i}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {FAULTS.map((f) => (
              <button key={f.kind} className="btn small" style={{ justifyContent: "center" }} title={f.what} onClick={() => inject(f.kind)}>
                {f.label}
              </button>
            ))}
          </div>
          {log.length > 0 && (
            <div className="mono muted" style={{ fontSize: 12, marginTop: 10 }}>
              {log.map((l, i) => (
                <div key={i}>{l}</div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );

  return (
    <Console
      ctl={ctl}
      side={side}
      welcome={[
        "LazyLab simulated cluster. Type `help` for commands, `cat README.md` for ideas.",
        "A 7B training job (train.sh) was submitted for you. Try: squeue, then tail slurm-101.out",
      ]}
      quick={["help", "squeue", "sinfo", "tail slurm-101.out", "ssh node-1", "nvidia-smi", "exit"]}
    />
  );
}
