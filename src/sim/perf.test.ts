import { describe, expect, test } from "vitest";
import { DEFAULT_TRAIN_CONFIG, estimateMemory, estimateStep, powerModel, ringAllReduceMs, rooflineTFLOPs, scalingSpeedup } from "./perf";
import { GPUS } from "./hardware";
import { Rng } from "./rng";
import { compressHostList, expandHostList, parseJobScript, tokenize } from "./jobscript";

describe("perf models (hand-computed references)", () => {
  test("ring all-reduce: 2(n-1)/n * bytes / bw", () => {
    // 1 GB over 8 ranks at 100 GB/s: 2*7/8 * 10 ms = 17.5 ms (+ latency 14 * 10us = 0.14 ms)
    expect(ringAllReduceMs(1e9, 8, 100, 10)).toBeCloseTo(17.64, 2);
    expect(ringAllReduceMs(1e9, 1, 100)).toBe(0);
  });

  test("roofline: memory-bound below the ridge point, compute-bound above", () => {
    const h = GPUS.H100;
    const ridge = (h.bf16TFLOPs * 1000) / h.memBwGBs; // ~295 FLOPs/byte
    expect(rooflineTFLOPs(h, 10)).toBeCloseTo(33.5, 1);
    expect(rooflineTFLOPs(h, ridge * 2)).toBe(h.bf16TFLOPs);
  });

  test("memory: mixed-precision Adam is 16 bytes/param before activations", () => {
    const m = estimateMemory({ ...DEFAULT_TRAIN_CONFIG, model: "7b", zero: 0 }, GPUS.H100, 1);
    expect(m.weightsGB + m.gradsGB + m.optimizerGB).toBeCloseTo((6.7e9 * 16) / 1e9, 5);
  });

  test("memory: ZeRO stages shard optimizer, then grads, then weights", () => {
    const base = { ...DEFAULT_TRAIN_CONFIG, model: "7b" as const };
    const z = [0, 1, 2, 3].map((zero) => estimateMemory({ ...base, zero: zero as 0 | 1 | 2 | 3 }, GPUS.H100, 8));
    expect(z[1].optimizerGB).toBeCloseTo(z[0].optimizerGB / 8);
    expect(z[2].gradsGB).toBeCloseTo(z[0].gradsGB / 8);
    expect(z[3].weightsGB).toBeCloseTo(z[0].weightsGB / 8);
  });

  test("step: invalid layouts are rejected", () => {
    const place = { gpu: "H100" as const, numGpus: 12, gpusPerNode: 8, interGBs: 48, intraGBs: 450, clockFactor: 1 };
    expect(estimateStep({ ...DEFAULT_TRAIN_CONFIG, tp: 8 }, place).error).toMatch(/divisible/);
  });

  test("step: a throttled GPU slows the whole step", () => {
    const place = { gpu: "H100" as const, numGpus: 16, gpusPerNode: 8, interGBs: 48, intraGBs: 450, clockFactor: 1 };
    const fast = estimateStep(DEFAULT_TRAIN_CONFIG, place);
    const slow = estimateStep(DEFAULT_TRAIN_CONFIG, { ...place, clockFactor: 0.55 });
    expect(slow.stepMs).toBeGreaterThan(fast.stepMs * 1.5);
    expect(fast.mfu).toBeGreaterThan(0.6);
  });

  test("power: capping saves more power than performance", () => {
    const r = powerModel(GPUS.H100, 1, 500);
    expect(r.powerW).toBe(500);
    expect(r.clockFactor).toBeGreaterThan(500 / 700);
  });

  test("scaling: Amdahl caps speedup", () => {
    expect(scalingSpeedup(1, 0.05, 0)).toBeCloseTo(1);
    expect(scalingSpeedup(1024, 0.05, 0)).toBeLessThan(20);
  });
});

describe("rng and parsing", () => {
  test("rng is deterministic per seed", () => {
    const a = new Rng(42), b = new Rng(42);
    expect([a.next(), a.next()]).toEqual([b.next(), b.next()]);
  });

  test("host lists round-trip", () => {
    expect(expandHostList("node-[1-3,5]")).toEqual(["node-1", "node-2", "node-3", "node-5"]);
    expect(compressHostList(["node-1", "node-2", "node-4"])).toBe("node-[1-2,4]");
  });

  test("tokenizer handles quotes mid-word", () => {
    expect(tokenize('scontrol update NodeName=node-3 Reason="gpu 5 hot"')).toEqual(["scontrol", "update", "NodeName=node-3", "Reason=gpu 5 hot"]);
  });

  test("job script parsing", () => {
    const p = parseJobScript(`#!/bin/bash
#SBATCH -N 2
#SBATCH --gres=gpu:8
#SBATCH -p gpu
export NCCL_IB_DISABLE=1
srun torchrun train.py \\
  --model 70b --tp 8 --pp 2 --zero 1 --no-overlap --bogus`);
    expect(p.sbatch).toMatchObject({ nodes: 2, gpusPerNode: 8, partition: "gpu" });
    expect(p.env.NCCL_IB_DISABLE).toBe("1");
    expect(p.config).toMatchObject({ model: "70b", tp: 8, pp: 2, zero: 1, overlap: false });
    expect(p.warnings.join()).toMatch(/--bogus/);
  });
});
