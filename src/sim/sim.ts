// Deterministic, fixed-step cluster simulator. One tick = one simulated second.
// A run is fully reproducible from (scenario, action log) — see `replay`.

import { FABRICS, FACILITY, GPUS, GPUS_PER_NODE, SOCKET_FALLBACK_GBS, type FabricId, type GpuModelId } from "./hardware";
import { estimateStep, powerModel, type Placement } from "./perf";
import { Rng } from "./rng";
import { parseJobScript, type SbatchOptions } from "./jobscript";
import { runCommand, type ShellResult } from "./shell";
import type { Action, Alert, ClusterState, Fault, Gpu, Job, Node, Proc } from "./types";

export const SIM_VERSION = 1;

export interface ScenarioSpec {
  seed: number;
  gpu: GpuModelId;
  fabric: FabricId;
  nodes: number;
  files: Record<string, string>;
  /** Scripts submitted (as user ops) before the player starts. */
  submit?: string[];
  /** Faults that fire at a given sim time. */
  faults?: { t: number; fault: Fault }[];
  /** Seconds simulated before the player takes over (so pre-submitted jobs are running). */
  warmup?: number;
  /** Set up the compromised-notebook storyline used by the security mission. */
  security?: boolean;
}

const HISTORY_LEN = 240;
const INIT_SECONDS = 8;
const LOG_EVERY = 15;
const CKPT_EVERY_STEPS = 200;
const THERMAL_SLOWDOWN_C = 87;
const THERMAL_RECOVER_C = 80;

function newGpu(index: number, limitW: number): Gpu {
  return {
    index,
    util: 0,
    memUsedGB: 0,
    tempC: FACILITY.ambientC + 4,
    powerW: 0,
    powerLimitW: limitW,
    clockFactor: 1,
    throttle: "none",
    thermalLatched: false,
    fanFailed: false,
    lost: false,
    eccSbe: 0,
    eccDbe: 0,
    resetRequired: false,
  };
}

const SYSTEM_PROCS: Proc[] = [
  { pid: 1, user: "root", cmd: "/sbin/init", cpu: 0, kind: "system" },
  { pid: 812, user: "root", cmd: "/usr/sbin/sshd -D", cpu: 0, kind: "system" },
  { pid: 1104, user: "root", cmd: "/usr/sbin/slurmd -D", cpu: 0.2, kind: "system" },
  { pid: 1190, user: "root", cmd: "/usr/bin/nvidia-persistenced", cpu: 0, kind: "system" },
  { pid: 1233, user: "root", cmd: "/usr/bin/nv-hostengine -n", cpu: 0.4, kind: "system" },
];

export function initialState(spec: ScenarioSpec): ClusterState {
  const gpu = GPUS[spec.gpu];
  const nodes: Node[] = [];
  for (let i = 1; i <= spec.nodes; i++) {
    nodes.push({
      name: `node-${i}`,
      partition: "gpu",
      gpus: Array.from({ length: GPUS_PER_NODE }, (_, g) => newGpu(g, gpu.tdpW)),
      drained: false,
      nvlinkUp: true,
      ibUp: true,
      dmesg: [
        { t: 0, text: "NVRM: loading NVIDIA UNIX Open Kernel Module for x86_64  550.54.15" },
        { t: 0, text: "nvidia-nvlink: Nvlink Core is being initialized, major device number 234" },
        { t: 0, text: "mlx5_core 0000:0c:00.0: Port module event: module 0, Cable plugged" },
      ],
      procs: SYSTEM_PROCS.map((p) => ({ ...p })),
    });
  }
  return {
    t: 0,
    gpuModel: spec.gpu,
    fabric: spec.fabric,
    partitions: ["gpu"],
    nodes,
    jobs: [],
    nextJobId: 101,
    files: { ...spec.files },
    security: {
      enabled: false,
      lockedUsers: [],
      crontabs: {},
      services: {},
      authLog: [],
      minerRespawns: 0,
      minerClearSince: 0,
    },
    alerts: [],
    history: [],
    acct: { kWh: 0, usd: 0, kgCo2: 0, gpuSeconds: 0 },
    shell: { host: "login-1", user: "ops", history: [] },
    flags: {},
  };
}

export class Simulation {
  readonly spec: ScenarioSpec;
  state: ClusterState;
  readonly actions: Action[] = [];
  private rng: Rng;
  /** Increments on every mutation so UIs know when to re-render. */
  version = 0;

