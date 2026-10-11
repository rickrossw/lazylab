// Cluster "pod designer": estimates capex, facility power and time-to-train for a design choice.

import { FABRICS, FACILITY, GPUS, GPUS_PER_NODE, MODELS, type FabricId, type GpuModelId, type ModelId } from "./hardware";
import { estimateStep, type StepEstimate, type TrainConfig } from "./perf";

export interface Design {
  gpu: GpuModelId;
  nodes: number;
  fabric: FabricId;
}

export interface Workload {
  model: ModelId;
  tokens: number;
}

export interface DesignResult {
  capexUsd: number;
  facilityKW: number;
  days: number;
  energyMWh: number;
  kgCo2: number;
  best?: { config: TrainConfig; est: StepEstimate };
  fits: boolean;
}

const HOST_COST_USD = 60000;

export function evaluateDesign(d: Design, w: Workload): DesignResult {
  const gpu = GPUS[d.gpu];
  const fab = FABRICS[d.fabric];
  const multiNode = d.nodes > 1;
  const capexUsd = d.nodes * (GPUS_PER_NODE * gpu.priceUsd + HOST_COST_USD + (multiNode ? fab.costPerNodeUsd : 0));
  const itKW = (d.nodes * (GPUS_PER_NODE * gpu.tdpW + FACILITY.hostWattsPerNode)) / 1000;
  const facilityKW = itKW * FACILITY.pue;

  let best: DesignResult["best"];
  const m = MODELS[w.model];
  for (const tp of [1, 2, 4, 8]) {
    for (const pp of [1, 2, 4]) {
      if ((d.nodes * GPUS_PER_NODE) % (tp * pp) !== 0 || m.layers % pp !== 0) continue;
      for (const zero of [1, 3] as const) {
        for (const mb of [1, 2, 4]) {
          for (const ckpt of [false, true]) {
            const config: TrainConfig = {
              model: w.model,
              precision: "bf16",
              microBatch: mb,
              seqLen: 4096,
              gradAccum: 2,
              tp,
              pp,
              zero,
              overlap: true,
              ckpt,
              workers: 8,
            };
            const est = estimateStep(config, {
              gpu: d.gpu,
              numGpus: d.nodes * GPUS_PER_NODE,
              gpusPerNode: GPUS_PER_NODE,
              interGBs: fab.perGpuGBs,
              intraGBs: gpu.nvlinkGBs > 0 ? gpu.nvlinkGBs : gpu.pcieGBs,
              clockFactor: 1,
            });
            if (!est.ok) continue;
            if (!best || est.tokensPerSec > best.est.tokensPerSec) best = { config, est };
          }
        }
      }
    }
  }
  if (!best) return { capexUsd, facilityKW, days: Infinity, energyMWh: Infinity, kgCo2: Infinity, fits: false };
  const days = w.tokens / best.est.tokensPerSec / 86400;
  const energyMWh = (facilityKW * days * 24) / 1000;
  return { capexUsd, facilityKW, days, energyMWh, kgCo2: energyMWh * 1000 * FACILITY.kgCo2PerKWh, best, fits: true };
}
