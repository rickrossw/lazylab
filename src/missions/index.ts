// Mission catalog. Each terminal mission is a deterministic scenario + objectives over sim state.
// `solution` is the golden action log CI replays to prove every mission is winnable.

import { Simulation, type ScenarioSpec } from "@/sim/sim";
import type { Design, DesignResult, Workload } from "@/sim/designer";

export type TrackId = "architecture" | "running" | "optimization" | "monitoring" | "performance" | "security";

export const TRACKS: Record<TrackId, { name: string; blurb: string; color: string }> = {
  architecture: { name: "Architecture", blurb: "GPUs, interconnects, topologies and the trade-offs between them.", color: "var(--c-arch)" },
  running: { name: "Running", blurb: "Schedulers, batch jobs, containers and the CUDA stack.", color: "var(--c-run)" },
  optimization: { name: "Optimization", blurb: "Parallelism, memory, precision and keeping tensor cores fed.", color: "var(--c-opt)" },
  monitoring: { name: "Monitoring", blurb: "Telemetry, Xid errors, health checks and finding the broken thing.", color: "var(--c-mon)" },
  performance: { name: "Performance", blurb: "Scaling, bandwidth, power and doing more work per joule.", color: "var(--c-perf)" },
  security: { name: "Security", blurb: "Multi-tenant isolation, exposed services and incident response.", color: "var(--c-sec)" },
};

export interface Objective<Ctx> {
  id: string;
  text: string;
  check: (ctx: Ctx) => boolean;
}

interface MissionBase {
  id: string;
  title: string;
  track: TrackId;
  difficulty: 1 | 2 | 3;
  tagline: string;
  briefing: string;
  hints: string[];
  debrief: string;
  atlas: string[];
}

export interface TerminalMission extends MissionBase {
  kind: "terminal";
  scenario: ScenarioSpec;
  objectives: Objective<Simulation>[];
  /** Sim seconds a good run takes; used for the speed part of the score. */
  parSeconds: number;
  /** Golden solution: commands/file writes, each optionally preceded by `wait` sim seconds. */
  solution: { wait?: number; cmd?: string; write?: { path: string; content: string } }[];
  /** Captures values at mission start (e.g. baseline throughput) for objectives to compare against. */
  baseline?: (sim: Simulation) => Record<string, number>;
}

export interface DesignerMission extends MissionBase {
  kind: "designer";
  workload: Workload;
  limits: { capexUsd: number; facilityKW: number; days: number };
  initial: Design;
  objectives: Objective<{ design: Design; result: DesignResult }>[];
  solution: Design;
}

export type Mission = TerminalMission | DesignerMission;

// ------------------------------------------------------------------ helpers

interface ScriptOpts {
  name: string;
  partition?: string;
  nodes: number;
  gpusPerNode?: number;
  env?: string[];
  args: string;
  comment?: string;
}

export function jobScript(o: ScriptOpts): string {
  return [
    "#!/bin/bash",
    ...(o.comment ? [`# ${o.comment}`] : []),
    `#SBATCH --job-name=${o.name}`,
    `#SBATCH --partition=${o.partition ?? "gpu"}`,
    `#SBATCH --nodes=${o.nodes}`,
    `#SBATCH --gpus-per-node=${o.gpusPerNode ?? 8}`,
    "#SBATCH --time=24:00:00",
    "",
    ...(o.env ?? []).map((e) => `export ${e}`),
    ...(o.env?.length ? [""] : []),
    `srun torchrun --nnodes=${o.nodes} --nproc-per-node=${o.gpusPerNode ?? 8} train.py \\`,
    `  ${o.args}`,
    "",
  ].join("\n");
}

const TUNED_7B = "--model 7b --precision bf16 --micro-batch 2 --seq-len 4096 --grad-accum 4 --tp 1 --pp 1 --zero 1 --overlap --workers 8";

const README = (lines: string[]) => ["# Mission notes", "", ...lines, "", 'Type "help" for the commands this cluster understands.', ""].join("\n");

const runningTrain = (sim: Simulation) => sim.state.jobs.filter((j) => j.state === "RUNNING" && j.phase === "train" && j.estimate);

// ------------------------------------------------------------------ missions