  constructor(spec: ScenarioSpec) {
    this.spec = spec;
    this.rng = new Rng(spec.seed);
    this.state = initialState(spec);
    if (spec.security) this.setupSecurityStory();
    for (const path of spec.submit ?? []) this.submit(path, {}, true);
    for (let i = 0; i < (spec.warmup ?? 0); i++) this.tick();
  }

  get gpuSpec() {
    return GPUS[this.state.gpuModel];
  }

  node(name: string): Node | undefined {
    return this.state.nodes.find((n) => n.name === name);
  }

  job(id: number): Job | undefined {
    return this.state.jobs.find((j) => j.id === id);
  }

  // ---------------------------------------------------------------- player actions

  exec(line: string): ShellResult {
    this.actions.push({ t: this.state.t, kind: "cmd", line });
    const res = runCommand(this, line);
    this.version++;
    return res;
  }

  writeFile(path: string, content: string) {
    this.actions.push({ t: this.state.t, kind: "write", path, content });
    if (path.startsWith("crontab:")) {
      this.state.security.crontabs[path.slice(8)] = content.split(/\r?\n/);
    } else {
      this.state.files[path] = content;
    }
    this.version++;
  }

  inject(fault: Fault) {
    this.actions.push({ t: this.state.t, kind: "fault", fault });
    this.applyFault(fault);
    this.version++;
  }

  // ---------------------------------------------------------------- scheduler API (used by the shell)

  submit(path: string, overrides: SbatchOptions, quiet = false): { ok: boolean; message: string } {
    const text = this.state.files[path];
    if (text === undefined) return { ok: false, message: `sbatch: error: Unable to open file ${path}` };
    const parsed = parseJobScript(text);
    const opts: SbatchOptions = { ...parsed.sbatch, ...overrides };
    const partition = opts.partition ?? "gpu";
    if (!this.state.partitions.includes(partition)) {
      return { ok: false, message: "sbatch: error: Batch job submission failed: Invalid partition name specified" };
    }
    const nodesInPart = this.state.nodes.filter((n) => n.partition === partition);
    const nodesReq = opts.nodes ?? 1;
    const gpusPerNode = opts.gpusPerNode ?? 0;
    if (gpusPerNode > GPUS_PER_NODE || nodesReq > nodesInPart.length) {
      return {
        ok: false,
        message: "sbatch: error: Batch job submission failed: Requested node configuration is not available",
      };
    }
    if (!parsed.hasTrainCommand) {
      return { ok: false, message: "sbatch: error: This does not look like a batch script with a train.py command" };
    }
    const id = this.state.nextJobId++;
    const job: Job = {
      id,
      name: opts.jobName ?? path.replace(/\.sh$/, ""),
      user: "ops",
      partition,
      nodesReq,
      gpusPerNode,
      exclude: opts.exclude ?? [],
      scriptPath: path,
      config: parsed.config,
      env: parsed.env,
      state: "PENDING",
      reason: "Priority",
      exitCode: "0:0",
      nodes: [],
      submitT: this.state.t,
      startT: -1,
      endT: -1,
      phase: "init",
      steps: 0,
      lastCkpt: 0,
      log: [],
      warnings: parsed.warnings,
      errors: parsed.errors,
    };
    this.state.jobs.push(job);
    this.schedule();
    return { ok: true, message: quiet ? "" : `Submitted batch job ${id}` };
  }

  cancel(id: number): string {
    const job = this.job(id);
    if (!job) return `scancel: error: Kill job error on job id ${id}: Invalid job id specified`;
    if (job.state !== "PENDING" && job.state !== "RUNNING") {
      return `scancel: error: Kill job error on job id ${id}: Job/step already completing or completed`;
    }
    job.log.push(`slurmstepd: error: *** JOB ${id} ON ${job.nodes[0] ?? "(none)"} CANCELLED AT t=${this.state.t} ***`);
    this.endJob(job, "CANCELLED", "0:15");
    return "";
  }

  requeue(id: number): string {
    const job = this.job(id);
    if (!job) return `Invalid job id specified`;
    if (job.state === "PENDING") return `scontrol: error: Job ${id} is pending, nothing to requeue`;
    if (job.state === "RUNNING") job.log.push(`slurmstepd: *** JOB ${id} REQUEUED at t=${this.state.t} ***`);
    for (const n of job.nodes) this.clearJobGpus(n);
    job.state = "PENDING";
    job.reason = "BeginTime";
    job.nodes = [];
    job.phase = "init";
    job.steps = job.lastCkpt;
    job.estimate = undefined;
    job.ncclStallSince = undefined;
    // Re-read the script so fixes made since the first submission take effect.
    const text = this.state.files[job.scriptPath];
    if (text !== undefined) {
      const parsed = parseJobScript(text);
      job.config = parsed.config;
      job.env = parsed.env;
      job.warnings = parsed.warnings;
      job.errors = parsed.errors;
    }
    this.schedule();
    return "";
  }

