// A simulated Linux/Slurm/NVIDIA command line over the cluster state. Output mimics the real tools
// closely enough that the skills transfer, but only the subset needed for learning is implemented.

import { FABRICS, GPUS, GPUS_PER_NODE } from "./hardware";
import { applySbatchTokens, compressHostList, expandHostList, splitPipes, tokenize, type SbatchOptions } from "./jobscript";
import { ringAllReduceMs } from "./perf";
import type { Simulation } from "./sim";
import { busId, jobPid } from "./sim";
import type { Gpu, Node, Proc } from "./types";

export type LineKind = "out" | "err" | "info";
export interface Line {
  text: string;
  kind: LineKind;
}
export interface ShellResult {
  lines: Line[];
  clear?: boolean;
  openEditor?: { path: string; content: string; readOnly?: boolean };
}

interface Ctx {
  sim: Simulation;
  args: string[];
  sudo: boolean;
  host: string;
  node?: Node;
}

type Handler = (c: Ctx) => ShellResult;

const LOGIN = "login-1";
const USERS = ["root", "ops", "intern", "slurm"];
const DRIVER = "550.54.15";
const CUDA = "12.4";

const out = (...texts: string[]): ShellResult => ({ lines: texts.flatMap((t) => t.split("\n")).map((text) => ({ text, kind: "out" as const })) });
const err = (...texts: string[]): ShellResult => ({ lines: texts.map((text) => ({ text, kind: "err" as const })) });
const info = (text: string): Line => ({ text, kind: "info" });
const none = (): ShellResult => ({ lines: [] });

export function simDate(t: number): Date {
  return new Date(Date.UTC(2026, 9, 11, 8, 0, 0) + t * 1000);
}
function dateStr(t: number): string {
  const d = simDate(t);
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()];
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()];
  return `${day} ${mon} ${String(d.getUTCDate()).padStart(2, " ")} ${clock(t)} UTC ${d.getUTCFullYear()}`;
}
function clock(t: number): string {
  const d = simDate(t);
  return [d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()].map((v) => String(v).padStart(2, "0")).join(":");
}
function elapsed(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = String(m).padStart(h ? 2 : 1, "0");
  return `${h ? h + ":" : ""}${mm}:${String(s).padStart(2, "0")}`;
}
function cols(left: string, right: string, width: number): string {
  const gap = width - left.length - right.length;
  return gap >= 1 ? left + " ".repeat(gap) + right : (left + " " + right).slice(0, width);
}
function pad(s: string | number, w: number, right = false): string {
  const str = String(s);
  return right ? str.padStart(w) : str.padEnd(w);
}
function gpuName(sim: Simulation): string {
  return { H100: "NVIDIA H100 80GB HBM3", A100: "NVIDIA A100-SXM4-80GB", L40S: "NVIDIA L40S" }[sim.state.gpuModel];
}
function needNode(c: Ctx, tool: string): ShellResult | null {
  if (c.node) return null;
  if (tool === "nvidia-smi") {
    return {
      lines: [
        { text: "NVIDIA-SMI has failed because it couldn't communicate with the NVIDIA driver. Make sure that the latest NVIDIA driver is installed and running.", kind: "err" },
        info(`(${LOGIN} is a login node with no GPUs. Hop onto a compute node first, e.g. "ssh node-1".)`),
      ],
    };
  }
  return { lines: [{ text: `${tool}: no GPUs or HCAs on ${LOGIN}`, kind: "err" }, info('(Try it on a compute node: "ssh node-1".)')] };
}

// ------------------------------------------------------------------ processes

function jobProcs(sim: Simulation, n: Node): Proc[] {
  const job = sim.isAllocated(n.name);
  if (!job) return [];
  const c = job.config;
  const procs: Proc[] = [
    { pid: 40000 + job.id * 20 + 19, user: job.user, cmd: `torchrun --nnodes=${job.nodesReq} --nproc-per-node=${job.gpusPerNode} train.py`, cpu: 0.3, kind: "system" },
  ];
  for (let g = 0; g < job.gpusPerNode; g++) {
    procs.push({
      pid: jobPid(job, n, g),
      user: job.user,
      cmd: `python train.py --model ${c.model} --precision ${c.precision} --local-rank ${g}`,
      cpu: job.phase === "train" ? 100 : 12,
      gpu: g,
      gpuMemMiB: Math.round(n.gpus[g].memUsedGB * 1024),
      kind: "system",
    });
  }
  return procs;
}

function allProcs(c: Ctx): Proc[] {
  if (!c.node) {
    return [
      { pid: 1, user: "root", cmd: "/sbin/init", cpu: 0, kind: "system" },
      { pid: 640, user: "slurm", cmd: "/usr/sbin/slurmctld -D", cpu: 0.6, kind: "system" },
      { pid: 812, user: "root", cmd: "/usr/sbin/sshd -D", cpu: 0, kind: "system" },
      { pid: 5120, user: "ops", cmd: "-bash", cpu: 0, kind: "system" },
    ];
  }
  return [...c.node.procs, ...jobProcs(c.sim, c.node)].sort((a, b) => a.pid - b.pid);
}

function gpuProcs(c: Ctx, gpu: number): Proc[] {
  return allProcs(c).filter((p) => p.gpu === gpu);
}

// ------------------------------------------------------------------ nvidia-smi

function smiTable(c: Ctx, ids: number[]): string[] {
  const sim = c.sim;
  const n = c.node!;
  const spec = sim.gpuSpec;
  const bar = "+-----------------------------------------+------------------------+----------------------+";
  const lines: string[] = [];
  for (const i of ids) if (n.gpus[i].lost) lines.push(`Unable to determine the device handle for GPU${busId(i).toUpperCase()}: Unknown Error`);
  lines.push(
    dateStr(sim.state.t),
    "+-----------------------------------------------------------------------------------------+",
    `| ${cols(`NVIDIA-SMI ${DRIVER}`, `Driver Version: ${DRIVER}      CUDA Version: ${CUDA}`, 87)} |`,
    "|-----------------------------------------+------------------------+----------------------+",
    "| GPU  Name                 Persistence-M | Bus-Id          Disp.A | Volatile Uncorr. ECC |",
    "| Fan  Temp   Perf          Pwr:Usage/Cap |           Memory-Usage | GPU-Util  Compute M. |",
    "|                                         |                        |               MIG M. |",
    "|=========================================+========================+======================|",
  );
  for (const i of ids) {
    const g = n.gpus[i];
    if (g.lost) continue;
    const memTot = Math.round(spec.memGB * 1019.5);
    lines.push(
      `|${cols(`   ${i}  ${gpuName(sim)}`, "On  ", 41)}|${cols(`   0000${busId(i).toUpperCase()}`, "Off ", 24)}|${cols("", `${g.eccDbe} `, 22)}|`,
      `|${cols(` N/A   ${Math.round(g.tempC)}C    P0`, `${Math.round(g.powerW)}W / ${Math.round(g.powerLimitW)}W `, 41)}|${cols("", `${Math.round(g.memUsedGB * 1024)}MiB / ${memTot}MiB `, 24)}|${cols(`   ${Math.round(g.util * 100)}%`, "Default ", 22)}|`,
      `|${" ".repeat(41)}|${" ".repeat(24)}|${cols("", "Disabled ", 22)}|`,
      bar,
    );
  }
  lines.push(
    "",
    "+-----------------------------------------------------------------------------------------+",
    "| Processes:                                                                              |",
    "|  GPU   GI   CI        PID   Type   Process name                              GPU Memory |",
    "|        ID   ID                                                               Usage      |",
    "|=========================================================================================|",
  );
  let any = false;
  for (const i of ids) {
    for (const p of gpuProcs(c, i)) {
      any = true;
      const name = p.cmd.split(" ")[0].split("/").pop() ?? p.cmd;
      lines.push(`|${cols(`  ${pad(i, 4, true)}   N/A  N/A  ${pad(p.pid, 9, true)}      C   ${name}`, `${p.gpuMemMiB ?? 0}MiB `, 89)}|`);
    }
  }
  if (!any) lines.push(`|${cols("  No running processes found", "", 89)}|`);
  lines.push("+-----------------------------------------------------------------------------------------+");
  return lines;
}