const firstMultinode: TerminalMission = {
  id: "first-multinode",
  title: "Two Nodes, One Job",
  track: "running",
  difficulty: 1,
  tagline: "Your first multi-node training job won't even submit. Fix the batch script.",
  kind: "terminal",
  briefing: `A researcher left you **train.sh**: a 7B training run that should use **2 nodes × 8 H100s**. They say "it just errors out." Get it running across both nodes, and make sure the nodes talk over **InfiniBand**, not the slow management Ethernet.

Useful commands: \`cat train.sh\`, \`nano train.sh\`, \`sinfo\`, \`sbatch train.sh\`, \`squeue\`, \`cat slurm-<jobid>.out\`.`,
  scenario: {
    seed: 11,
    gpu: "H100",
    fabric: "IB-NDR",
    nodes: 4,
    files: {
      "train.sh": jobScript({
        name: "llama7b",
        partition: "gpu-large",
        nodes: 2,
        gpusPerNode: 16,
        env: ["NCCL_IB_DISABLE=1   # copied from a laptop debugging session", "NCCL_DEBUG=INFO"],
        args: TUNED_7B,
      }),
      "README.md": README(["- The cluster has one partition. Find its name with `sinfo`.", "- Each node has 8 GPUs."]),
    },
  },
  objectives: [
    {
      id: "running",
      text: "A training job is running on 2 nodes × 8 GPUs",
      check: (sim) => runningTrain(sim).some((j) => j.nodesReq === 2 && j.gpusPerNode === 8),
    },
    {
      id: "ib",
      text: "Inter-node traffic uses InfiniBand (≥ 200k tokens/s)",
      check: (sim) => runningTrain(sim).some((j) => j.nodesReq === 2 && j.env.NCCL_IB_DISABLE !== "1" && (j.estimate?.tokensPerSec ?? 0) >= 200_000),
    },
  ],
  parSeconds: 180,
  hints: [
    "Run `sbatch train.sh` and read the error carefully. Then run `sinfo` to see which partitions really exist.",
    "Each node has 8 GPUs, so `--gpus-per-node=16` can never be satisfied. Edit with `nano train.sh`, then Ctrl+S to save.",
    "Once it runs, `cat slurm-<id>.out` shows `NET/Socket`: NCCL is using TCP because `NCCL_IB_DISABLE=1`. Delete that line, `scancel` the job and resubmit.",
  ],
  debrief: `**What you fixed**

1. **Partition**: Slurm rejects unknown partitions at submit time. \`sinfo\` is the source of truth.
2. **GPUs per node**: \`--gpus-per-node\` is *per node*. To get 16 GPUs, ask for 2 nodes × 8. Slurm refuses requests no node can ever satisfy ("Requested node configuration is not available").
3. **Transport**: with \`NCCL_IB_DISABLE=1\`, NCCL falls back to TCP sockets (~3 GB/s here) instead of RDMA over InfiniBand (~48 GB/s per GPU). The job "works" but runs at a quarter of its speed. The tell is in the NCCL INFO lines of the job log.

**Ops habit**: when a job runs but is slow, read the NCCL transport lines before tuning anything else.`,
  atlas: ["slurm", "nccl", "infiniband", "data-parallelism"],
  solution: [
    { cmd: "cat train.sh" },
    { cmd: "sinfo" },
    {
      write: {
        path: "train.sh",
        content: jobScript({ name: "llama7b", nodes: 2, env: ["NCCL_DEBUG=INFO"], args: TUNED_7B }),
      },
    },
    { cmd: "sbatch train.sh" },
    { wait: 15 },
  ],
};