  setDrain(nodeName: string, drained: boolean, reason?: string): boolean {
    const n = this.node(nodeName);
    if (!n) return false;
    n.drained = drained;
    n.drainReason = drained ? reason || "drained by ops" : undefined;
    if (!drained) this.schedule();
    return true;
  }

  isAllocated(nodeName: string): Job | undefined {
    return this.state.jobs.find((j) => j.state === "RUNNING" && j.nodes.includes(nodeName));
  }

  nodeState(n: Node): string {
    const alloc = this.isAllocated(n.name);
    if (n.drained) return alloc ? "draining" : "drained";
    return alloc ? "allocated" : "idle";
  }

  // ---------------------------------------------------------------- faults

  applyFault(f: Fault) {
    const n = this.node(f.node);
    if (!n) return;
    const g = f.gpu ?? 0;
    const bus = busId(g);
    const t = this.state.t;
    switch (f.kind) {
      case "thermal":
        n.gpus[g].fanFailed = true;
        break;
      case "xid79":
        n.gpus[g].lost = true;
        n.dmesg.push({ t, text: `NVRM: Xid (PCI:${bus}): 79, pid='<unknown>', name=<unknown>, GPU has fallen off the bus.` });
        n.dmesg.push({ t, text: `NVRM: GPU ${bus}: GPU has fallen off the bus.` });
        break;
      case "nvlink":
        n.nvlinkUp = false;
        n.nvlinkFaultGpu = g;
        n.dmesg.push({ t, text: `NVRM: Xid (PCI:${bus}): 74, pid=0, name=, NVLink: fatal error detected on link 4(0x0, 0x0, 0x10000, 0x0, 0x0, 0x0, 0x0)` });
        break;
      case "ib":
        n.ibUp = false;
        n.dmesg.push({ t, text: "mlx5_core 0000:0c:00.0 ib0: Link down" });
        n.dmesg.push({ t, text: "mlx5_core 0000:0c:00.0: Port module event: module 0, Cable unplugged" });
        break;
      case "ecc":
        n.gpus[g].eccDbe += 1;
        n.gpus[g].resetRequired = true;
        n.dmesg.push({ t, text: `NVRM: Xid (PCI:${bus}): 48, pid=0, name=, An uncorrectable double bit error (DBE) has been detected on GPU in the framebuffer at partition 6, subpartition 0.` });
        n.dmesg.push({ t, text: `NVRM: Xid (PCI:${bus}): 63, pid=0, name=, Row remapping pending, reset required.` });
        break;
      case "miner":
        this.spawnMiner(n.name, g);
        break;
    }
  }

  // ---------------------------------------------------------------- security storyline

  private setupSecurityStory() {
    const s = this.state.security;
    s.enabled = true;
    s.crontabs.intern = [
      "# m h dom mon dow command",
      "*/1 * * * * pgrep -f kworkerd >/dev/null || nohup /tmp/.cache/.k/kworkerd -o pool.example.invalid:3333 >/dev/null 2>&1 &",
    ];
    s.services["jupyter-intern"] = {
      node: "node-2",
      user: "intern",
      description: "Jupyter Notebook (intern)",
      active: true,
      enabled: true,
      exposed: true,
      pid: 2741,
      log: [
        "Started Jupyter Notebook (intern).",
        "[I 08:02:11 ServerApp] Jupyter Server 2.12.1 is running at:",
        "[I 08:02:11 ServerApp] http://0.0.0.0:8888/lab",
        "[W 08:02:11 ServerApp] WARNING: The Jupyter server is listening on all IP addresses and not using encryption. This is not recommended.",
        "[W 08:02:11 ServerApp] All authentication is disabled.  Anyone who can connect to this server will be able to run code.",
        "[I 03:14:07 ServerApp] 201 POST /api/sessions (203.0.113.77) 12.40ms",
        "[I 03:14:09 ServerApp] Kernel started: 7f3c2d1e-9b2a-4c1d-8e7f-0a1b2c3d4e5f",
        "[I 03:14:22 ServerApp] 200 POST /api/contents/upload/kworkerd (203.0.113.77) 88.10ms",
      ],
    };
    const n = this.node("node-2");
    if (n) {
      n.procs.push({
        pid: 2741,
        user: "intern",
        cmd: "/usr/bin/python3 -m jupyter lab --ip=0.0.0.0 --port=8888 --ServerApp.token= --ServerApp.password=",
        cpu: 1.2,
        kind: "service",
        service: "jupyter-intern",
      });
    }
    s.authLog = [
      "sshd[2210]: Accepted publickey for intern from 10.0.4.21 port 51022 ssh2",
      "sudo: intern : user NOT in sudoers ; TTY=pts/0 ; PWD=/home/intern ; USER=root ; COMMAND=/bin/bash",
      "sshd[2210]: pam_unix(sshd:session): session closed for user intern",
      "crontab[3318]: (intern) REPLACE (intern)",
      "crontab[3318]: (intern) BEGIN EDIT (intern)",
    ];
    this.spawnMiner("node-2", 3);
  }

