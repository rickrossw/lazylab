// Analytical performance models. Each formula is simple enough to show a learner in a debrief.
//
// References:
//  - Roofline: Williams, Waterman & Patterson, "Roofline", CACM 2009.
//  - Training FLOPs ~ 6 * params * tokens, MFU definition: Chowdhery et al., PaLM (2022).
//  - Activation memory (34*s*b*h per layer with flash attention): Korthikanti et al. (2022).
//  - ZeRO stages: Rajbhandari et al. (2020).
//  - Ring all-reduce alpha-beta cost: see "Distributed Training" (ttsugriy.github.io/distributed-training-book).

import { GPUS, MODELS, type GpuSpec, type ModelId, type GpuModelId } from "./hardware";

export type Precision = "fp32" | "bf16" | "fp8";

export interface TrainConfig {
  model: ModelId;
  precision: Precision;
  microBatch: number;
  seqLen: number;
  gradAccum: number;
  tp: number;
  pp: number;
  zero: 0 | 1 | 2 | 3;
  overlap: boolean;
  ckpt: boolean;
  workers: number;
}

export const DEFAULT_TRAIN_CONFIG: TrainConfig = {
  model: "7b",
  precision: "bf16",
  microBatch: 2,
  seqLen: 4096,
  gradAccum: 4,
  tp: 1,
  pp: 1,
  zero: 1,
  overlap: true,
  ckpt: false,
  workers: 8,
};

export interface Placement {
  gpu: GpuModelId;
  numGpus: number;
  gpusPerNode: number;
  /** Per-GPU inter-node bandwidth, GB/s. */
  interGBs: number;
  /** Per-GPU intra-node bandwidth (NVLink or PCIe), GB/s. */
  intraGBs: number;
  /** Slowest GPU clock as a fraction of max (thermal or power throttling). */
  clockFactor: number;
}

export interface MemoryBreakdown {
  weightsGB: number;
  gradsGB: number;
  optimizerGB: number;
  activationsGB: number;
  overheadGB: number;
  totalGB: number;
  capacityGB: number;
}

export interface StepEstimate {
  ok: boolean;
  error?: string;
  oom: boolean;
  mem: MemoryBreakdown;
  dp: number;
  computeMs: number;
  tpCommMs: number;
  dpCommMs: number;
  exposedCommMs: number;
  bubbleFrac: number;
  dataMs: number;
  stepMs: number;
  tokensPerStep: number;
  tokensPerSec: number;
  mfu: number;
  /** Fraction of the step the slowest GPU spends busy (compute + TP comm). */
  busyFrac: number;
  bottleneck: "compute" | "communication" | "data" | "pipeline";
}

const GB = 1e9;
/** Tokens per second a single dataloader worker can tokenize and collate. */
export const TOKENS_PER_WORKER_PER_SEC = 8000;
const FRAMEWORK_OVERHEAD_GB = 3;
const OPTIMIZER_STEP_MS = 5;

export function bytesPerParam(precision: Precision): number {
  return precision === "fp32" ? 4 : 2;
}

export function estimateMemory(cfg: TrainConfig, gpu: GpuSpec, dp: number): MemoryBreakdown {
  const m = MODELS[cfg.model];
  const shard = cfg.tp * cfg.pp;
  const p = m.params / shard;
  const wb = bytesPerParam(cfg.precision);
  // Adam: fp32 master copy + m + v for mixed precision; m + v only when training in fp32.
  const ob = cfg.precision === "fp32" ? 8 : 12;
  const weightsGB = (p * wb) / (cfg.zero >= 3 ? dp : 1) / GB;
  const gradsGB = (p * wb) / (cfg.zero >= 2 ? dp : 1) / GB;
  const optimizerGB = (p * ob) / (cfg.zero >= 1 ? dp : 1) / GB;
  const sbh = cfg.seqLen * cfg.microBatch * m.hidden;
  const actScale = cfg.precision === "fp32" ? 2 : 1;
  const fullLayer = (34 * sbh * actScale) / cfg.tp;
  // With 1F1B pipelining the first stage holds ~pp microbatches of layers/pp layers each,
  // so activation memory per GPU stays ~ layers * per-layer cost.
  const activationsGB = cfg.ckpt
    ? (m.layers * 2 * sbh * actScale) / cfg.tp / GB + fullLayer / GB
    : (m.layers * fullLayer) / GB;
  const totalGB = weightsGB + gradsGB + optimizerGB + activationsGB + FRAMEWORK_OVERHEAD_GB;
  return {
    weightsGB,
    gradsGB,
    optimizerGB,
    activationsGB,
    overheadGB: FRAMEWORK_OVERHEAD_GB,
    totalGB,
    capacityGB: gpu.memGB,
  };
}