const fallenOffBus: TerminalMission = {
  id: "fallen-off-bus",
  title: "Fallen Off the Bus",
  track: "monitoring",
  difficulty: 1,
  tagline: "A training job died overnight. Find the bad GPU, quarantine the node and get the run going again.",
  kind: "terminal",
  briefing: `Job **101** (a 7B run on 2 nodes) failed a few minutes ago and its owner is asking why. Your job:

- figure out **which node and GPU** killed it,
- **drain** that node so the scheduler stops placing work there,
- get the training job **running again** on healthy nodes.

Start with \`sacct\`, the job log (\`cat slurm-101.out\`) and the node's kernel log (\`ssh <node>\` then \`dmesg\`).`,
  scenario: {
    seed: 23,
    gpu: "H100",
    fabric: "IB-NDR",
    nodes: 4,
    files: {
      "train.sh": jobScript({ name: "llama7b", nodes: 2, args: TUNED_7B }),
      "README.md": README(["- Xid errors are how the NVIDIA driver reports GPU faults. They show up in `dmesg`.", "- Draining needs a reason: `scontrol update NodeName=<node> State=DRAIN Reason=\"...\"`"]),
    },
    submit: ["train.sh"],
    faults: [{ t: 40, fault: { kind: "xid79", node: "node-2", gpu: 6 } }],
    warmup: 60,
  },
  objectives: [
    { id: "drain", text: "node-2 is drained (with a reason)", check: (sim) => !!sim.node("node-2")?.drained },
    {
      id: "running",
      text: "The 7B job is training again on 2 healthy nodes",
      check: (sim) => runningTrain(sim).some((j) => j.nodesReq === 2 && !j.nodes.includes("node-2")),
    },
  ],
  parSeconds: 150,
  hints: [
    "`sacct` shows job 101 FAILED. The log `cat slurm-101.out` says a CUDA error on node-2.",
    "On node-2, run `dmesg | grep Xid`. Xid 79 means the GPU fell off the PCIe bus. Only a reboot or hardware swap fixes it.",
    "From the login node: `scontrol update NodeName=node-2 State=DRAIN Reason=\"Xid 79 gpu6\"`, then `sbatch train.sh` (or `scontrol requeue 101`).",
  ],
  debrief: `**Xid 79: "GPU has fallen off the bus"** means the driver can no longer reach the GPU over PCIe. Causes include power, thermal or physical connection problems. Software can't fix it: the node needs a reboot at minimum, and often an RMA.

**The playbook you just ran**
1. *Triage from the scheduler*: \`sacct\` / the job log tells you *which* node.
2. *Confirm at the source*: \`dmesg\` holds the driver's Xid messages. The open-source NVIDIA kernel modules (open-gpu-kernel-modules) are where these are emitted.
3. *Contain*: **drain** the node (running jobs finish, new ones avoid it) with a reason the hardware team can read later in \`sinfo -R\`.
4. *Recover*: resubmit or requeue. The job resumes from its last checkpoint, so frequent checkpoints shrink the blast radius.`,
  atlas: ["xid-errors", "nvidia-smi", "slurm", "checkpointing"],
  solution: [
    { cmd: "sacct" },
    { cmd: "ssh node-2" },
    { cmd: "dmesg | grep Xid" },
    { cmd: "exit" },
    { cmd: 'scontrol update NodeName=node-2 State=DRAIN Reason="Xid 79 gpu6"' },
    { cmd: "sbatch train.sh" },
    { wait: 12 },
  ],
};

const straggler: TerminalMission = {
  id: "straggler",
  title: "The Slow Lane",
  track: "monitoring",
  difficulty: 2,
  tagline: "Throughput just halved across 32 GPUs, but nothing failed. Find the straggler.",
  kind: "terminal",
  briefing: `A 7B run is training on **4 nodes (32 H100s)**, and **node-5** is idle as a spare. A few minutes ago tokens/s dropped by ~45%. No errors in the job log. Nothing crashed.

In synchronous data-parallel training, every step waits for the **slowest GPU**. Find it, take its node out of rotation and get MFU back above **60%**.

Tools: the dashboards on the right, \`nvidia-smi\`, \`nvidia-smi -q -d PERFORMANCE\`, \`--query-gpu=index,temperature.gpu,clocks.sm\`, \`scontrol\`.`,
  scenario: {
    seed: 37,
    gpu: "H100",
    fabric: "IB-NDR",
    nodes: 5,
    files: {
      "train.sh": jobScript({ name: "llama7b", nodes: 4, args: TUNED_7B }),
      "README.md": README(["- Healthy H100s under load sit around 75–80°C at ~1980 MHz.", "- `scontrol requeue <jobid>` restarts a job from its last checkpoint on fresh nodes."]),
    },
    submit: ["train.sh"],
    faults: [{ t: 50, fault: { kind: "thermal", node: "node-3", gpu: 5 } }],
    warmup: 90,
  },
  objectives: [
    { id: "drain", text: "The node with the throttling GPU is drained", check: (sim) => !!sim.node("node-3")?.drained },
    {
      id: "mfu",
      text: "The training job is back above 60% MFU on healthy nodes",
      check: (sim) => runningTrain(sim).some((j) => !j.nodes.includes("node-3") && (j.estimate?.mfu ?? 0) >= 0.6),
    },
  ],
  parSeconds: 240,
  hints: [
    "Look at the topology view: one GPU is hotter than the rest. Or check each node with `pdsh -w node-[1-4] nvidia-smi --query-gpu=index,temperature.gpu,clocks.sm --format=csv`.",
    "On node-3, `nvidia-smi -q -d PERFORMANCE -i 5` shows `HW Thermal Slowdown: Active`, and `-d TEMPERATURE` shows a failed chassis fan.",
    "Drain node-3 with a reason, then `scontrol requeue 101`. The job restarts from its checkpoint on node-1,2,4,5.",
  ],
  debrief: `**Stragglers are the silent killer of synchronous training.** One GPU throttled to ~55% clock made *all 32* GPUs wait at every all-reduce. That is a 45% throughput loss from a single fan.

**How to spot one**
- Per-GPU utilization looks *inverted*: the straggler is pegged at ~100%, while healthy GPUs show lower utilization because they idle at the barrier.
- Its SM clock is low and \`Clocks Event Reasons\` show **HW Thermal Slowdown**.
- DCGM metrics like \`DCGM_FI_DEV_CLOCK_THROTTLE_REASONS\` and temperature are what production alerting should key on.

**Fix**: take the hardware out of rotation (drain), restart from a checkpoint on healthy nodes, and file a ticket for the fan. A warm spare node is what made this recovery fast.`,
  atlas: ["stragglers", "power-and-thermals", "dcgm", "all-reduce"],
  solution: [
    { cmd: "pdsh -w node-[1-4] nvidia-smi --query-gpu=index,temperature.gpu,clocks.sm --format=csv" },
    { cmd: "ssh node-3" },
    { cmd: "nvidia-smi -q -d PERFORMANCE -i 5" },
    { cmd: "exit" },
    { cmd: 'scontrol update NodeName=node-3 State=DRAIN Reason="gpu5 thermal slowdown, fan fault"' },
    { cmd: "scontrol requeue 101" },
    { wait: 12 },
  ],
};