function active(b: boolean) {
  return b ? "Active" : "Not Active";
}

function smiQuery(c: Ctx, ids: number[], sections: string[]): string[] {
  const sim = c.sim;
  const n = c.node!;
  const spec = sim.gpuSpec;
  const all = sections.length === 0;
  const has = (s: string) => all || sections.includes(s);
  const lines = [
    "",
    "==============NVSMI LOG==============",
    "",
    `Timestamp                                 : ${dateStr(sim.state.t)}`,
    `Driver Version                            : ${DRIVER}`,
    `CUDA Version                              : ${CUDA}`,
    "",
    `Attached GPUs                             : ${n.gpus.filter((g) => !g.lost).length}`,
  ];
  for (const i of ids) {
    const g = n.gpus[i];
    if (g.lost) {
      lines.push(`GPU ${busId(i).toUpperCase()}`, "    Unknown Error");
      continue;
    }
    lines.push(`GPU 0000${busId(i)}`);
    if (all) lines.push(`    Product Name                          : ${gpuName(sim)}`, `    MIG Mode`, `        Current                           : Disabled`);
    if (has("PERFORMANCE")) {
      lines.push(
        "    Performance State                     : P0",
        "    Clocks Event Reasons",
        `        Idle                              : ${active(g.util < 0.02)}`,
        "        Applications Clocks Setting       : Not Active",
        `        SW Power Cap                      : ${active(g.throttle === "power")}`,
        `        HW Slowdown                       : ${active(g.thermalLatched)}`,
        `            HW Thermal Slowdown           : ${active(g.thermalLatched)}`,
        "            HW Power Brake Slowdown       : Not Active",
        "        Sync Boost                        : Not Active",
        "        SW Thermal Slowdown               : Not Active",
        "    Clocks",
        `        SM                                : ${Math.round(spec.maxClockMHz * g.clockFactor)} MHz`,
        `    Max Clocks`,
        `        SM                                : ${spec.maxClockMHz} MHz`,
      );
    }
    if (has("TEMPERATURE")) {
      lines.push(
        "    Temperature",
        `        GPU Current Temp                  : ${Math.round(g.tempC)} C`,
        "        GPU Shutdown Temp                 : 92 C",
        "        GPU Slowdown Temp                 : 87 C",
        "        GPU Max Operating Temp            : 85 C",
        `        Fan Speed (chassis)               : ${g.fanFailed ? "0 RPM (FAULT)" : "11400 RPM"}`,
      );
    }
    if (has("POWER")) {
      lines.push(
        "    GPU Power Readings",
        `        Power Draw                        : ${g.powerW.toFixed(2)} W`,
        `        Current Power Limit               : ${g.powerLimitW.toFixed(2)} W`,
        `        Default Power Limit               : ${spec.tdpW.toFixed(2)} W`,
        `        Min Power Limit                   : ${minPower(c).toFixed(2)} W`,
        `        Max Power Limit                   : ${spec.tdpW.toFixed(2)} W`,
      );
    }
    if (has("ECC")) {
      lines.push(
        "    ECC Errors",
        "        Volatile",
        `            SRAM Correctable              : 0`,
        `            SRAM Uncorrectable            : 0`,
        `            DRAM Correctable              : ${g.eccSbe}`,
        `            DRAM Uncorrectable            : ${g.eccDbe}`,
        "    Remapped Rows",
        `        Correctable Error                 : ${g.eccSbe}`,
        `        Uncorrectable Error               : ${g.eccDbe}`,
        `        Pending                           : ${g.resetRequired ? "Yes" : "No"}`,
        `        Remapping Failure Occurred        : No`,
      );
    }
    if (has("UTILIZATION")) {
      lines.push("    Utilization", `        Gpu                               : ${Math.round(g.util * 100)} %`, `        Memory                            : ${Math.round(g.util * 60)} %`);
    }
  }
  return lines;
}

function minPower(c: Ctx) {
  return Math.round(c.sim.gpuSpec.tdpW * 0.3);
}

const QUERY_FIELDS: Record<string, (c: Ctx, g: Gpu) => string> = {
  index: (_c, g) => String(g.index),
  name: (c) => gpuName(c.sim),
  "temperature.gpu": (_c, g) => String(Math.round(g.tempC)),
  "utilization.gpu": (_c, g) => `${Math.round(g.util * 100)} %`,
  "power.draw": (_c, g) => `${g.powerW.toFixed(2)} W`,
  "power.limit": (_c, g) => `${g.powerLimitW.toFixed(2)} W`,
  "clocks.sm": (c, g) => `${Math.round(c.sim.gpuSpec.maxClockMHz * g.clockFactor)} MHz`,
  "clocks.max.sm": (c) => `${c.sim.gpuSpec.maxClockMHz} MHz`,
  "memory.used": (_c, g) => `${Math.round(g.memUsedGB * 1024)} MiB`,
  "memory.total": (c) => `${Math.round(c.sim.gpuSpec.memGB * 1019.5)} MiB`,
  "ecc.errors.uncorrected.volatile.total": (_c, g) => String(g.eccDbe),
  "clocks_event_reasons.active": (_c, g) => (g.thermalLatched ? "0x0000000000000048" : g.throttle === "power" ? "0x0000000000000004" : "0x0000000000000000"),
  "clocks_throttle_reasons.active": (_c, g) => (g.thermalLatched ? "0x0000000000000048" : g.throttle === "power" ? "0x0000000000000004" : "0x0000000000000000"),
  "pci.bus_id": (_c, g) => `0000${busId(g.index)}`.toUpperCase(),
};

const nvidiaSmi: Handler = (c) => {
  const nn = needNode(c, "nvidia-smi");
  if (nn) return nn;
  const n = c.node!;
  const a = c.args;
  let ids = n.gpus.map((g) => g.index);
  const idArg = argValue(a, ["-i", "--id"]);
  if (idArg !== undefined) {
    const picked = idArg.split(",").map(Number);
    if (picked.some((i) => !Number.isInteger(i) || i < 0 || i >= GPUS_PER_NODE)) return err(`No devices were found matching ${idArg}`);
    ids = picked;
  }
  if (a[0] === "topo") return out(...topo(c));
  if (a[0] === "nvlink") return out(...nvlinkStatus(c, ids));
  const pl = argValue(a, ["-pl", "--power-limit"]);
  if (pl !== undefined) {
    const w = Number(pl);
    const spec = c.sim.gpuSpec;
    if (!c.sudo) return err(...ids.map((i) => `Failed to set power management limit for GPU 0000${busId(i).toUpperCase()}: Insufficient Permissions`), "Terminating early due to previous errors.");
    if (!Number.isFinite(w) || w < minPower(c) || w > spec.tdpW) {
      return err(`Provided power limit ${Number(pl).toFixed(2)} W is not a valid power limit which should be between ${minPower(c).toFixed(2)} W and ${spec.tdpW.toFixed(2)} W for GPU 0000${busId(ids[0]).toUpperCase()}`, "Terminating early due to previous errors.");
    }
    const lines: string[] = [];
    for (const i of ids) {
      const g = n.gpus[i];
      if (g.lost) continue;
      lines.push(`Power limit for GPU 0000${busId(i).toUpperCase()} was set to ${w.toFixed(2)} W from ${g.powerLimitW.toFixed(2)} W.`);
      g.powerLimitW = w;
    }
    lines.push("All done.");
    c.sim.state.flags["used:power-limit"] = true;
    return out(...lines);
  }
  if (a.includes("-r") || a.includes("--gpu-reset")) {
    if (!c.sudo) return err("Unable to reset this GPU: Insufficient Permissions");
    if (idArg === undefined) return err("A GPU must be specified with -i to be reset.");
    const lines: string[] = [];
    for (const i of ids) {
      const g = n.gpus[i];
      if (g.lost) {
        lines.push(`Unable to determine the device handle for gpu 0000${busId(i).toUpperCase()}: Unknown Error`);
        continue;
      }
      if (gpuProcs(c, i).length) {
        lines.push(`The following GPUs could not be reset:`, `  GPU 0000${busId(i).toUpperCase()}: In use by another client`);
        continue;
      }
      g.resetRequired = false;
      lines.push(`GPU 0000${busId(i).toUpperCase()} was successfully reset.`);
    }
    lines.push("All done.");
    return out(...lines);
  }
  const query = a.find((x) => x.startsWith("--query-gpu="));
  if (query) {
    const fields = query.slice(12).split(",");
    const bad = fields.find((f) => !QUERY_FIELDS[f]);
    if (bad) return err(`Field "${bad}" is not a valid field to query.`, `Supported here: ${Object.keys(QUERY_FIELDS).join(", ")}`);
    const noHeader = a.some((x) => x.includes("noheader"));
    const lines = noHeader ? [] : [fields.join(", ")];
    for (const i of ids) {
      if (n.gpus[i].lost) continue;
      lines.push(fields.map((f) => QUERY_FIELDS[f](c, n.gpus[i])).join(", "));
    }
    return out(...lines);
  }
  if (a.includes("-q") || a.includes("--query")) {
    const d = argValue(a, ["-d", "--display"]);
    return out(...smiQuery(c, ids, d ? d.toUpperCase().split(",") : []));
  }
  if (a.includes("-L")) {
    return out(...n.gpus.filter((g) => !g.lost).map((g) => `GPU ${g.index}: ${gpuName(c.sim)} (UUID: GPU-${(0x3f2a9c00 + g.index * 4099 + Number(n.name.slice(5)) * 77).toString(16)}-7c1e-4b2d-9e8f-${n.name.slice(5).padStart(4, "0")}a1b2c3d4)`));
  }
  c.sim.state.flags["used:nvidia-smi"] = true;
  return out(...smiTable(c, ids));
};