  private spawnMiner(nodeName: string, gpu: number) {
    const n = this.node(nodeName);
    if (!n) return;
    const s = this.state.security;
    const pid = 31337 + s.minerRespawns * 17;
    s.minerRespawns++;
    n.procs.push({
      pid,
      user: "intern",
      cmd: "/tmp/.cache/.k/kworkerd -o pool.example.invalid:3333 --cuda --threads=8",
      cpu: 98.7,
      gpu,
      gpuMemMiB: 3274,
      kind: "miner",
    });
  }

  killProc(nodeName: string, pid: number): boolean {
    const n = this.node(nodeName);
    if (!n) return false;
    const idx = n.procs.findIndex((p) => p.pid === pid);
    if (idx < 0) return false;
    const p = n.procs[idx];
    n.procs.splice(idx, 1);
    if (p.kind === "service" && p.service) {
      const svc = this.state.security.services[p.service];
      if (svc) {
        svc.active = false;
        svc.log.push(`${p.service}.service: Main process exited, code=killed, status=9/KILL`);
      }
    }
    return true;
  }

  stopService(name: string, disable: boolean) {
    const svc = this.state.security.services[name];
    if (!svc) return false;
    svc.active = false;
    if (disable) svc.enabled = false;
    svc.log.push(`Stopping ${svc.description}...`, `${name}.service: Deactivated successfully.`);
    const n = this.node(svc.node);
    if (n) n.procs = n.procs.filter((p) => p.service !== name);
    return true;
  }

  minerRunning(): boolean {
    return this.state.nodes.some((n) => n.procs.some((p) => p.kind === "miner"));
  }

  private securityTick() {
    const s = this.state.security;
    if (!s.enabled) return;
    const t = this.state.t;
    if (!this.minerRunning()) {
      const cronActive = (s.crontabs.intern ?? []).some((l) => l.includes("kworkerd") && !l.trim().startsWith("#"));
      const jupyter = s.services["jupyter-intern"];
      if (cronActive && t % 60 === 0) {
        this.spawnMiner("node-2", 3);
      } else if (jupyter?.active && jupyter.exposed && t % 90 === 45) {
        jupyter.log.push(`[I ServerApp] 200 POST /api/kernels/7f3c2d1e/execute (203.0.113.77) 31.02ms`);
        this.spawnMiner("node-2", 3);
      }
    }
    if (this.minerRunning()) s.minerClearSince = null;
    else if (s.minerClearSince === null) s.minerClearSince = t;
  }

  // ---------------------------------------------------------------- main loop

  tick() {
    const s = this.state;
    s.t++;
    for (const f of this.spec.faults ?? []) if (f.t === s.t) this.applyFault(f.fault);
    this.schedule();
    for (const job of s.jobs) if (job.state === "RUNNING") this.runJob(job);
    this.gpuPhysics();
    this.securityTick();
    this.evaluateAlerts();
    this.account();
    this.version++;
  }