const mfuTune: TerminalMission = {
  id: "mfu-tune",
  title: "Feed the Beast",
  track: "optimization",
  difficulty: 2,
  tagline: "16 H100s running at 26% MFU. Tune the training config past 55% without running out of memory.",
  kind: "terminal",
  briefing: `Job **101** trains a 7B model on **2 nodes × 8 H100s**, but Model FLOPs Utilization is about **26%**. The config in **train.sh** was copied from a tiny debugging run.

Get the job to **≥ 55% MFU**. Every flag in the \`train.py\` line is fair game: \`--micro-batch\`, \`--grad-accum\`, \`--overlap/--no-overlap\`, \`--ckpt/--no-ckpt\`, \`--workers\`, \`--precision\`, \`--zero\`, \`--tp\`.

Workflow: \`nano train.sh\` → save → \`scontrol requeue 101\` (re-reads the script) → watch \`tail slurm-101.out\`. Look for OOM errors and the "dataloader wait" marker.`,
  scenario: {
    seed: 41,
    gpu: "H100",
    fabric: "IB-NDR",
    nodes: 2,
    files: {
      "train.sh": jobScript({
        name: "llama7b",
        nodes: 2,
        args: "--model 7b --precision bf16 --micro-batch 1 --seq-len 4096 --grad-accum 2 --tp 1 --pp 1 --zero 1 --no-overlap --ckpt --workers 1",
        comment: "config from a single-GPU debug session",
      }),
      "README.md": README([
        "- MFU = achieved model FLOPs / peak FLOPs. Above 50% is excellent for LLM training.",
        "- Each dataloader worker tokenizes ~8k tokens/s.",
        "- H100 has 80 GB of HBM; the job log prints memory per GPU.",
      ]),
    },
    submit: ["train.sh"],
    warmup: 40,
  },
  objectives: [
    { id: "mfu", text: "The 7B job is training at ≥ 55% MFU", check: (sim) => runningTrain(sim).some((j) => (j.estimate?.mfu ?? 0) >= 0.55) },
    { id: "nodes", text: "…still using both nodes (16 GPUs)", check: (sim) => runningTrain(sim).some((j) => j.nodesReq * j.gpusPerNode === 16 && (j.estimate?.mfu ?? 0) >= 0.55) },
  ],
  parSeconds: 300,
  hints: [
    "Three things are slowing this job: tiny micro-batches, gradient sync that doesn't overlap with compute, and recomputation it doesn't need. Try `--overlap` and `--no-ckpt` first.",
    "After those fixes the bottleneck moves: the log shows `dataloader wait`. One worker can't feed 16 GPUs. Try `--workers 8`.",
    "A bigger `--micro-batch` (2) and `--grad-accum 4` keep tensor cores busy. Micro-batch 4 without checkpointing runs out of memory. Check the per-GPU memory line.",
  ],
  debrief: `**The bottleneck always moves.** You probably saw it shift from *communication* → *data loading* → *compute*:

- **Overlap**: DDP/FSDP can all-reduce gradient buckets while backward is still running. Without it, every byte of gradient sync is exposed time.
- **Activation checkpointing** trades ~33% extra compute for memory. It's essential for big models and pure waste when activations already fit.
- **Micro-batch size** sets GEMM sizes. Small GEMMs can't saturate tensor cores. Gradient accumulation lets you grow the *global* batch without growing memory.
- **Input pipeline**: once GPUs are fast, CPU-side tokenization becomes the limit. More workers, pre-tokenized data or prefetching fix it.

MFU (from the PaLM paper) counts only *useful* model FLOPs (6 × params × tokens), so recomputation never inflates it.`,
  atlas: ["mfu", "mixed-precision", "activation-checkpointing", "input-pipeline", "data-parallelism"],
  solution: [
    { cmd: "tail slurm-101.out" },
    {
      write: {
        path: "train.sh",
        content: jobScript({ name: "llama7b", nodes: 2, args: "--model 7b --precision bf16 --micro-batch 2 --seq-len 4096 --grad-accum 4 --tp 1 --pp 1 --zero 1 --overlap --no-ckpt --workers 8" }),
      },
    },
    { cmd: "scontrol requeue 101" },
    { wait: 12 },
  ],
};