function topo(c: Ctx): string[] {
  const spec = c.sim.gpuSpec;
  const link = spec.nvlinkGBs > 0 ? (spec.id === "H100" ? "NV18" : "NV12") : "SYS";
  const header = "\t" + Array.from({ length: GPUS_PER_NODE }, (_, i) => `GPU${i}`).join("\t") + "\tNIC0\tCPU Affinity\tNUMA Affinity";
  const rows = [header];
  for (let i = 0; i < GPUS_PER_NODE; i++) {
    const cells = Array.from({ length: GPUS_PER_NODE }, (_, j) => (i === j ? " X " : spec.nvlinkGBs > 0 ? link : Math.floor(i / 4) === Math.floor(j / 4) ? "NODE" : "SYS"));
    rows.push(`GPU${i}\t${cells.join("\t")}\t${i === 0 ? "PIX" : "SYS"}\t${i < 4 ? "0-55" : "56-111"}\t${i < 4 ? 0 : 1}`);
  }
  rows.push(
    "",
    "Legend:",
    "  X    = Self",
    "  SYS  = Connection traversing PCIe as well as the SMP interconnect between NUMA nodes (e.g., QPI/UPI)",
    "  NODE = Connection traversing PCIe as well as the interconnect between PCIe Host Bridges within a NUMA node",
    "  PIX  = Connection traversing at most a single PCIe bridge",
    "  NV#  = Connection traversing a bonded set of # NVLinks",
  );
  return rows;
}

function nvlinkStatus(c: Ctx, ids: number[]): string[] {
  const spec = c.sim.gpuSpec;
  if (spec.nvlinkGBs === 0) return [`NVLink is not supported on ${gpuName(c.sim)}`];
  const n = c.node!;
  const links = spec.id === "H100" ? 18 : 12;
  const per = (spec.nvlinkGBs / links).toFixed(3);
  const lines: string[] = [];
  for (const i of ids) {
    if (n.gpus[i].lost) continue;
    lines.push(`GPU ${i}: ${gpuName(c.sim)} (UUID: GPU-${(0x3f2a9c00 + i * 4099).toString(16)}-7c1e-4b2d-9e8f)`);
    for (let l = 0; l < links; l++) {
      const down = !n.nvlinkUp && n.nvlinkFaultGpu === i && l === 4;
      lines.push(`\t Link ${l}: ${down ? "<inactive>" : `${per} GB/s`}`);
    }
  }
  return lines;
}

// ------------------------------------------------------------------ slurm

const sinfo: Handler = (c) => {
  const s = c.sim.state;
  if (c.args.includes("-R")) {
    const rows = [pad("REASON", 40) + pad("USER", 10) + pad("TIMESTAMP", 21) + "NODELIST"];
    for (const n of s.nodes) if (n.drained) rows.push(pad(n.drainReason ?? "", 40) + pad("ops", 10) + pad(`2026-10-11T${clock(s.t)}`, 21) + n.name);
    return out(...rows);
  }
  if (c.args.includes("-N")) {
    const rows = ["NODELIST   NODES PARTITION STATE"];
    for (const n of s.nodes) rows.push(`${pad(n.name, 11)}${pad(1, 5, true)} ${pad(n.partition + "*", 9)} ${slurmState(c.sim, n)}`);
    return out(...rows);
  }
  const rows = ["PARTITION AVAIL  TIMELIMIT  NODES  STATE NODELIST"];
  for (const p of s.partitions) {
    const groups = new Map<string, string[]>();
    for (const n of s.nodes.filter((x) => x.partition === p)) {
      const st = slurmState(c.sim, n);
      groups.set(st, [...(groups.get(st) ?? []), n.name]);
    }
    for (const [st, hosts] of groups) rows.push(`${pad(p + "*", 9)} ${pad("up", 5, true)} ${pad("7-00:00:00", 10, true)} ${pad(hosts.length, 6, true)} ${pad(st, 6, true)} ${compressHostList(hosts)}`);
  }
  return out(...rows);
};

function slurmState(sim: Simulation, n: Node): string {
  const alloc = sim.isAllocated(n.name);
  if (n.drained) return alloc ? "drng" : "drain";
  return alloc ? "alloc" : "idle";
}

const squeue: Handler = (c) => {
  const s = c.sim.state;
  const rows = ["             JOBID PARTITION     NAME     USER ST       TIME  NODES NODELIST(REASON)"];
  const userFilter = argValue(c.args, ["-u", "--user"]) ?? (c.args.includes("--me") ? "ops" : undefined);
  for (const j of s.jobs) {
    if (j.state !== "PENDING" && j.state !== "RUNNING") continue;
    if (userFilter && j.user !== userFilter) continue;
    const st = j.state === "RUNNING" ? "R" : "PD";
    const time = j.state === "RUNNING" ? elapsed(s.t - j.startT) : "0:00";
    const where = j.state === "RUNNING" ? compressHostList(j.nodes) : `(${j.reason})`;
    rows.push(`${pad(j.id, 18, true)} ${pad(j.partition, 9, true)} ${pad(j.name.slice(0, 8), 8, true)} ${pad(j.user, 8, true)} ${pad(st, 2, true)} ${pad(time, 10, true)} ${pad(j.nodesReq, 6, true)} ${where}`);
  }
  return out(...rows);
};

const sacct: Handler = (c) => {
  const rows = [
    "JobID           JobName  Partition      State ExitCode    Elapsed        NodeList",
    "------------ ---------- ---------- ---------- -------- ---------- ---------------",
  ];
  const s = c.sim.state;
  for (const j of s.jobs) {
    const end = j.endT >= 0 ? j.endT : s.t;
    const el = j.startT >= 0 ? elapsed(end - j.startT) : "0:00";
    rows.push(`${pad(j.id, 12)} ${pad(j.name.slice(0, 10), 10, true)} ${pad(j.partition, 10, true)} ${pad(j.state, 10, true)} ${pad(j.exitCode, 8, true)} ${pad(el, 10, true)} ${pad(compressHostList(j.nodes) || "None assigned", 15, true)}`);
  }
  return out(...rows);
};

const sbatch: Handler = (c) => {
  if (c.node) return err(`sbatch: error: submit jobs from the login node (you are on ${c.host}; type "exit")`);
  const errors: string[] = [];
  const overrides: SbatchOptions = {};
  const file = c.args.filter((a, i) => !a.startsWith("-") && !(i > 0 && /^-[a-zA-Z]$/.test(c.args[i - 1]))).pop();
  const unknown = applySbatchTokens(c.args.filter((a) => a !== file), overrides, errors);
  if (unknown.length) return err(`sbatch: unrecognized option '${unknown[0]}'`, "Try \"sbatch --help\" for more information");
  if (errors.length) return err(...errors.map((e) => `sbatch: error: ${e}`));
  if (!file) return err("sbatch: error: no batch script specified (usage: sbatch [options] script.sh)");
  const res = c.sim.submit(file, overrides);
  if (res.ok) c.sim.state.flags["used:sbatch"] = true;
  return res.ok ? out(res.message) : err(res.message);
};

