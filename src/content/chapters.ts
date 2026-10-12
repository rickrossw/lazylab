import type { TrackId } from "@/missions";
import { TRACK_ORDER } from "./levels";

export interface Chapter {
  track: TrackId;
  n: number;
  title: string;
  kicker: string;
  intro: string;
}

const DEFS: Record<TrackId, Omit<Chapter, "track" | "n">> = {
  architecture: {
    title: "Anatomy of a GPU Cluster",
    kicker: "From one streaming multiprocessor to a thousand-GPU fabric",
    intro:
      "Before you can run, tune or secure a cluster you need a mental model of what's inside it. This chapter walks up the hierarchy: the GPU and its SMs, the memory that feeds them, the links between GPUs in a server, and the fabric between servers. Keep one idea in mind throughout: every level is roughly an order of magnitude slower than the one below it, and almost every design decision maps onto that ladder.",
  },
  running: {
    title: "Running Jobs",
    kicker: "Drivers, schedulers and the plumbing that gets work onto GPUs",
    intro:
      "A cluster is only useful if people can get work onto it reliably and fairly. This chapter covers the software stack from kernel driver to framework, the batch scheduler most HPC and AI clusters run on, the communication library that makes multi-GPU training possible, and the habits (checkpoints, fair share) that keep a shared machine healthy.",
  },
  monitoring: {
    title: "Watching the Fleet",
    kicker: "Telemetry, error codes and finding the one broken thing",
    intro:
      "At scale, something is always failing. This chapter is about seeing it: what nvidia-smi and DCGM can tell you, how the driver reports faults through Xid codes, what memory errors mean, and how a single throttled GPU can quietly slow a thousand others.",
  },
  optimization: {
    title: "Making Training Fast",
    kicker: "Kernels, precision and the parallelism zoo",
    intro:
      "This is the longest chapter because it's where the money is. We start inside a single GPU (warps, memory access, tensor cores, precision), then scale out: data parallelism, overlap, memory tricks like checkpointing and ZeRO, and finally tensor and pipeline parallelism, the building blocks of 3D parallelism.",
  },
  performance: {
    title: "Measuring and Scaling",
    kicker: "Rooflines, MFU, collectives and the price of a joule",
    intro:
      "How fast should this be? This chapter gives you the yardsticks: the roofline for kernels, MFU for training runs, the α-β model for collectives and Amdahl for scaling. It ends with the cost that is easiest to ignore, energy, and the simplest lever for it, power capping.",
  },
  security: {
    title: "Securing Shared GPUs",
    kicker: "Isolation, exposed services and incident response",
    intro:
      "GPU clusters are shared, valuable and full of code nobody fully audited, which makes them attractive targets. This chapter covers how GPUs are shared and isolated, how containers get device access, and how the most common abuse (unauthorized mining through an exposed notebook) happens and is contained. Everything here is defensive.",
  },
};

export const CHAPTERS: Chapter[] = TRACK_ORDER.map((track, i) => ({ track, n: i + 1, ...DEFS[track] }));

export function getChapter(track: string): Chapter | undefined {
  return CHAPTERS.find((c) => c.track === track);
}