const powerCap: TerminalMission = {
  id: "power-cap",
  title: "Watts Up",
  track: "performance",
  difficulty: 2,
  tagline: "The facility asks for a 20% power cut. Keep at least 85% of the throughput.",
  kind: "terminal",
  briefing: `Facilities is running hot and asks every tenant to cut GPU power. Your well-tuned 7B job on **2 nodes × 8 H100s** draws ~675 W per GPU.

Bring the **average GPU power to ≤ 550 W** while keeping **≥ 85% of current tokens/s**.

GPU power limits are set per GPU with \`sudo nvidia-smi -pl <watts>\` on each node. \`pdsh\` can run a command on several nodes at once. Watch the power and throughput charts as you go.`,
  scenario: {
    seed: 53,
    gpu: "H100",
    fabric: "IB-NDR",
    nodes: 2,
    files: {
      "train.sh": jobScript({ name: "llama7b", nodes: 2, args: TUNED_7B }),
      "README.md": README(["- H100 SXM default power limit: 700 W. Minimum settable: 210 W.", "- Dynamic power scales roughly with frequency × voltage², so the last few hundred MHz are the most expensive."]),
    },
    submit: ["train.sh"],
    warmup: 40,
  },
  baseline: (sim) => ({ tokensPerSec: runningTrain(sim)[0]?.estimate?.tokensPerSec ?? 0 }),
  objectives: [
    { id: "power", text: "Average GPU power ≤ 550 W", check: (sim) => runningTrain(sim).length > 0 && sim.avgAllocatedGpuPower() <= 550 },
    {
      id: "tput",
      text: "Throughput ≥ 85% of the starting tokens/s",
      check: (sim) => {
        const base = Number(sim.state.flags["baseline:tokensPerSec"] ?? 0);
        return runningTrain(sim).some((j) => (j.estimate?.tokensPerSec ?? 0) >= 0.85 * base);
      },
    },
  ],
  parSeconds: 200,
  hints: [
    "Power limits are per node: `ssh node-1`, `sudo nvidia-smi -pl 550`, `exit`, then the same on node-2. Or `sudo pdsh -w node-[1-2] nvidia-smi -pl 550`.",
    "Capping only one node slows the *whole* job, because the slowest GPU sets the pace, and barely moves the average. Cap both.",
    "Somewhere around 500–550 W keeps more than 85% of throughput. Go too low (≤ 450 W) and you fall under.",
  ],
  debrief: `**Power capping is the cheapest efficiency win in the datacenter.**

GPU dynamic power scales roughly with *f·V²*, and voltage tracks frequency near the top of the curve. So the last ~10% of clock speed costs ~25% of the power. Also, only the *compute* part of a step slows down under a cap. Communication and data loading don't care about SM clocks.

Your result: roughly 20% less power for under 10% less throughput. That is **more tokens per joule**, which means lower cost and lower CO₂e per trained model. Many sites run training at 70–85% of TDP for exactly this reason.

**Responsible-ops lens**: energy is a shared resource. Reporting kWh and CO₂e per job (see the run's footer) helps teams make these trade-offs consciously.`,
  atlas: ["power-capping", "energy-and-carbon", "power-and-thermals", "stragglers"],
  solution: [
    { cmd: "sudo pdsh -w node-[1-2] nvidia-smi -pl 530" },
    { wait: 10 },
  ],
};