const scancel: Handler = (c) => {
  if (!c.args.length) return err("scancel: error: No job identification provided");
  const lines: string[] = [];
  for (const a of c.args) {
    const msg = c.sim.cancel(Number(a));
    if (msg) lines.push(msg);
  }
  return lines.length ? err(...lines) : none();
};

const scontrol: Handler = (c) => {
  const [sub, ...rest] = c.args;
  const sim = c.sim;
  if (sub === "show") {
    const [what, id] = rest;
    if (what === "job") {
      const j = sim.job(Number(id));
      if (!j) return err("slurm_load_jobs error: Invalid job id specified");
      const e = j.estimate;
      return out(
        `JobId=${j.id} JobName=${j.name}`,
        `   UserId=${j.user}(1001) GroupId=${j.user}(1001)`,
        `   JobState=${j.state} Reason=${j.reason} ExitCode=${j.exitCode}`,
        `   SubmitTime=2026-10-11T${clock(j.submitT)} StartTime=${j.startT >= 0 ? `2026-10-11T${clock(j.startT)}` : "Unknown"}`,
        `   Partition=${j.partition} NodeList=${compressHostList(j.nodes) || "(null)"} ExcNodeList=${j.exclude.length ? compressHostList(j.exclude) : "(null)"}`,
        `   NumNodes=${j.nodesReq} TRES=node=${j.nodesReq},gres/gpu=${j.nodesReq * j.gpusPerNode}`,
        `   TresPerNode=gres/gpu:${j.gpusPerNode}`,
        `   Command=/home/ops/${j.scriptPath}`,
        `   StdOut=/home/ops/slurm-${j.id}.out`,
        ...(e && j.state === "RUNNING" ? [`   Comment=step=${Math.floor(j.steps)} step_time=${(e.stepMs / 1000).toFixed(2)}s mfu=${(e.mfu * 100).toFixed(1)}%`] : []),
      );
    }
    if (what === "node" || what === "nodes") {
      const nodes = id ? expandHostList(id).map((x) => sim.node(x)) : sim.state.nodes;
      if (nodes.some((n) => !n)) return err(`Node ${id} not found`);
      const lines: string[] = [];
      for (const n of nodes as Node[]) {
        const st = slurmState(sim, n);
        const stateStr = (sim.isAllocated(n.name) ? "ALLOCATED" : "IDLE") + (n.drained ? "+DRAIN" : "");
        lines.push(
          `NodeName=${n.name} Arch=x86_64 CoresPerSocket=56`,
          `   CPUAlloc=${st.startsWith("al") || st === "drng" ? 224 : 0} CPUTot=224 CPULoad=${sim.isAllocated(n.name) ? "96.10" : "0.42"}`,
          `   Gres=gpu:${sim.state.gpuModel.toLowerCase()}:${GPUS_PER_NODE}`,
          `   RealMemory=2048000 AllocMem=0`,
          `   State=${stateStr} ThreadsPerCore=2`,
          `   Partitions=${n.partition}`,
          ...(n.drained ? [`   Reason=${n.drainReason} [ops@2026-10-11T${clock(sim.state.t)}]`] : []),
          "",
        );
      }
      return out(...lines);
    }
    if (what === "partition") return out(`PartitionName=gpu`, `   Default=YES State=UP Nodes=${compressHostList(sim.state.nodes.map((n) => n.name))}`, `   MaxTime=7-00:00:00 TotalNodes=${sim.state.nodes.length}`);
    return err("usage: scontrol show job <id> | node [name] | partition");
  }
  if (sub === "update") {
    const kv: Record<string, string> = {};
    for (const tok of rest) {
      const eq = tok.indexOf("=");
      if (eq > 0) kv[tok.slice(0, eq).toLowerCase()] = tok.slice(eq + 1);
    }
    const nodeSpec = kv.nodename ?? kv.node;
    if (!nodeSpec) return err("scontrol: error: Invalid update request, use NodeName=<name> State=<DRAIN|RESUME> Reason=<text>");
    const names = expandHostList(nodeSpec);
    for (const name of names) if (!sim.node(name)) return err(`slurm_update error: Invalid node name specified (${name})`);
    const state = (kv.state ?? "").toUpperCase();
    if (state === "DRAIN" || state === "DOWN") {
      if (!kv.reason) return err("You must specify a reason when DOWNING or DRAINING a node. Request denied");
      for (const name of names) sim.setDrain(name, true, kv.reason);
      sim.state.flags["used:drain"] = true;
      return none();
    }
    if (state === "RESUME" || state === "IDLE") {
      for (const name of names) sim.setDrain(name, false);
      return none();
    }
    return err(`scontrol: error: Invalid node state specified: ${kv.state ?? "(none)"}`);
  }
  if (sub === "requeue") {
    if (!rest[0]) return err("scontrol: error: requeue requires a job id");
    const msg = sim.requeue(Number(rest[0]));
    if (!msg) sim.state.flags["used:requeue"] = true;
    return msg ? err(msg) : none();
  }
  return err("scontrol: supported here: show job|node|partition, update NodeName=… State=…, requeue <jobid>");
};

// ------------------------------------------------------------------ node tools

const dcgmi: Handler = (c) => {
  const nn = needNode(c, "dcgmi");
  if (nn) return nn;
  const n = c.node!;
  const sim = c.sim;
  if (c.args[0] === "discovery") {
    const lines = [`${n.gpus.filter((g) => !g.lost).length} GPUs found.`, "+--------+----------------------------------------------------------------------+", "| GPU ID | Device Information                                                   |", "+--------+----------------------------------------------------------------------+"];
    for (const g of n.gpus) if (!g.lost) lines.push(`| ${pad(g.index, 6)} | ${pad(`Name: ${gpuName(sim)}  PCI Bus ID: 0000${busId(g.index).toUpperCase()}`, 68)} |`);
    lines.push("+--------+----------------------------------------------------------------------+");
    return out(...lines);
  }
  if (c.args[0] !== "diag") return err("Usage: dcgmi diag -r <1|2|3> | dcgmi discovery -l");
  const level = Number(argValue(c.args, ["-r", "--run"]) ?? "1");
  const row = (k: string, v: string) => `| ${pad(k, 25)} | ${pad(v, 46)} |`;
  const sect = (k: string) => `|-----  ${k}  ${"-".repeat(Math.max(1, 18 - k.length))}+------------------------------------------------|`;
  const lost = n.gpus.filter((g) => g.lost);
  const ecc = n.gpus.filter((g) => g.resetRequired);
  const hot = n.gpus.filter((g) => g.thermalLatched || g.fanFailed);
  const rogue = n.procs.filter((p) => p.gpu !== undefined);
  sim.state.flags["used:dcgmi"] = true;
  const lines = [
    "Successfully ran diagnostic for group.",
    "+---------------------------+------------------------------------------------+",
    "| Diagnostic                | Result                                         |",
    "+===========================+================================================+",
    sect("Metadata"),
    row("DCGM Version", "3.3.5"),
    row("Number of GPUs Detected", String(GPUS_PER_NODE - lost.length)),
    sect("Deployment"),
    row("Denylist", "Pass"),
    row("NVML Library", lost.length ? `Fail - GPU ${lost[0].index}: Unknown Error (Xid 79?)` : "Pass"),
    row("CUDA Main Library", "Pass"),
    row("Permissions and OS Blocks", "Pass"),
    row("Persistence Mode", "Pass"),
    row("Environment Variables", "Pass"),
    row("Page Retirement/Row Remap", ecc.length ? `Fail - GPU ${ecc[0].index}: row remap pending` : "Pass"),
    row("Graphics Processes", rogue.length ? `Warn - GPU ${rogue[0].gpu}: pid ${rogue[0].pid} running` : "Pass"),
    row("Inforom", "Pass"),
  ];
  if (level >= 2) {
    lines.push(
      sect("Integration"),
      row("PCIe", !n.nvlinkUp ? `Fail - GPU ${n.nvlinkFaultGpu ?? 0}: NVLink link 4 inactive` : "Pass - All"),
      sect("Hardware"),
      row("GPU Memory", ecc.length ? `Fail - GPU ${ecc[0].index}: DBE detected` : "Pass - All"),
      row("Diagnostic", hot.length ? `Warn - GPU ${hot[0].index}: HW thermal slowdown` : "Pass - All"),
    );
  }
  if (level >= 3) {
    lines.push(sect("Stress"), row("Targeted Power", hot.length ? `Fail - GPU ${hot[0].index}: temp exceeded limit` : "Pass - All"), row("EUD", "Skip - All"));
  }
  lines.push("+---------------------------+------------------------------------------------+");
  return out(...lines);
};