export function peakTFLOPs(gpu: GpuSpec, precision: Precision): number {
  if (precision === "fp32") return gpu.fp32TFLOPs;
  // FP8 only accelerates the matmuls; attention, norms and optimizer stay in higher precision.
  if (precision === "fp8") return Math.min(gpu.fp8TFLOPs, gpu.bf16TFLOPs * 1.5);
  return gpu.bf16TFLOPs;
}

/** Ring all-reduce time (ms) for `bytes` across `n` ranks: 2(n-1)/n * bytes/bw + 2(n-1) * alpha. */
export function ringAllReduceMs(bytes: number, n: number, bwGBs: number, alphaUs = 10): number {
  if (n <= 1) return 0;
  return ((2 * (n - 1)) / n) * (bytes / (bwGBs * GB)) * 1000 + (2 * (n - 1) * alphaUs) / 1000;
}

/** Tree (double binary tree) all-reduce: bandwidth term ~ 2*bytes/bw, latency term ~ 2*log2(n) * alpha. */
export function treeAllReduceMs(bytes: number, n: number, bwGBs: number, alphaUs = 10): number {
  if (n <= 1) return 0;
  return 2 * (bytes / (bwGBs * GB)) * 1000 + (2 * Math.ceil(Math.log2(n)) * alphaUs) / 1000;
}

/** Roofline: attainable TFLOP/s for a kernel with arithmetic intensity `ai` (FLOPs/byte). */
export function rooflineTFLOPs(gpu: GpuSpec, ai: number, precision: Precision = "bf16"): number {
  return Math.min(peakTFLOPs(gpu, precision), (ai * gpu.memBwGBs) / 1000);
}