const cryptominer: TerminalMission = {
  id: "cryptominer",
  title: "Night Shift",
  track: "security",
  difficulty: 2,
  tagline: "A GPU is busy with no job scheduled. Investigate, contain and remove persistence.",
  kind: "terminal",
  briefing: `Monitoring fired **GpuBusyWithoutJob** on **node-2**: a GPU is pegged, but Slurm says nothing is allocated there. This is a defensive incident-response drill on a simulated cluster.

Contain it properly:
1. **Stop the unauthorized workload.**
2. **Close the way in.** Something on node-2 is exposed to the network.
3. **Lock the compromised account.**
4. **Remove persistence**, so it doesn't come back by itself.

The objective only completes once the GPU stays clean for **2 minutes**. Useful: \`ssh node-2\`, \`nvidia-smi\`, \`ps aux\`, \`ss -tnp\`, \`systemctl\`, \`journalctl -u <svc>\`, \`crontab -l -u <user>\`, \`sudo\`.`,
  scenario: {
    seed: 67,
    gpu: "H100",
    fabric: "IB-NDR",
    nodes: 4,
    files: {
      "train.sh": jobScript({ name: "llama7b", nodes: 1, args: TUNED_7B }),
      "README.md": README([
        "- You are on-call ops with sudo. Users: ops (you), intern.",
        "- In a real incident, preserve evidence (process list, binaries, logs) before you delete anything.",
      ]),
    },
    submit: ["train.sh"],
    security: true,
    warmup: 30,
  },
  objectives: [
    { id: "persist", text: "Persistence removed (no malicious cron entry)", check: (sim) => !(sim.state.security.crontabs.intern ?? []).some((l) => l.includes("kworkerd") && !l.trim().startsWith("#")) },
    { id: "jupyter", text: "Exposed Jupyter server stopped", check: (sim) => !sim.state.security.services["jupyter-intern"]?.active },
    { id: "lock", text: "Account 'intern' locked", check: (sim) => sim.state.security.lockedUsers.includes("intern") },
    {
      id: "clean",
      text: "No miner running for 2 minutes",
      check: (sim) => sim.state.security.minerClearSince !== null && sim.state.t - sim.state.security.minerClearSince >= 120,
    },
  ],
  parSeconds: 300,
  hints: [
    "`ssh node-2`, then `nvidia-smi` shows a process on GPU 3 that isn't `python train.py`. `ps aux` shows who owns it.",
    "If you kill it, it comes back. Check `sudo crontab -l -u intern`, and `ss -tlnp` for a service listening on 0.0.0.0. Then `journalctl -u jupyter-intern`.",
    "`sudo crontab -r -u intern`, `sudo systemctl disable --now jupyter-intern`, `sudo usermod -L intern`, `sudo kill -9 <pid>`.",
  ],
  debrief: `**What happened**: an intern started Jupyter with \`--ip=0.0.0.0\` and **no token or password**. Anyone who could reach port 8888 could run code as \`intern\`. Someone at 203.0.113.77 did: they uploaded a miner, added a **cron entry** to respawn it, and pointed it at a GPU outside Slurm's control.

**Why each step mattered**
- *Killing the process* alone fails: cron and the open notebook both bring it back.
- *Stopping the service* closes the entry point. *Locking the account* stops reuse of the identity.
- *Removing the cron entry* removes persistence.

**Prevention for a shared GPU cluster**
- Never expose notebooks directly. Tunnel over SSH or use an authenticated gateway, and firewall compute nodes.
- Enforce that GPU access goes **through the scheduler**: cgroups/device isolation so processes outside a job allocation can't open \`/dev/nvidia*\`.
- Alert on *GPU busy without a job*. DCGM per-process accounting plus scheduler state makes it trivial.
- Least privilege, and audit logs you actually read.

In a real incident you'd also **preserve evidence**, rotate credentials and notify your security team. Containment is step one, not the end.`,
  atlas: ["cryptojacking", "exposed-notebooks", "multi-tenancy", "dcgm"],
  solution: [
    { cmd: "ssh node-2" },
    { cmd: "nvidia-smi" },
    { cmd: "ps aux | grep intern" },
    { cmd: "sudo crontab -l -u intern" },
    { cmd: "sudo crontab -r -u intern" },
    { cmd: "sudo systemctl disable --now jupyter-intern" },
    { cmd: "sudo usermod -L intern" },
    { cmd: "sudo pkill -f kworkerd" },
    { wait: 125 },
  ],
};