  private schedule() {
    const s = this.state;
    for (const job of s.jobs) {
      if (job.state !== "PENDING") continue;
      const candidates = s.nodes.filter(
        (n) => n.partition === job.partition && !n.drained && !job.exclude.includes(n.name) && !this.isAllocated(n.name),
      );
      const usable = s.nodes.filter((n) => n.partition === job.partition && !n.drained && !job.exclude.includes(n.name));
      if (usable.length < job.nodesReq) {
        job.reason = "ReqNodeNotAvail";
        continue;
      }
      if (candidates.length < job.nodesReq) {
        job.reason = "Resources";
        continue;
      }
      job.nodes = candidates.slice(0, job.nodesReq).map((n) => n.name);
      job.state = "RUNNING";
      job.reason = "None";
      job.startT = s.t;
      job.phase = "init";
      const world = job.nodesReq * (job.gpusPerNode || 1);
      const ib = !(job.env.NCCL_IB_DISABLE === "1");
      job.log.push(
        `[t=${s.t}] torchrun: nnodes=${job.nodesReq} nproc_per_node=${job.gpusPerNode || 1} world_size=${world}`,
        ...job.warnings,
      );
      if (job.lastCkpt > 0) job.log.push(`[rank0] resuming from checkpoint step_${job.lastCkpt}`);
      if (job.nodesReq > 1) {
        job.log.push(
          ib
            ? `NCCL INFO NET/IB : Using [0]mlx5_0:1/IB [1]mlx5_1:1/IB [2]mlx5_2:1/IB [3]mlx5_3:1/IB ... ; OOB ib0`
            : `NCCL INFO NET/Socket : Using [0]eth0:10.0.1.${10 + job.id % 50}<0>`,
        );
        if (!ib) job.log.push("NCCL INFO NCCL_IB_DISABLE set by environment to 1.");
      }
      const nv = GPUS[s.gpuModel].nvlinkGBs > 0;
      job.log.push(`NCCL INFO Channel 00/16 : 0[0] -> 1[1] via ${nv ? "P2P/CUMEM" : "SHM/direct/direct"}`);
    }
  }

  placement(job: Job): Placement {
    const gpu = GPUS[this.state.gpuModel];
    const nodes = job.nodes.map((n) => this.node(n)!).filter(Boolean);
    let clock = 1;
    for (const n of nodes) for (let g = 0; g < job.gpusPerNode; g++) clock = Math.min(clock, n.gpus[g].clockFactor);
    const ibDisabled = job.env.NCCL_IB_DISABLE === "1";
    const nvlinkOk = gpu.nvlinkGBs > 0 && nodes.every((n) => n.nvlinkUp);
    return {
      gpu: gpu.id,
      numGpus: Math.max(1, job.nodesReq * job.gpusPerNode),
      gpusPerNode: Math.max(1, job.gpusPerNode),
      interGBs: ibDisabled ? SOCKET_FALLBACK_GBS : FABRICS[this.state.fabric].perGpuGBs,
      intraGBs: nvlinkOk ? gpu.nvlinkGBs : gpu.pcieGBs,
      clockFactor: clock,
    };
  }