const dmesg: Handler = (c) => {
  const human = c.args.includes("-T");
  const entries = c.node ? c.node.dmesg : [{ t: 0, text: "systemd[1]: Started Slurm controller daemon." }];
  return out(...entries.map((e) => (human ? `[${dateStr(e.t)}] ${e.text}` : `[${pad((e.t + 1843.2).toFixed(6), 12, true)}] ${e.text}`)));
};

const ps: Handler = (c) => {
  const procs = allProcs(c);
  const rows = ["USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND"];
  for (const p of procs) rows.push(`${pad(p.user, 8)} ${pad(p.pid, 7, true)} ${pad(p.cpu.toFixed(1), 4, true)} ${pad(p.gpu !== undefined ? "1.2" : "0.0", 4, true)} ${pad(p.kind === "miner" ? 2318812 : 167744, 6, true)} ${pad(11520, 5, true)} ?        ${p.cpu > 50 ? "Rl" : "Ss"}   08:00   ${p.cpu > 50 ? "41:07" : "0:02"} ${p.cmd}`);
  return out(...rows);
};

const top: Handler = (c) => {
  const procs = [...allProcs(c)].sort((a, b) => b.cpu - a.cpu);
  const load = (procs.reduce((s, p) => s + p.cpu, 0) / 100).toFixed(2);
  const rows = [
    `top - ${clock(c.sim.state.t)} up 3 days,  4:12,  1 user,  load average: ${load}, ${load}, ${load}`,
    `Tasks: ${procs.length + 312} total,   ${procs.filter((p) => p.cpu > 50).length} running`,
    "",
    "    PID USER      PR  NI    VIRT    RES  %CPU  %MEM     TIME+ COMMAND",
  ];
  for (const p of procs.slice(0, 15)) rows.push(`${pad(p.pid, 7, true)} ${pad(p.user, 8)}  20   0 ${pad("2.2g", 7, true)} ${pad("11520", 6, true)} ${pad(p.cpu.toFixed(1), 5, true)} ${pad("0.0", 5, true)} ${pad(p.cpu > 50 ? "41:07.22" : "0:02.10", 9, true)} ${p.cmd.split(" ")[0].split("/").pop()}`);
  rows.push("", info("(top shows one snapshot here; run it again to refresh)").text);
  return out(...rows);
};

function killPid(c: Ctx, pid: number): string | null {
  const n = c.node;
  const procs = allProcs(c);
  const p = procs.find((x) => x.pid === pid);
  if (!p) return `bash: kill: (${pid}) - No such process`;
  if (p.user !== "ops" && !c.sudo) return `bash: kill: (${pid}) - Operation not permitted`;
  if (!n) return `bash: kill: (${pid}) - Operation not permitted`;
  const job = c.sim.isAllocated(n.name);
  if (job && jobProcs(c.sim, n).some((x) => x.pid === pid)) {
    c.sim.failJob(job, [`slurmstepd: error: *** STEP ${job.id}.0 ON ${n.name} process ${pid} killed by signal 9 ***`, "torch.distributed.elastic.multiprocessing.errors.ChildFailedError: train.py FAILED"]);
    return null;
  }
  if (p.kind === "system" && p.user === "root") return null; // pretend; killing init etc. is not modelled
  c.sim.killProc(n.name, pid);
  if (p.kind === "miner") c.sim.state.flags["killed:miner"] = true;
  return null;
}

const kill: Handler = (c) => {
  const pids = c.args.filter((a) => /^\d+$/.test(a)).map(Number);
  if (!pids.length) return err("kill: usage: kill [-s sigspec | -n signum | -sigspec] pid ...");
  const errs = pids.map((p) => killPid(c, p)).filter((x): x is string => !!x);
  return errs.length ? err(...errs) : none();
};

const pkill: Handler = (c) => {
  const pattern = c.args.filter((a) => !a.startsWith("-")).pop();
  if (!pattern) return err("pkill: no matching criteria specified");
  const full = c.args.includes("-f");
  const matches = allProcs(c).filter((p) => (full ? p.cmd : p.cmd.split(" ")[0]).includes(pattern));
  const errs = matches.map((p) => killPid(c, p.pid)).filter((x): x is string => !!x);
  return errs.length ? err(...errs.map((e) => e.replace("bash: kill:", "pkill: killing pid"))) : none();
};

const ibstat: Handler = (c) => {
  const nn = needNode(c, "ibstat");
  if (nn) return nn;
  const n = c.node!;
  const fab = FABRICS[c.sim.state.fabric];
  const rate = fab.id === "ETH-100" ? 100 : 400;
  const lines: string[] = [];
  for (let i = 0; i < GPUS_PER_NODE; i++) {
    const down = !n.ibUp && i === 0;
    lines.push(
      `CA 'mlx5_${i}'`,
      "\tCA type: MT4129",
      "\tNumber of ports: 1",
      "\tFirmware version: 28.39.1002",
      "\tPort 1:",
      `\t\tState: ${down ? "Down" : "Active"}`,
      `\t\tPhysical state: ${down ? "Polling" : "LinkUp"}`,
      `\t\tRate: ${down ? 10 : rate}`,
      `\t\tLink layer: ${fab.id === "IB-NDR" ? "InfiniBand" : "Ethernet"}`,
    );
  }
  return out(...lines);
};

const allReducePerf: Handler = (c) => {
  const nn = needNode(c, "all_reduce_perf");
  if (nn) return nn;
  const n = c.node!;
  const spec = c.sim.gpuSpec;
  const g = Number(argValue(c.args, ["-g", "--ngpus"]) ?? "1");
  if (g < 2) return out("# nGpus 1: a single GPU has nobody to all-reduce with. Try: all_reduce_perf -b 8M -e 1G -f 2 -g 8");
  const free = Array.from({ length: g }, (_, i) => n.gpus[i]).every((x) => x && !x.lost && !c.sim.isAllocated(n.name));
  if (!free) return err("NCCL WARN Cuda failure 'out of memory' / GPUs busy or unavailable on this node (drain it or wait for the job to finish)");
  const bw = (spec.nvlinkGBs > 0 && n.nvlinkUp ? spec.nvlinkGBs : spec.pcieGBs) * 0.82;
  const lines = [
    `# nThread 1 nGpus ${g} minBytes 8388608 maxBytes 1073741824 step: 2(factor) warmup iters: 5 iters: 20 agg iters: 1 validation: 1 graph: 0`,
    "#",
    "#       size         count      type   redop    root     time   algbw   busbw #wrong",
    "#        (B)    (elements)                               (us)  (GB/s)  (GB/s)",
  ];
  let sum = 0;
  let k = 0;
  for (let size = 8 * 2 ** 20; size <= 2 ** 30; size *= 2) {
    const ms = ringAllReduceMs(size, g, bw, 8);
    const algbw = size / 1e9 / (ms / 1000);
    const busbw = (algbw * 2 * (g - 1)) / g;
    sum += busbw;
    k++;
    lines.push(`${pad(size, 12, true)} ${pad(size / 4, 13, true)}     float     sum      -1 ${pad((ms * 1000).toFixed(1), 8, true)} ${pad(algbw.toFixed(2), 7, true)} ${pad(busbw.toFixed(2), 7, true)}      0`);
  }
  lines.push(`# Out of bounds values : 0 OK`, `# Avg bus bandwidth    : ${(sum / k).toFixed(2)}`);
  c.sim.state.flags["used:nccl-tests"] = true;
  return out(...lines);
};

// ------------------------------------------------------------------ security tools