const fit70b: TerminalMission = {
  id: "fit-70b",
  title: "Seventy Billion Reasons",
  track: "optimization",
  difficulty: 3,
  tagline: "A 70B model on 32 GPUs: it doesn't fit. Choose a parallelism strategy that does, and runs fast.",
  kind: "terminal",
  briefing: `You have **4 nodes × 8 H100 (80 GB)** and a **70B-parameter** model to train. With plain data parallelism every GPU would need ~1.2 TB. It OOMs instantly.

Design a parallel layout that **fits in memory** and reaches **≥ 35% MFU** on all 32 GPUs. Knobs in \`train.py\`: \`--tp\` (tensor parallel), \`--pp\` (pipeline parallel), \`--zero 0-3\`, \`--micro-batch\`, \`--grad-accum\`, \`--ckpt\`.

Remember: *dp = 32 / (tp × pp)*, NVLink only exists **inside** a node, and 80 layers must split evenly across pipeline stages.`,
  scenario: {
    seed: 71,
    gpu: "H100",
    fabric: "IB-NDR",
    nodes: 4,
    files: {
      "train.sh": jobScript({
        name: "llama70b",
        nodes: 4,
        args: "--model 70b --precision bf16 --micro-batch 1 --seq-len 4096 --grad-accum 16 --tp 1 --pp 1 --zero 0 --overlap --no-ckpt --workers 8",
      }),
      "README.md": README([
        "- Mixed-precision Adam needs ~16 bytes per parameter (weights + grads + fp32 master + 2 moments).",
        "- Tensor parallel shards every layer (heavy, latency-sensitive traffic). Pipeline parallel splits the layer stack (light traffic, but a bubble).",
        "- 70B: 80 layers, hidden 8192, 64 heads.",
      ]),
    },
    submit: ["train.sh"],
    warmup: 20,
  },
  objectives: [
    { id: "fits", text: "A 70B job is training on 32 GPUs without OOM", check: (sim) => runningTrain(sim).some((j) => j.config.model === "70b" && j.nodesReq * j.gpusPerNode === 32) },
    { id: "mfu", text: "…at ≥ 35% MFU", check: (sim) => runningTrain(sim).some((j) => j.config.model === "70b" && j.nodesReq * j.gpusPerNode === 32 && (j.estimate?.mfu ?? 0) >= 0.35) },
  ],
  parSeconds: 420,
  hints: [
    "Read the OOM line in `slurm-101.out`: it breaks memory into weights, grads, optimizer and activations. Optimizer state is the biggest chunk.",
    "ZeRO-3 across 32 GPUs fits, but it all-gathers 140 GB of parameters over InfiniBand twice per micro-batch. Try it and watch MFU. Tensor parallelism *inside* the node (tp=8, NVLink) is the classic move.",
    "`--tp 8 --pp 2 --zero 1` (dp=2) or `--tp 8 --pp 1 --zero 1` (dp=4) both work. Don't set tp above 8, or tensor-parallel traffic crosses InfiniBand.",
  ],
  debrief: `**Memory math first, then the network topology.**

- Mixed-precision Adam costs ~16 B/param: 70B × 16 = 1.1 TB of state *before* activations. Something must shard it.
- **ZeRO / FSDP** shards optimizer state, gradients and (stage 3) parameters across data-parallel ranks. Stage 3 fits anything, but the parameters must be **all-gathered every forward and backward**. Over a 400 Gb/s NIC that dominated your step.
- **Tensor parallelism** (Megatron-style) splits each matmul across GPUs. It needs ~4 activation all-reduces *per layer*, so it belongs on **NVLink inside a node**. tp=16 would push that traffic over InfiniBand.
- **Pipeline parallelism** splits the layer stack. Traffic is light, but it costs a *bubble* of (pp−1)/(microbatches+pp−1). More gradient accumulation shrinks it.

The common recipe, "TP inside the node, PP across a few nodes, DP (+ZeRO-1) across the rest", falls straight out of the bandwidth hierarchy. That's the core idea of 3D parallelism.`,
  atlas: ["zero-fsdp", "tensor-parallelism", "pipeline-parallelism", "nvlink", "hbm"],
  solution: [
    { cmd: "tail -n 4 slurm-101.out" },
    {
      write: {
        path: "train.sh",
        content: jobScript({ name: "llama70b", nodes: 4, args: "--model 70b --precision bf16 --micro-batch 1 --seq-len 4096 --grad-accum 16 --tp 8 --pp 2 --zero 1 --overlap --no-ckpt --workers 8" }),
      },
    },
    { cmd: "sbatch train.sh" },
    { wait: 12 },
  ],
};