  private runJob(job: Job) {
    const s = this.state;
    const nodes = job.nodes.map((n) => this.node(n)!);
    const elapsed = s.t - job.startT;

    // Hardware failures under the job.
    for (const n of nodes) {
      for (let g = 0; g < job.gpusPerNode; g++) {
        const gpu = n.gpus[g];
        if (gpu.lost) {
          job.log.push(
            `[rank${nodes.indexOf(n) * job.gpusPerNode + g}]: RuntimeError: CUDA error: unspecified launch failure`,
            `NCCL WARN Cuda failure 'unspecified launch failure' on ${n.name}`,
            `torch.distributed.elastic.multiprocessing.errors.ChildFailedError: train.py FAILED`,
          );
          n.dmesg.push({ t: s.t, text: `NVRM: Xid (PCI:${busId(g)}): 79, pid=${jobPid(job, n, g)}, name=python, GPU has fallen off the bus.` });
          return this.endJob(job, "FAILED", "1:0");
        }
        if (gpu.resetRequired && job.phase === "train") {
          job.log.push(
            `[rank${nodes.indexOf(n) * job.gpusPerNode + g}]: RuntimeError: CUDA error: uncorrectable ECC error encountered`,
            `torch.distributed.elastic.multiprocessing.errors.ChildFailedError: train.py FAILED`,
          );
          return this.endJob(job, "FAILED", "1:0");
        }
      }
    }
    if (job.nodesReq > 1 && job.env.NCCL_IB_DISABLE !== "1" && nodes.some((n) => !n.ibUp)) {
      if (job.ncclStallSince === undefined) {
        job.ncclStallSince = s.t;
        const bad = nodes.find((n) => !n.ibUp)!;
        job.log.push(`NCCL WARN NET/IB : ${bad.name}:mlx5_0:1 Got completion from peer with error 12, opcode 0, len 0, vendor err 129`);
      }
      if (s.t - job.ncclStallSince >= 30) {
        job.log.push(
          `[rank0]:[E ProcessGroupNCCL.cpp:607] Watchdog caught collective operation timeout: WorkNCCL(SeqNum=${Math.floor(job.steps)}, OpType=ALLREDUCE) ran for 30000 milliseconds before timing out.`,
          `torch.distributed.elastic.multiprocessing.errors.ChildFailedError: train.py FAILED`,
        );
        return this.endJob(job, "FAILED", "1:0");
      }
      return;
    }

    if (job.phase === "init") {
      if (elapsed < INIT_SECONDS) return;
      if (job.errors.length) {
        job.log.push(...job.errors, "torch.distributed.elastic.multiprocessing.errors.ChildFailedError: train.py FAILED");
        return this.endJob(job, "FAILED", "2:0");
      }
      const est = estimateStep(job.config, this.placement(job));
      if (est.error && !est.oom) {
        job.log.push(`[rank0]: ValueError: ${est.error}`, "torch.distributed.elastic.multiprocessing.errors.ChildFailedError: train.py FAILED");
        return this.endJob(job, "FAILED", "1:0");
      }
      if (est.oom) {
        const cap = GPUS[s.gpuModel].memGB;
        job.log.push(
          `[rank0]: torch.OutOfMemoryError: CUDA out of memory. Tried to allocate 2.00 GiB. GPU 0 has a total capacity of ${cap.toFixed(2)} GiB of which 412.00 MiB is free.`,
          `[rank0]: estimated per-GPU need: weights ${est.mem.weightsGB.toFixed(1)} + grads ${est.mem.gradsGB.toFixed(1)} + optimizer ${est.mem.optimizerGB.toFixed(1)} + activations ${est.mem.activationsGB.toFixed(1)} + overhead ${est.mem.overheadGB.toFixed(1)} = ${est.mem.totalGB.toFixed(1)} GiB`,
          "torch.distributed.elastic.multiprocessing.errors.ChildFailedError: train.py FAILED",
        );
        return this.endJob(job, "FAILED", "1:0");
      }
      job.phase = "train";
      job.estimate = est;
      const c = job.config;
      job.log.push(
        `[rank0] model=${c.model} precision=${c.precision} micro_batch=${c.microBatch} seq_len=${c.seqLen} grad_accum=${c.gradAccum} tp=${c.tp} pp=${c.pp} dp=${est.dp} zero=${c.zero} overlap=${c.overlap} act_ckpt=${c.ckpt} workers=${c.workers}`,
        `[rank0] memory per GPU: ${est.mem.totalGB.toFixed(1)} / ${GPUS[s.gpuModel].memGB} GiB`,
      );
      return;
    }

    const est = estimateStep(job.config, this.placement(job));
    job.estimate = est;
    job.steps += 1000 / est.stepMs;
    if (Math.floor(job.steps / CKPT_EVERY_STEPS) > Math.floor(job.lastCkpt / CKPT_EVERY_STEPS)) {
      job.lastCkpt = Math.floor(job.steps / CKPT_EVERY_STEPS) * CKPT_EVERY_STEPS;
      job.log.push(`[rank0] saved checkpoint step_${job.lastCkpt} to /lustre/ckpt/${job.name}/`);
    }
    if (elapsed % LOG_EVERY === 0) {
      const step = Math.floor(job.steps);
      const loss = 2.1 + 8.4 * Math.exp(-job.steps / 400) + this.rng.jitter() * 0.02;
      job.log.push(
        `[rank0] step ${step} | loss ${loss.toFixed(3)} | ${(est.stepMs / 1000).toFixed(2)} s/step | ${(est.tokensPerSec / 1000).toFixed(1)}k tok/s | MFU ${(est.mfu * 100).toFixed(1)}%` +
          (est.bottleneck === "data" ? " | dataloader wait" : ""),
      );
    }
  }

  /** Fails a running job, e.g. when one of its processes is killed. */
  failJob(job: Job, lines: string[]) {
    if (job.state !== "RUNNING") return;
    job.log.push(...lines);
    this.endJob(job, "FAILED", "0:9");
  }

  private endJob(job: Job, state: "FAILED" | "CANCELLED" | "COMPLETED", exit: string) {
    job.state = state;
    job.exitCode = exit;
    job.endT = this.state.t;
    for (const n of job.nodes) this.clearJobGpus(n);
  }

