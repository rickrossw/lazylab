import type { FabricId, GpuModelId } from "./hardware";
import type { StepEstimate, TrainConfig } from "./perf";

export interface Gpu {
  index: number;
  util: number;
  memUsedGB: number;
  tempC: number;
  powerW: number;
  powerLimitW: number;
  clockFactor: number;
  throttle: "none" | "thermal" | "power";
  thermalLatched: boolean;
  fanFailed: boolean;
  lost: boolean;
  eccSbe: number;
  eccDbe: number;
  /** A double-bit ECC error leaves the GPU unusable until it is reset. */
  resetRequired: boolean;
}

export type NodeState = "idle" | "alloc" | "drain" | "down";

export interface Proc {
  pid: number;
  user: string;
  cmd: string;
  cpu: number;
  gpu?: number;
  gpuMemMiB?: number;
  kind: "system" | "service" | "miner";
  service?: string;
}

export interface Node {
  name: string;
  partition: string;
  gpus: Gpu[];
  drained: boolean;
  drainReason?: string;
  nvlinkUp: boolean;
  /** GPU index whose NVLink failed, for nvidia-smi nvlink output. */
  nvlinkFaultGpu?: number;
  ibUp: boolean;
  dmesg: { t: number; text: string }[];
  procs: Proc[];
}

export type JobState = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";

export interface Job {
  id: number;
  name: string;
  user: string;
  partition: string;
  nodesReq: number;
  gpusPerNode: number;
  exclude: string[];
  scriptPath: string;
  config: TrainConfig;
  env: Record<string, string>;
  state: JobState;
  reason: string;
  exitCode: string;
  nodes: string[];
  submitT: number;
  startT: number;
  endT: number;
  phase: "init" | "train";
  steps: number;
  lastCkpt: number;
  estimate?: StepEstimate;
  log: string[];
  /** Sim time at which a stalled collective times out (inter-node link failure). */
  ncclStallSince?: number;
  warnings: string[];
  errors: string[];
}

export interface Service {
  node: string;
  user: string;
  description: string;
  active: boolean;
  enabled: boolean;
  exposed: boolean;
  pid: number;
  log: string[];
}

export interface Security {
  enabled: boolean;
  lockedUsers: string[];
  crontabs: Record<string, string[]>;
  services: Record<string, Service>;
  authLog: string[];
  minerRespawns: number;
  /** Sim time since which no miner process has been running (null while one is running). */
  minerClearSince: number | null;
}

export interface Alert {
  key: string;
  rule: string;
  severity: "critical" | "warning" | "info";
  target: string;
  message: string;
  firstT: number;
  lastT: number;
  active: boolean;
}

export interface Sample {
  t: number;
  utilAvg: number;
  powerKW: number;
  tokensPerSec: number;
  mfu: number;
  maxTemp: number;
}

export interface Accounting {
  kWh: number;
  usd: number;
  kgCo2: number;
  gpuSeconds: number;
}

export interface ShellState {
  host: string;
  user: string;
  history: string[];
}

export interface ClusterState {
  t: number;
  gpuModel: GpuModelId;
  fabric: FabricId;
  partitions: string[];
  nodes: Node[];
  jobs: Job[];
  nextJobId: number;
  files: Record<string, string>;
  security: Security;
  alerts: Alert[];
  history: Sample[];
  acct: Accounting;
  shell: ShellState;
  /** Free-form flags missions can read (e.g. which commands were used). */
  flags: Record<string, number | string | boolean>;
}

export type FaultKind = "thermal" | "xid79" | "nvlink" | "ib" | "ecc" | "miner";

export interface Fault {
  kind: FaultKind;
  node: string;
  gpu?: number;
}

export type Action =
  | { t: number; kind: "cmd"; line: string }
  | { t: number; kind: "write"; path: string; content: string }
  | { t: number; kind: "fault"; fault: Fault };