const podDesign: DesignerMission = {
  id: "pod-design",
  title: "Build the Pod",
  track: "architecture",
  difficulty: 2,
  tagline: "Spec a GPU pod that trains a 13B model in two weeks, within budget and the facility's power envelope.",
  kind: "designer",
  briefing: `Your lab won funding to pretrain a **13B model on 300B tokens**. Constraints from finance and facilities:

- **Capex ≤ $2.0M** (GPUs, hosts, network)
- **Facility power ≤ 60 kW**, including cooling (PUE 1.3)
- **Training time ≤ 14 days**

Pick the GPU, node count and network fabric. The estimate searches parallelism layouts (TP/PP/ZeRO/micro-batch) for each design and reports the best one that fits in memory. Lower energy is better. It's part of your score.`,
  workload: { model: "13b", tokens: 300e9 },
  limits: { capexUsd: 2_000_000, facilityKW: 60, days: 14 },
  initial: { gpu: "A100", nodes: 4, fabric: "ETH-100" },
  objectives: [
    { id: "capex", text: "Capex ≤ $2.0M", check: ({ result }) => result.capexUsd <= 2_000_000 },
    { id: "power", text: "Facility power ≤ 60 kW", check: ({ result }) => result.facilityKW <= 60 },
    { id: "time", text: "Trains 13B × 300B tokens in ≤ 14 days", check: ({ result }) => result.fits && result.days <= 14 },
  ],
  hints: [
    "Total FLOPs ≈ 6 × 13e9 × 300e9 ≈ 2.3e22. Divide by (GPUs × peak × ~55% MFU) for a quick sanity check.",
    "A100s are cheap per GPU but deliver ~1/3 of H100 throughput. Count how many nodes you'd need, and what that costs.",
    "Try 5–6 H100 nodes. Then compare InfiniBand, RoCE and 100 GbE Ethernet: gradient sync over TCP-class networks shows up in the time.",
  ],
  debrief: `**Architecture is a constrained optimization**, and the binding constraint moves:

- **L40S**: cheap, but PCIe-only (no NVLink) and less memory per GPU, so tensor parallelism hurts and 13B training lands well past two weeks.
- **A100**: affordable per node, but you'd need ~10+ nodes for the deadline, which breaks the budget.
- **H100 × 5–6 nodes**: makes the deadline. **Ethernet 100G** is cheaper, but gradient sync becomes exposed time and you miss the date. **RoCE 400G** is a legitimate cost-saver over InfiniBand when tuned well.

**Energy matters too**: newer GPUs often win on *joules per token* even when they draw more watts, because they finish so much sooner. Report MWh and CO₂e with every design review.`,
  atlas: ["gpu", "nvlink", "infiniband", "cluster-topology", "energy-and-carbon"],
  solution: { gpu: "H100", nodes: 5, fabric: "RoCE-400" },
};

export const MISSIONS: Mission[] = [firstMultinode, fallenOffBus, straggler, mfuTune, powerCap, cryptominer, fit70b, podDesign];

/** Builds the simulation for a mission and records its baseline values in `state.flags`. */
export function createMissionSim(m: TerminalMission): Simulation {
  const sim = new Simulation(m.scenario);
  for (const [k, v] of Object.entries(m.baseline?.(sim) ?? {})) sim.state.flags[`baseline:${k}`] = v;
  return sim;
}

export function objectivesMet(m: TerminalMission, sim: Simulation): boolean[] {
  return m.objectives.map((o) => o.check(sim));
}

export function getMission(id: string): Mission | undefined {
  return MISSIONS.find((m) => m.id === id);
}

export interface Score {
  score: number;
  stars: 1 | 2 | 3;
  speed: number;
}

export function scoreRun(par: number, elapsed: number, hintsUsed: number, hintCount: number): Score {
  const speed = Math.max(0, Math.min(1, par / Math.max(elapsed, 1)));
  const score = Math.round(600 + 300 * speed + 100 * (1 - hintsUsed / Math.max(hintCount, 1)));
  return { score, stars: score >= 900 ? 3 : score >= 760 ? 2 : 1, speed };
}
