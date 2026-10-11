// Hardware and model catalog. Numbers are public datasheet figures (dense, no sparsity),
// rounded. They drive analytical models that aim to be directionally correct, not cycle-accurate.

export type GpuModelId = "H100" | "A100" | "L40S";

export interface GpuSpec {
  id: GpuModelId;
  name: string;
  memGB: number;
  memBwGBs: number;
  bf16TFLOPs: number;
  fp8TFLOPs: number;
  fp32TFLOPs: number;
  tdpW: number;
  idleW: number;
  maxClockMHz: number;
  /** Per-GPU NVLink bandwidth (one direction), GB/s. 0 means PCIe only. */
  nvlinkGBs: number;
  pcieGBs: number;
  smCount: number;
  priceUsd: number;
  migSlices: number;
}

export const GPUS: Record<GpuModelId, GpuSpec> = {
  H100: {
    id: "H100",
    name: "H100 SXM 80GB",
    memGB: 80,
    memBwGBs: 3350,
    bf16TFLOPs: 989,
    fp8TFLOPs: 1979,
    fp32TFLOPs: 67,
    tdpW: 700,
    idleW: 70,
    maxClockMHz: 1980,
    nvlinkGBs: 450,
    pcieGBs: 64,
    smCount: 132,
    priceUsd: 30000,
    migSlices: 7,
  },
  A100: {
    id: "A100",
    name: "A100 SXM 80GB",
    memGB: 80,
    memBwGBs: 2039,
    bf16TFLOPs: 312,
    fp8TFLOPs: 312,
    fp32TFLOPs: 19.5,
    tdpW: 400,
    idleW: 50,
    maxClockMHz: 1410,
    nvlinkGBs: 300,
    pcieGBs: 32,
    smCount: 108,
    priceUsd: 15000,
    migSlices: 7,
  },
  L40S: {
    id: "L40S",
    name: "L40S 48GB (PCIe)",
    memGB: 48,
    memBwGBs: 864,
    bf16TFLOPs: 362,
    fp8TFLOPs: 733,
    fp32TFLOPs: 91.6,
    tdpW: 350,
    idleW: 40,
    maxClockMHz: 2520,
    nvlinkGBs: 0,
    pcieGBs: 32,
    smCount: 142,
    priceUsd: 9000,
    migSlices: 0,
  },
};

export type FabricId = "IB-NDR" | "RoCE-400" | "ETH-100";

export interface FabricSpec {
  id: FabricId;
  name: string;
  /** Effective per-GPU inter-node bandwidth (one NIC per GPU, rail-optimized), GB/s. */
  perGpuGBs: number;
  latencyUs: number;
  costPerNodeUsd: number;
}

export const FABRICS: Record<FabricId, FabricSpec> = {
  "IB-NDR": { id: "IB-NDR", name: "InfiniBand NDR 400G", perGpuGBs: 48, latencyUs: 2, costPerNodeUsd: 32000 },
  "RoCE-400": { id: "RoCE-400", name: "RoCE v2 400GbE", perGpuGBs: 42, latencyUs: 4, costPerNodeUsd: 20000 },
  "ETH-100": { id: "ETH-100", name: "Ethernet 100GbE (TCP)", perGpuGBs: 10, latencyUs: 25, costPerNodeUsd: 5000 },
};

/** Bandwidth NCCL gets when it falls back to TCP sockets on the management network. */
export const SOCKET_FALLBACK_GBS = 3;

export type ModelId = "7b" | "13b" | "70b";

export interface ModelSpec {
  id: ModelId;
  name: string;
  params: number;
  layers: number;
  hidden: number;
  heads: number;
}

export const MODELS: Record<ModelId, ModelSpec> = {
  "7b": { id: "7b", name: "Llama-style 7B", params: 6.7e9, layers: 32, hidden: 4096, heads: 32 },
  "13b": { id: "13b", name: "Llama-style 13B", params: 13e9, layers: 40, hidden: 5120, heads: 40 },
  "70b": { id: "70b", name: "Llama-style 70B", params: 70e9, layers: 80, hidden: 8192, heads: 64 },
};

export const GPUS_PER_NODE = 8;

/** Facility and accounting constants used by the "responsible ops" scoring. */
export const FACILITY = {
  pue: 1.3,
  hostWattsPerNode: 1200,
  usdPerKWh: 0.12,
  usdPerGpuHour: 2.5,
  kgCo2PerKWh: 0.38,
  ambientC: 28,
};