function onServiceNode(c: Ctx): boolean {
  return c.sim.state.security.enabled && c.host === "node-2";
}

const usermod: Handler = (c) => {
  const user = c.args[c.args.length - 1];
  if (!c.sudo) return err("usermod: Permission denied.", "usermod: cannot lock /etc/passwd; try again later.");
  if (!c.args.includes("-L") && !c.args.includes("--lock")) return err("usermod: only -L/--lock is supported in this lab");
  if (!USERS.includes(user)) return err(`usermod: user '${user}' does not exist`);
  if (!c.sim.state.security.lockedUsers.includes(user)) c.sim.state.security.lockedUsers.push(user);
  return none();
};

const passwd: Handler = (c) => {
  const user = c.args.filter((a) => !a.startsWith("-")).pop();
  if (!c.args.includes("-l")) return err("passwd: only 'passwd -l <user>' (lock) is supported in this lab");
  if (!c.sudo) return err("passwd: Only root can specify a user name.");
  if (!user || !USERS.includes(user)) return err(`passwd: user '${user ?? ""}' does not exist`);
  if (!c.sim.state.security.lockedUsers.includes(user)) c.sim.state.security.lockedUsers.push(user);
  return out("passwd: password expiry information changed.");
};

const crontab: Handler = (c) => {
  const user = argValue(c.args, ["-u"]) ?? "ops";
  if (user !== "ops" && !c.sudo) return err("must be privileged to use -u");
  const tabs = onServiceNode(c) ? c.sim.state.security.crontabs : {};
  if (c.args.includes("-r")) {
    if (!tabs[user]) return err(`no crontab for ${user}`);
    delete c.sim.state.security.crontabs[user];
    return none();
  }
  if (c.args.includes("-e")) {
    if (!onServiceNode(c)) return err(`no crontab for ${user} on ${c.host}`);
    return { lines: [], openEditor: { path: `crontab:${user}`, content: (tabs[user] ?? []).join("\n") } };
  }
  const tab = tabs[user];
  return tab ? out(...tab) : err(`no crontab for ${user}`);
};

const STANDARD_SERVICES = ["sshd", "slurmd", "nvidia-persistenced", "nvidia-dcgm"];

const systemctl: Handler = (c) => {
  const [sub, ...rest] = c.args;
  const s = c.sim.state.security;
  const name = (rest.filter((a) => !a.startsWith("-")).pop() ?? "").replace(/\.service$/, "");
  const svc = onServiceNode(c) ? s.services[name] : undefined;
  if (sub === "list-units" || !sub) {
    const lines = ["  UNIT                          LOAD   ACTIVE SUB     DESCRIPTION"];
    for (const x of STANDARD_SERVICES) lines.push(`  ${pad(x + ".service", 29)} loaded active running ${x}`);
    if (onServiceNode(c)) for (const [k, v] of Object.entries(s.services)) lines.push(`  ${pad(k + ".service", 29)} loaded ${pad(v.active ? "active" : "inactive", 6)} ${pad(v.active ? "running" : "dead", 7)} ${v.description}`);
    return out(...lines);
  }
  if (!name) return err(`Too few arguments.`);
  if (!svc && !STANDARD_SERVICES.includes(name)) return err(`Unit ${name}.service could not be found.`);
  if (sub === "status") {
    if (!svc) return out(`● ${name}.service - ${name}`, `     Loaded: loaded (/lib/systemd/system/${name}.service; enabled)`, `     Active: active (running) since ${dateStr(0)}`);
    return out(
      `${svc.active ? "●" : "○"} ${name}.service - ${svc.description}`,
      `     Loaded: loaded (/etc/systemd/system/${name}.service; ${svc.enabled ? "enabled" : "disabled"}; preset: enabled)`,
      `     Active: ${svc.active ? `active (running) since ${dateStr(0)}` : "inactive (dead)"}`,
      ...(svc.active ? [`   Main PID: ${svc.pid} (python3)`, `     CGroup: /system.slice/${name}.service`, `             └─${svc.pid} /usr/bin/python3 -m jupyter lab --ip=0.0.0.0 --port=8888 --ServerApp.token=`] : []),
    );
  }
  if (sub === "stop" || sub === "disable" || sub === "mask") {
    if (!c.sudo) return err(`Failed to ${sub} ${name}.service: Interactive authentication required.`, `See system logs and 'systemctl status ${name}.service' for details.`);
    if (!svc) return out(`(${name} is a core service in this lab; leaving it running)`);
    if (sub === "stop" || rest.includes("--now")) c.sim.stopService(name, sub !== "stop");
    else svc.enabled = false;
    if (sub !== "stop") return out(`Removed "/etc/systemd/system/multi-user.target.wants/${name}.service".`);
    return none();
  }
  if (sub === "start" || sub === "restart") return err(`(starting services is disabled in this lab)`);
  return err(`Unknown command verb ${sub}.`);
};

const journalctl: Handler = (c) => {
  const unit = (argValue(c.args, ["-u", "--unit"]) ?? "").replace(/\.service$/, "");
  if (c.args.includes("-k")) return dmesg({ ...c, args: [] });
  const s = c.sim.state.security;
  const svc = onServiceNode(c) ? s.services[unit] : undefined;
  const nArg = Number(argValue(c.args, ["-n", "--lines"]) ?? "0");
  if (!unit) return out(`${dateStr(0).slice(4, 19)} ${c.host} systemd[1]: Startup finished in 14.211s.`, info("(filter by unit: journalctl -u <service>)").text);
  if (!svc) return STANDARD_SERVICES.includes(unit) ? out(`${dateStr(0).slice(4, 19)} ${c.host} systemd[1]: Started ${unit}.service.`) : out("-- No entries --");
  const lines = svc.log.map((l) => `Oct 11 ${clock(0)} ${c.host} jupyter[${svc.pid}]: ${l}`);
  return out(...(nArg ? lines.slice(-nArg) : lines));
};

const ss: Handler = (c) => {
  const s = c.sim.state.security;
  const jup = onServiceNode(c) ? s.services["jupyter-intern"] : undefined;
  const miner = c.node?.procs.find((p) => p.kind === "miner");
  const lines = ["State   Recv-Q  Send-Q   Local Address:Port    Peer Address:Port  Process"];
  lines.push(`LISTEN  0       128            0.0.0.0:22           0.0.0.0:*      users:(("sshd",pid=812))`);
  if (c.node) lines.push(`LISTEN  0       128            0.0.0.0:6818         0.0.0.0:*      users:(("slurmd",pid=1104))`, `LISTEN  0       128          127.0.0.1:5555         0.0.0.0:*      users:(("nv-hostengine",pid=1233))`);
  if (jup?.active) lines.push(`LISTEN  0       128            0.0.0.0:8888         0.0.0.0:*      users:(("python3",pid=${jup.pid}))`);
  if (miner) lines.push(`ESTAB   0       0           10.0.1.12:51234   198.51.100.23:3333   users:(("kworkerd",pid=${miner.pid}))`);
  if (jup?.active) lines.push(`ESTAB   0       0           10.0.1.12:8888     203.0.113.77:49152  users:(("python3",pid=${jup.pid}))`);
  return out(...lines);
};

const last: Handler = (c) => {
  if (!onServiceNode(c)) return out("ops      pts/0        login-1          Sun Oct 11 07:58   still logged in", "", "wtmp begins Thu Oct  1 00:00:01 2026");
  return out(
    "ops      pts/1        login-1          Sun Oct 11 08:00   still logged in",
    "intern   pts/0        10.0.4.21        Sat Oct 10 17:41 - 18:02  (00:21)",
    "intern   pts/0        10.0.4.21        Fri Oct  9 10:03 - 16:55  (06:52)",
    "",
    "wtmp begins Thu Oct  1 00:00:01 2026",
  );
};

// ------------------------------------------------------------------ files

const VIRTUAL_DIRS: Record<string, (c: Ctx) => string[] | null> = {
  "/var/log": (c) => (c.node ? ["auth.log", "syslog", "slurmd.log"] : ["slurmctld.log", "syslog"]),
  "/tmp/.cache/.k": (c) => (onServiceNode(c) ? ["kworkerd", "config.json"] : null),
};