export function estimateStep(cfg: TrainConfig, place: Placement): StepEstimate {
  const gpu = GPUS[place.gpu];
  const m = MODELS[cfg.model];
  const shard = cfg.tp * cfg.pp;
  const empty: StepEstimate = {
    ok: false,
    oom: false,
    mem: estimateMemory(cfg, gpu, 1),
    dp: 0,
    computeMs: 0,
    tpCommMs: 0,
    dpCommMs: 0,
    exposedCommMs: 0,
    bubbleFrac: 0,
    dataMs: 0,
    stepMs: 0,
    tokensPerStep: 0,
    tokensPerSec: 0,
    mfu: 0,
    busyFrac: 0,
    bottleneck: "compute",
  };
  if (place.numGpus % shard !== 0) {
    return { ...empty, error: `world size ${place.numGpus} is not divisible by tp*pp = ${shard}` };
  }
  if (m.layers % cfg.pp !== 0) {
    return { ...empty, error: `${m.layers} layers cannot be split evenly into ${cfg.pp} pipeline stages` };
  }
  if (m.heads % cfg.tp !== 0) {
    return { ...empty, error: `${m.heads} attention heads cannot be split across tp=${cfg.tp}` };
  }
  const dp = place.numGpus / shard;
  const mem = estimateMemory(cfg, gpu, dp);
  const oom = mem.totalGB > gpu.memGB;

  const tokensPerRankStep = cfg.microBatch * cfg.seqLen * cfg.gradAccum;
  const tokensPerStep = tokensPerRankStep * dp;
  const modelFlopsPerStep = 6 * m.params * tokensPerStep;
  const hwFlopsPerStep = modelFlopsPerStep * (cfg.ckpt ? 4 / 3 : 1);

  // Kernel efficiency: big GEMMs get ~72% of peak; small micro-batches and narrow TP shards less.
  const mbEff = 1 - 0.5 * Math.exp(-(cfg.microBatch * cfg.seqLen) / 4096);
  const tpAcrossNodes = cfg.tp > place.gpusPerNode;
  const tpEff = 1 - 0.04 * Math.log2(cfg.tp);
  const widthEff = m.hidden / cfg.tp < 1024 ? 0.8 : 1;
  const eff = 0.72 * mbEff * tpEff * widthEff;
  const peak = peakTFLOPs(gpu, cfg.precision) * 1e12;
  const computeMs = (hwFlopsPerStep / (place.numGpus * peak * eff * place.clockFactor)) * 1000;

  // Tensor parallel: 4 all-reduces of the activations per layer per microbatch (2 fwd, 2 bwd).
  const tpBw = tpAcrossNodes ? place.interGBs : place.intraGBs;
  const actBytes = cfg.seqLen * cfg.microBatch * m.hidden * bytesPerParam(cfg.precision);
  const tpCommMs =
    cfg.tp > 1
      ? (m.layers / cfg.pp) * 4 * ringAllReduceMs(actBytes, cfg.tp, tpBw, tpAcrossNodes ? 20 : 5) * cfg.gradAccum
      : 0;

  // Pipeline bubble for 1F1B: (pp-1) / (microbatches + pp - 1).
  const bubbleFrac = cfg.pp > 1 ? (cfg.pp - 1) / (cfg.gradAccum + cfg.pp - 1) : 0;

  // Data parallel gradient sync once per step. ZeRO-3 also all-gathers the sharded parameters
  // before every forward and backward pass, i.e. twice per micro-batch.
  const gradBytes = (m.params / shard) * bytesPerParam(cfg.precision);
  const multiNode = place.numGpus > place.gpusPerNode;
  const dpBw = multiNode ? place.interGBs : place.intraGBs;
  let dpCommMs = ringAllReduceMs(gradBytes, dp, dpBw, multiNode ? 20 : 5);
  if (cfg.zero >= 3 && dp > 1) {
    const allGatherMs = ((dp - 1) / dp) * (gradBytes / (dpBw * GB)) * 1000;
    dpCommMs += 2 * cfg.gradAccum * allGatherMs;
  }
  // With overlap, gradient buckets are reduced while backward (~2/3 of compute) still runs.
  const exposedCommMs = cfg.overlap ? Math.max(dpCommMs * 0.15, dpCommMs - computeMs * 0.66) : dpCommMs;

  const pipeMs = (computeMs + tpCommMs) / (1 - bubbleFrac);
  const trainMs = pipeMs + exposedCommMs + OPTIMIZER_STEP_MS;
  const dataMs = (tokensPerRankStep / (Math.max(cfg.workers, 0.25) * TOKENS_PER_WORKER_PER_SEC)) * 1000;
  const stepMs = Math.max(trainMs, dataMs);

  const mfu = modelFlopsPerStep / ((stepMs / 1000) * place.numGpus * gpu.bf16TFLOPs * 1e12);
  const busyFrac = Math.min(1, (computeMs + tpCommMs) / stepMs);

  let bottleneck: StepEstimate["bottleneck"] = "compute";
  if (dataMs >= trainMs) bottleneck = "data";
  else if (exposedCommMs + tpCommMs > computeMs * 0.5) bottleneck = "communication";
  else if (bubbleFrac > 0.25) bottleneck = "pipeline";

  return {
    ok: !oom,
    error: oom ? `CUDA out of memory: needs ${mem.totalGB.toFixed(1)} GiB per GPU, ${gpu.memGB} GiB available` : undefined,
    oom,
    mem,
    dp,
    computeMs,
    tpCommMs,
    dpCommMs,
    exposedCommMs,
    bubbleFrac,
    dataMs,
    stepMs,
    tokensPerStep,
    tokensPerSec: tokensPerStep / (stepMs / 1000),
    mfu,
    busyFrac,
    bottleneck,
  };
}

/** Power model: returns the clock factor and the power drawn for a GPU at `util` under a power limit. */
export function powerModel(gpu: GpuSpec, util: number, limitW: number): { clockFactor: number; powerW: number } {
  const demand = gpu.idleW + (gpu.tdpW - gpu.idleW) * util;
  if (demand <= limitW) return { clockFactor: 1, powerW: demand };
  // Clocks fall faster than power: dynamic power ~ f * V^2, so perf ~ (power ratio)^0.4.
  const ratio = (limitW - gpu.idleW) / (demand - gpu.idleW);
  return { clockFactor: Math.max(0.3, Math.pow(Math.max(ratio, 0.01), 0.4)), powerW: limitW };
}

/** Amdahl-style scaling with a per-doubling communication cost. Returns speedup at n workers. */
export function scalingSpeedup(n: number, serialFrac: number, commFracPerDoubling: number): number {
  const parallel = (1 - serialFrac) / n;
  const comm = n > 1 ? commFracPerDoubling * Math.log2(n) : 0;
  return 1 / (serialFrac + parallel + comm);
}