  private clearJobGpus(nodeName: string) {
    const n = this.node(nodeName);
    if (!n) return;
    for (const g of n.gpus) g.memUsedGB = 0;
  }

  private gpuPhysics() {
    const s = this.state;
    const spec = GPUS[s.gpuModel];
    for (const n of s.nodes) {
      const job = this.isAllocated(n.name);
      for (const g of n.gpus) {
        if (g.lost) {
          g.util = 0;
          g.powerW = 0;
          g.memUsedGB = 0;
          g.tempC += (FACILITY.ambientC - g.tempC) * 0.1;
          continue;
        }
        let util = 0;
        let mem = 0;
        if (job && g.index < job.gpusPerNode) {
          if (job.phase === "init") {
            util = 0.05;
            mem = 2;
          } else if (job.estimate) {
            const slowest = this.placement(job).clockFactor;
            util = job.estimate.busyFrac * (slowest / Math.max(g.clockFactor, 0.01));
            mem = Math.min(job.estimate.mem.totalGB, spec.memGB - 0.4);
          }
        }
        const miner = n.procs.find((p) => p.kind === "miner" && p.gpu === g.index);
        if (miner) {
          util = Math.max(util, 0.97);
          mem += (miner.gpuMemMiB ?? 0) / 1024;
        }
        if (g.resetRequired) util = 0;
        util = clamp(util + (util > 0.02 ? this.rng.jitter() * 0.015 : 0), 0, 1);
        const pm = powerModel(spec, util, g.powerLimitW);
        let clock = pm.clockFactor;
        let power = pm.powerW;
        if (g.thermalLatched) {
          clock *= 0.55;
          power = spec.idleW + (power - spec.idleW) * 0.6;
        }
        const k = g.fanFailed ? 0.13 : 0.072;
        const target = Math.min(96, FACILITY.ambientC + power * k);
        g.tempC += (target - g.tempC) * 0.15;
        if (g.tempC >= THERMAL_SLOWDOWN_C && !g.thermalLatched) {
          g.thermalLatched = true;
          n.dmesg.push({ t: s.t, text: `NVRM: GPU at PCI:${busId(g.index)}: GPU temperature ${Math.round(g.tempC)}C exceeds slowdown threshold, engaging HW slowdown` });
        } else if (g.tempC < THERMAL_RECOVER_C && g.thermalLatched) {
          g.thermalLatched = false;
        }
        g.util = util;
        g.memUsedGB = mem;
        g.powerW = power;
        g.clockFactor = clock;
        g.throttle = g.thermalLatched ? "thermal" : clock < 0.999 ? "power" : "none";
      }
    }
  }

  private evaluateAlerts() {
    const s = this.state;
    const firing: Omit<Alert, "firstT" | "lastT" | "active">[] = [];
    for (const n of s.nodes) {
      const alloc = this.isAllocated(n.name);
      if (!n.nvlinkUp) firing.push({ key: `nvlink:${n.name}`, rule: "NVLinkDown", severity: "warning", target: n.name, message: "NVLink fatal error (Xid 74); P2P traffic falling back to PCIe" });
      if (!n.ibUp) firing.push({ key: `ib:${n.name}`, rule: "IBPortDown", severity: "critical", target: n.name, message: "InfiniBand port mlx5_0 is Down" });
      for (const g of n.gpus) {
        const tgt = `${n.name}/gpu${g.index}`;
        if (g.lost) firing.push({ key: `xid79:${tgt}`, rule: "GpuFellOffBus", severity: "critical", target: tgt, message: "Xid 79: GPU has fallen off the bus" });
        if (g.resetRequired) firing.push({ key: `ecc:${tgt}`, rule: "GpuEccDbe", severity: "critical", target: tgt, message: "Uncorrectable ECC error (Xid 48); GPU reset required" });
        if (g.thermalLatched) firing.push({ key: `thermal:${tgt}`, rule: "GpuThermalSlowdown", severity: "warning", target: tgt, message: `HW thermal slowdown active at ${Math.round(g.tempC)}°C` });
        if (!alloc && g.util > 0.5) firing.push({ key: `busy:${tgt}`, rule: "GpuBusyWithoutJob", severity: "warning", target: tgt, message: `GPU ${Math.round(g.util * 100)}% busy but no Slurm job is allocated here` });
      }
    }
    for (const j of s.jobs) {
      if (j.state === "FAILED" && s.t - j.endT < 300) firing.push({ key: `jobfail:${j.id}`, rule: "JobFailed", severity: "warning", target: `job ${j.id}`, message: `Job ${j.id} (${j.name}) failed with exit code ${j.exitCode}` });
    }
    const keys = new Set(firing.map((f) => f.key));
    for (const a of s.alerts) if (!keys.has(a.key)) a.active = false;
    for (const f of firing) {
      const existing = s.alerts.find((a) => a.key === f.key);
      if (existing) {
        existing.active = true;
        existing.lastT = s.t;
        existing.message = f.message;
      } else s.alerts.push({ ...f, firstT: s.t, lastT: s.t, active: true });
    }
    if (s.alerts.length > 60) s.alerts = s.alerts.filter((a) => a.active || s.t - a.lastT < 600).slice(-60);
  }