function homeFiles(c: Ctx): string[] {
  const s = c.sim.state;
  return [...Object.keys(s.files), ...s.jobs.map((j) => `slurm-${j.id}.out`)].sort();
}

function readFile(c: Ctx, path: string): { text?: string; error?: string } {
  const s = c.sim.state;
  const p = path.replace(/^~\//, "").replace(/^\/home\/ops\//, "");
  const log = /^slurm-(\d+)\.out$/.exec(p);
  if (log) {
    const j = c.sim.job(Number(log[1]));
    return j ? { text: j.log.join("\n") } : { error: `cat: ${path}: No such file or directory` };
  }
  if (p in s.files) return { text: s.files[p] };
  if (p === "/var/log/auth.log" && c.node) {
    if (!c.sudo) return { error: `cat: ${path}: Permission denied` };
    if (!onServiceNode(c)) return { text: `Oct 11 08:00:01 ${c.host} sshd[812]: Accepted publickey for ops from 10.0.0.5 port 50412 ssh2` };
    const extra = s.security.lockedUsers.map((u) => `Oct 11 ${clock(s.t)} node-2 usermod[4410]: lock user '${u}' password`);
    return { text: [...s.security.authLog.map((l) => `Oct 10 18:0${l.length % 10} node-2 ${l}`), ...extra].join("\n") };
  }
  if (p === "/tmp/.cache/.k/kworkerd" && onServiceNode(c)) return { error: `cat: ${path}: binary file (ELF 64-bit LSB executable, stripped)` };
  if (p === "/tmp/.cache/.k/config.json" && onServiceNode(c)) {
    return { text: `{"pools":[{"url":"pool.example.invalid:3333","user":"<redacted wallet>"}],"cuda":{"enabled":true,"devices":[3]},"background":true}` };
  }
  if (p === "/etc/hostname") return { text: c.host };
  if (p === "/etc/nccl.conf") return { text: "NCCL_DEBUG=WARN\nNCCL_IB_HCA=mlx5" };
  if (p.startsWith("/var/log/")) return { text: `${dateStr(0).slice(4, 19)} ${c.host} systemd[1]: Started Session 1 of User ops.` };
  return { error: `cat: ${path}: No such file or directory` };
}

const ls: Handler = (c) => {
  const target = c.args.filter((a) => !a.startsWith("-"))[0];
  const long = c.args.some((a) => a.startsWith("-") && a.includes("l"));
  let names: string[] | null;
  if (!target || target === "~" || target === "." || target === "/home/ops") names = homeFiles(c);
  else names = VIRTUAL_DIRS[target.replace(/\/$/, "")]?.(c) ?? null;
  if (!names) return err(`ls: cannot access '${target}': No such file or directory`);
  if (!long) return out(names.join("  "));
  return out(`total ${names.length * 4}`, ...names.map((n) => `-rw-r--r-- 1 ${n === "kworkerd" || n === "config.json" ? "intern intern" : "ops   ops   "} ${pad(n.endsWith(".sh") ? 612 : 4096, 6, true)} Oct 11 08:00 ${n}`));
};

const cat: Handler = (c) => {
  const files = c.args.filter((a) => !a.startsWith("-"));
  if (!files.length) return err("cat: missing file operand");
  const lines: Line[] = [];
  for (const f of files) {
    const r = readFile(c, f);
    if (r.error) lines.push({ text: r.error, kind: "err" });
    else lines.push(...(r.text ?? "").split("\n").map((text) => ({ text, kind: "out" as const })));
  }
  return { lines };
};

const editor: Handler = (c) => {
  const path = c.args.filter((a) => !a.startsWith("-"))[0];
  if (!path) return err("usage: nano <file>");
  const p = path.replace(/^~\//, "");
  if (/^slurm-\d+\.out$/.test(p)) {
    const r = readFile(c, p);
    return { lines: [], openEditor: { path: p, content: r.text ?? "", readOnly: true } };
  }
  if (p.startsWith("/")) return err(`nano: ${path}: Permission denied (only files in your home directory are editable)`);
  return { lines: [], openEditor: { path: p, content: c.sim.state.files[p] ?? "" } };
};

const cp: Handler = (c) => {
  const [src, dst] = c.args.filter((a) => !a.startsWith("-"));
  if (!src || !dst) return err("cp: missing file operand");
  const r = readFile(c, src);
  if (r.error) return err(r.error.replace("cat:", "cp:"));
  c.sim.writeFile(dst.replace(/^~\//, ""), r.text ?? "");
  return none();
};

const rm: Handler = (c) => {
  const files = c.args.filter((a) => !a.startsWith("-"));
  for (const f of files) {
    const p = f.replace(/^~\//, "");
    if (!(p in c.sim.state.files)) return err(`rm: cannot remove '${f}': No such file or directory`);
    delete c.sim.state.files[p];
  }
  return none();
};

const grepFile: Handler = (c) => {
  const flags = c.args.filter((a) => a.startsWith("-"));
  const [pattern, ...files] = c.args.filter((a) => !a.startsWith("-"));
  if (!pattern || !files.length) return err("usage: grep [-i] [-v] PATTERN FILE...");
  const lines: string[] = [];
  for (const f of files) {
    const r = readFile(c, f);
    if (r.error) return err(r.error.replace("cat:", "grep:"));
    lines.push(...(r.text ?? "").split("\n"));
  }
  return { lines: filterGrep(lines.map((text) => ({ text, kind: "out" })), pattern, flags) };
};

function filterGrep(lines: Line[], pattern: string, flags: string[]): Line[] {
  const ci = flags.some((f) => f.includes("i"));
  const inv = flags.some((f) => f.includes("v"));
  const extended = flags.some((f) => f.includes("E"));
  let re: RegExp;
  try {
    re = new RegExp(extended ? pattern : pattern.replace(/[.*+?^${}()[\]\\]/g, (m) => (m === "." || m === "*" ? m : "\\" + m)).replace(/\\\|/g, "|"), ci ? "i" : "");
  } catch {
    re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), ci ? "i" : "");
  }
  return lines.filter((l) => re.test(l.text) !== inv);
}

const tail: Handler = (c) => {
  const n = Number(argValue(c.args, ["-n"]) ?? "10");
  const f = c.args.filter((a, i) => !a.startsWith("-") && c.args[i - 1] !== "-n")[0];
  if (!f) return err("tail: missing file operand");
  const r = readFile(c, f);
  if (r.error) return err(r.error.replace("cat:", "tail:"));
  const res = out(...(r.text ?? "").split("\n").slice(-n));
  if (c.args.includes("-f")) res.lines.push(info("(follow mode isn't supported; run the command again to refresh)"));
  return res;
};

const head: Handler = (c) => {
  const n = Number(argValue(c.args, ["-n"]) ?? "10");
  const f = c.args.filter((a, i) => !a.startsWith("-") && c.args[i - 1] !== "-n")[0];
  if (!f) return err("head: missing file operand");
  const r = readFile(c, f);
  if (r.error) return err(r.error.replace("cat:", "head:"));
  return out(...(r.text ?? "").split("\n").slice(0, n));
};

// ------------------------------------------------------------------ session

const ssh: Handler = (c) => {
  const target = c.args.filter((a) => !a.startsWith("-"))[0]?.replace(/^.*@/, "");
  if (!target) return err("usage: ssh <host>");
  if (target === LOGIN) {
    c.sim.state.shell.host = LOGIN;
    return none();
  }
  const n = c.sim.node(target);
  if (!n) return err(`ssh: Could not resolve hostname ${target}: Name or service not known`);
  c.sim.state.shell.host = target;
  c.sim.state.flags[`visited:${target}`] = true;
  return out(`Last login: ${dateStr(c.sim.state.t - 300)} from 10.0.0.5`);
};

const exit: Handler = (c) => {
  if (c.host === LOGIN) return out("logout", info("(this is your home base; the session stays open)").text);
  c.sim.state.shell.host = LOGIN;
  return out("logout", `Connection to ${c.host} closed.`);
};

const pdsh: Handler = (c) => {
  const wi = c.args.indexOf("-w");
  const w = wi >= 0 ? c.args[wi + 1] : undefined;
  if (!w) return err("pdsh: usage: pdsh -w node-[1-4] <command>");
  let inner = [...c.args.slice(0, wi), ...c.args.slice(wi + 2)].join(" ");
  if (!inner) return err("pdsh: no command specified");
  if (c.sudo && !/^sudo\s/.test(inner)) inner = `sudo ${inner}`;
  const lines: Line[] = [];
  const home = c.sim.state.shell.host;
  for (const h of expandHostList(w)) {
    if (!c.sim.node(h)) {
      lines.push({ text: `pdsh@${LOGIN}: ${h}: ssh: Could not resolve hostname`, kind: "err" });
      continue;
    }
    c.sim.state.shell.host = h;
    const r = execOne(c.sim, inner);
    for (const l of r.lines) lines.push({ text: `${h}: ${l.text}`, kind: l.kind });
  }
  c.sim.state.shell.host = home;
  return { lines };
};

const HELP: [string, string][] = [
  ["Cluster (login node)", ""],
  ["sinfo [-R|-N]", "partitions and node states (-R shows drain reasons)"],
  ["squeue [--me]", "queued and running jobs"],
  ["sbatch [opts] <script>", "submit a batch job, e.g. sbatch train.sh"],
  ["scancel <jobid>", "cancel a job"],
  ["scontrol show job|node …", "details; update NodeName=… State=DRAIN Reason=\"…\"; requeue <id>"],
  ["sacct", "job history with exit codes"],
  ["ssh <node> / exit", "hop onto a compute node and back"],
  ["pdsh -w node-[1-2] <cmd>", "run a command on several nodes"],
  ["GPU node tools", ""],
  ["nvidia-smi", "GPU table; -q -d PERFORMANCE|TEMPERATURE|POWER|ECC; topo -m; nvlink -s"],
  ["nvidia-smi --query-gpu=…", "CSV metrics, e.g. --query-gpu=index,temperature.gpu,clocks.sm --format=csv"],
  ["sudo nvidia-smi -pl <W>", "set a power limit (add -i <gpu> for one GPU)"],
  ["dcgmi diag -r 1|2|3", "NVIDIA DCGM health diagnostics"],
  ["dmesg [-T]", "kernel log (Xid errors live here)"],
  ["ibstat", "InfiniBand / RoCE port status"],
  ["all_reduce_perf -g 8", "nccl-tests bandwidth benchmark on an idle node"],
  ["Linux & security", ""],
  ["ps aux / top", "processes"],
  ["kill [-9] <pid> / pkill -f <pat>", "stop processes (other users' need sudo)"],
  ["ss -tlnp", "listening sockets and connections"],
  ["systemctl status|stop|disable <svc>", "services"],
  ["journalctl -u <svc>", "service logs"],
  ["crontab -l [-u user] / -r / -e", "scheduled tasks"],
  ["usermod -L <user>", "lock an account"],
  ["last", "login history"],
  ["Files", ""],
  ["ls, cat, head, tail, grep, cp, rm", "basic file tools (pipes to grep/head/tail/wc work)"],
  ["nano <file>", "edit a file (Ctrl+S saves)"],
  ["Shell", ""],
  ["clear, history, whoami, hostname, date", ""],
];

const help: Handler = () => {
  const lines: Line[] = [];
  for (const [cmd, desc] of HELP) {
    if (!desc) lines.push({ text: `\n${cmd}`, kind: "info" });
    else lines.push({ text: `  ${pad(cmd, 38)}${desc}`, kind: "out" });
  }
  return { lines: lines.flatMap((l) => l.text.split("\n").map((text) => ({ ...l, text }))) };
};

const COMMANDS: Record<string, Handler> = {
  help,
  "?": help,
  clear: () => ({ lines: [], clear: true }),
  whoami: () => out("ops"),
  hostname: (c) => out(c.host),
  date: (c) => out(dateStr(c.sim.state.t)),
  uptime: (c) => out(` ${clock(c.sim.state.t)} up 3 days,  4:12,  1 user,  load average: 0.42, 0.40, 0.38`),
  echo: (c) => out(c.args.join(" ")),
  history: (c) => out(...c.sim.state.shell.history.map((h, i) => `${pad(i + 1, 5, true)}  ${h}`)),
  id: (c) => out(c.sudo ? "uid=0(root) gid=0(root) groups=0(root)" : "uid=1001(ops) gid=1001(ops) groups=1001(ops),27(sudo),990(slurm-admin)"),
  uname: () => out("Linux 6.8.0-45-generic #45-Ubuntu SMP x86_64 GNU/Linux"),
  sinfo,
  squeue,
  sacct,
  sbatch,
  scancel,
  scontrol,
  ssh,
  exit,
  logout: exit,
  pdsh,
  "nvidia-smi": nvidiaSmi,
  dcgmi,
  dmesg,
  ibstat,
  all_reduce_perf: allReducePerf,
  ps,
  top,
  htop: top,
  kill,
  pkill,
  ss,
  netstat: ss,
  systemctl,
  journalctl,
  crontab,
  usermod,
  passwd,
  last,
  ls,
  ll: (c) => ls({ ...c, args: ["-l", ...c.args] }),
  cat,
  less: cat,
  more: cat,
  head,
  tail,
  grep: grepFile,
  cp,
  rm,
  nano: editor,
  vim: editor,
  vi: editor,
  edit: editor,
  code: editor,
};

export const COMMAND_NAMES = Object.keys(COMMANDS).filter((k) => k !== "?");

function argValue(args: string[], names: string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    for (const n of names) {
      if (args[i] === n) return args[i + 1];
      if (n.startsWith("--") && args[i].startsWith(n + "=")) return args[i].slice(n.length + 1);
    }
  }
  return undefined;
}

function applyFilter(lines: Line[], segment: string): Line[] | string {
  const [cmd, ...args] = tokenize(segment);
  const flags = args.filter((a) => a.startsWith("-"));
  const rest = args.filter((a) => !a.startsWith("-"));
  switch (cmd) {
    case "grep":
      if (!rest[0]) return "grep: missing pattern";
      return filterGrep(lines, rest[0], flags);
    case "head": {
      const n = Number(argValue(args, ["-n"]) ?? (flags[0] && /^-\d+$/.test(flags[0]) ? flags[0].slice(1) : "10"));
      return lines.slice(0, n);
    }
    case "tail": {
      const n = Number(argValue(args, ["-n"]) ?? (flags[0] && /^-\d+$/.test(flags[0]) ? flags[0].slice(1) : "10"));
      return lines.slice(-n);
    }
    case "wc":
      return [{ text: String(lines.length), kind: "out" }];
    case "sort":
      return [...lines].sort((a, b) => a.text.localeCompare(b.text) * (flags.includes("-r") ? -1 : 1));
    case "uniq":
      return lines.filter((l, i) => i === 0 || l.text !== lines[i - 1].text);
    case "less":
    case "more":
    case "cat":
      return lines;
    default:
      return `${cmd}: not supported after a pipe here (try grep, head, tail, wc, sort, uniq)`;
  }
}

function execOne(sim: Simulation, line: string): ShellResult {
  const segments = splitPipes(line);
  let first = segments[0];
  let sudo = false;
  if (/^sudo\s+/.test(first)) {
    sudo = true;
    first = first.replace(/^sudo\s+(-\S+\s+)*/, "");
  }
  const [cmd, ...args] = tokenize(first);
  if (!cmd) return none();
  const handler = COMMANDS[cmd];
  if (!handler) return err(`${cmd}: command not found`);
  const host = sim.state.shell.host;
  const ctx: Ctx = { sim, args, sudo, host, node: host === LOGIN ? undefined : sim.node(host) };
  let res = handler(ctx);
  for (const seg of segments.slice(1)) {
    const filtered = applyFilter(res.lines, seg);
    if (typeof filtered === "string") return err(filtered);
    res = { ...res, lines: filtered };
  }
  return res;
}

export function runCommand(sim: Simulation, raw: string): ShellResult {
  const line = raw.trim();
  if (!line) return none();
  sim.state.shell.history.push(line);
  if (sim.state.shell.history.length > 200) sim.state.shell.history.shift();
  try {
    return execOne(sim, line);
  } catch (e) {
    return err(`lazylab: internal error running "${line}": ${(e as Error).message}`);
  }
}

export function prompt(sim: Simulation): string {
  return `ops@${sim.state.shell.host}:~$`;
}