  private account() {
    const s = this.state;
    let gpuW = 0;
    let utilSum = 0;
    let gpuCount = 0;
    let maxTemp = 0;
    for (const n of s.nodes) {
      for (const g of n.gpus) {
        gpuW += g.powerW;
        utilSum += g.util;
        gpuCount++;
        maxTemp = Math.max(maxTemp, g.tempC);
      }
    }
    const itW = gpuW + s.nodes.length * FACILITY.hostWattsPerNode;
    const kWh = (itW * FACILITY.pue) / 3.6e6;
    let allocGpus = 0;
    let tokensPerSec = 0;
    let mfuW = 0;
    for (const j of s.jobs) {
      if (j.state !== "RUNNING") continue;
      allocGpus += j.nodesReq * j.gpusPerNode;
      if (j.phase === "train" && j.estimate) {
        tokensPerSec += j.estimate.tokensPerSec;
        mfuW = Math.max(mfuW, j.estimate.mfu);
      }
    }
    s.acct.kWh += kWh;
    s.acct.gpuSeconds += allocGpus;
    s.acct.kgCo2 = s.acct.kWh * FACILITY.kgCo2PerKWh;
    s.acct.usd = s.acct.kWh * FACILITY.usdPerKWh + (s.acct.gpuSeconds / 3600) * FACILITY.usdPerGpuHour;
    s.history.push({ t: s.t, utilAvg: utilSum / Math.max(gpuCount, 1), powerKW: (itW * FACILITY.pue) / 1000, tokensPerSec, mfu: mfuW, maxTemp });
    if (s.history.length > HISTORY_LEN) s.history.shift();
  }

  /** Average GPU power over GPUs that are allocated to running jobs (W). */
  avgAllocatedGpuPower(): number {
    let sum = 0;
    let n = 0;
    for (const node of this.state.nodes) {
      const job = this.isAllocated(node.name);
      if (!job) continue;
      for (let g = 0; g < job.gpusPerNode; g++) {
        sum += node.gpus[g].powerW;
        n++;
      }
    }
    return n ? sum / n : 0;
  }

  /** Stable hash of the observable state, used to check determinism. */
  hash(): string {
    const s = this.state;
    const parts = [
      s.t,
      ...s.nodes.flatMap((n) => n.gpus.map((g) => `${g.util.toFixed(6)}:${g.tempC.toFixed(6)}:${g.powerW.toFixed(3)}`)),
      ...s.jobs.map((j) => `${j.id}:${j.state}:${j.steps.toFixed(6)}`),
      s.acct.kWh.toFixed(9),
    ];
    let h = 2166136261;
    for (const ch of parts.join("|")) {
      h ^= ch.charCodeAt(0);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
  }
}

/** Rebuilds a simulation from a factory and an action log, up to sim time `untilT`. */
export function replay(make: () => Simulation, actions: Action[], untilT: number): Simulation {
  const sim = make();
  let i = 0;
  for (;;) {
    while (i < actions.length && actions[i].t === sim.state.t) {
      const a = actions[i++];
      if (a.kind === "cmd") sim.exec(a.line);
      else if (a.kind === "write") sim.writeFile(a.path, a.content);
      else sim.inject(a.fault);
    }
    if (sim.state.t >= untilT) break;
    sim.tick();
  }
  return sim;
}

export function busId(gpu: number): string {
  const buses = ["18", "2a", "3a", "5d", "9a", "ab", "ba", "db"];
  return `0000:${buses[gpu] ?? "00"}:00.0`;
}

export function jobPid(job: Job, _node: Node, gpu: number): number {
  return 40000 + job.id * 20 + gpu;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
