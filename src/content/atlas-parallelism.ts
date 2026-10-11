import type { AtlasEntry } from "./atlas";

export const PARALLELISM: AtlasEntry[] = [
  {
    slug: "data-parallelism",
    title: "Data parallelism (DDP)",
    category: "Parallelism",
    summary: "Every GPU holds a full model replica, processes different data and averages gradients each step.",
    body: `The simplest way to scale: replicate the model on *N* GPUs, give each a different slice of the batch, then **all-reduce the gradients** so every replica takes the same optimizer step.

**Cost**: one all-reduce of the full gradient (2 bytes × params in BF16) per step. With [[all-reduce|ring all-reduce]] the per-GPU traffic is ~2× the gradient size, *independent of N*. That's why data parallelism scales so well.

**Making it fast**
- **Overlap**: DDP buckets gradients and all-reduces each bucket as soon as backward produces it, hiding communication behind compute (see [[cuda-streams]]).
- **Gradient accumulation**: run several micro-batches before syncing. You get a bigger global batch with the same memory and fewer syncs per token.

**Limit**: every GPU must hold the *whole* model state. Once that stops fitting, see [[zero-fsdp]], [[tensor-parallelism]] and [[pipeline-parallelism]].`,
    related: ["all-reduce", "zero-fsdp", "tensor-parallelism", "pipeline-parallelism"],
    sources: ["dtbook", "nccl"],
    track: "optimization",
  },
  {
    slug: "all-reduce",
    title: "All-reduce (ring & tree)",
    category: "Parallelism",
    summary: "Sum a buffer across all ranks and give everyone the result. The collective that data-parallel training lives on.",
    body: `**Ring all-reduce** arranges *n* ranks in a ring and runs two phases (reduce-scatter, then all-gather) of *n−1* steps each. Every rank sends and receives ~2(n−1)/n × the buffer size:

\`\`\`
T_ring ≈ 2(n−1)/n · S/B  +  2(n−1) · α
\`\`\`

where *S* is bytes, *B* is per-link bandwidth and *α* is per-step latency. The bandwidth term barely grows with *n*. The latency term does, which hurts small messages at large scale.

**Tree** algorithms (NCCL's double binary tree) cut the latency term to ~log₂(n) steps and win for small messages and very large rank counts.

**Bus bandwidth**, the number nccl-tests reports, normalizes away the 2(n−1)/n factor, so you can compare it straight to link speed. A healthy NVLink node shows hundreds of GB/s. A node with a degraded link shows PCIe-class numbers.

Use the widget to see how size, rank count and bandwidth trade off.`,
    related: ["nccl", "data-parallelism", "nvlink", "infiniband"],
    sources: ["dtbook", "nccl"],
    widget: "allreduce",
    track: "performance",
  },
  {
    slug: "tensor-parallelism",
    title: "Tensor parallelism",
    category: "Parallelism",
    summary: "Split each layer's matrices across GPUs (Megatron-style). Huge models fit, but every layer needs collectives.",
    body: `Tensor parallelism (TP) shards the weight matrices *inside* each layer. In the Megatron-LM scheme, the first MLP matmul is split by columns and the second by rows, so a layer needs only **one all-reduce in forward and one in backward**. With attention handled the same way, that's ~4 activation all-reduces per transformer layer per micro-batch.

**Trade-offs**
- ✅ Weights, gradients, optimizer state *and* activations shrink by the TP degree.
- ❌ Communication is frequent, latency-sensitive and on the critical path. It mostly can't be hidden.
- ❌ Shards get narrow: hidden/TP too small means small GEMMs and lower [[tensor-core]] efficiency.

**Rule**: keep TP inside the [[nvlink]] domain (TP ≤ 8 on HGX servers). TP=16 across [[infiniband]] is a classic way to waste a cluster.`,
    related: ["pipeline-parallelism", "nvlink", "zero-fsdp", "data-parallelism"],
    sources: ["megatron", "dtbook"],
    track: "optimization",
  },
  {
    slug: "pipeline-parallelism",
    title: "Pipeline parallelism",
    category: "Parallelism",
    summary: "Split the layer stack into stages on different GPUs and stream micro-batches through. Light traffic, but a bubble.",
    body: `Pipeline parallelism (PP) assigns contiguous layers to stages. Stage 1 runs layers 1–20, stage 2 runs 21–40, and so on. Only the activations at stage boundaries cross the network, so PP is comfortable spanning nodes over [[infiniband]].

**The bubble**: at the start and end of each step some stages sit idle while the pipeline fills and drains. With *p* stages and *m* micro-batches per step (1F1B schedule):

\`\`\`
bubble fraction ≈ (p − 1) / (m + p − 1)
\`\`\`

More micro-batches (gradient accumulation) shrink the bubble. Interleaved schedules shrink it further, at the cost of more communication.

**Constraints**: the layer count must divide evenly (or nearly) into stages, and stages should be balanced. The first stage also holds the most in-flight activations.

The classic large-model recipe, **3D parallelism**, combines all three: TP inside the node, PP across a few nodes, [[data-parallelism|DP]] (often with [[zero-fsdp|ZeRO-1]]) across everything else.`,
    related: ["tensor-parallelism", "data-parallelism", "zero-fsdp"],
    sources: ["gpipe", "megatron", "dtbook"],
    track: "optimization",
  },
  {
    slug: "zero-fsdp",
    title: "ZeRO & FSDP",
    category: "Parallelism",
    summary: "Shard optimizer state, gradients and parameters across data-parallel ranks instead of replicating them.",
    body: `Plain [[data-parallelism]] wastes memory: every rank stores identical copies of everything. **ZeRO** (and PyTorch's **FSDP**) shards it:

| Stage | Sharded | Per-GPU state (mixed-precision Adam) |
|---|---|---|
| 0 | nothing | 16 B/param |
| 1 | optimizer states | 4 + 12/N B/param |
| 2 | + gradients | 2 + 14/N B/param |
| 3 / FSDP | + parameters | 16/N B/param |

**The catch with stage 3**: parameters must be **all-gathered** before each layer's forward *and* backward, every micro-batch. For a 70B model that's ~140 GB moved twice per micro-batch. On NVLink that's fine. Over a 400 Gb/s NIC it can dominate the step.

**Practical guidance**
- ZeRO-1 is nearly free and almost always worth it.
- ZeRO-3/FSDP is excellent within a node or on fast fabrics, and for fitting a model that otherwise wouldn't fit.
- At large scale, mix it: TP inside the node, ZeRO-1 or *hybrid sharding* (shard within a node, replicate across nodes).`,
    related: ["data-parallelism", "hbm", "tensor-parallelism", "activation-checkpointing"],
    sources: ["zero", "dtbook"],
    widget: "memory",
    track: "optimization",
  },
  {
    slug: "mixed-precision",
    title: "Mixed precision (BF16, FP8)",
    category: "Parallelism",
    summary: "Do the math in 16- or 8-bit formats on tensor cores and keep an FP32 master copy for stable updates.",
    body: `Mixed-precision training runs forward and backward in a low-precision format and keeps **FP32 master weights** for the optimizer update:

- **BF16** keeps FP32's exponent range, so it rarely needs loss scaling. It's the default on A100/H100.
- **FP16** needs dynamic **loss scaling** to keep small gradients from underflowing.
- **FP8** (H100+) roughly doubles matmul throughput again. Libraries like Transformer Engine manage per-tensor scaling.

**Why it's a big deal**: [[tensor-core|Tensor cores]] deliver ~15× more FLOP/s in BF16 than plain FP32 on H100. Training in FP32 leaves almost all of the GPU idle.

**Memory**: weights and gradients in 2 bytes, plus 12 bytes of FP32 optimizer state (master, Adam m, v) gives the "16 bytes per parameter" rule used throughout the Atlas.`,
    related: ["tensor-core", "mfu", "hbm"],
    sources: ["mixed", "h100"],
    track: "optimization",
  },
  {
    slug: "activation-checkpointing",
    title: "Activation checkpointing",
    category: "Parallelism",
    summary: "Throw away activations during forward and recompute them in backward: trade ~33% more compute for far less memory.",
    body: `Backpropagation needs the activations from the forward pass. For a transformer layer with FlashAttention that's roughly **34 · s · b · h bytes** (sequence × micro-batch × hidden), and it adds up fast. A 7B model at micro-batch 4 needs over 70 GB of activations.

**Checkpointing** (also called *recomputation*) keeps only each layer's input, then re-runs the layer's forward during backward. Cost: an extra forward pass, ~33% more compute (8N instead of 6N FLOPs per token). Benefit: activation memory drops to about **2 · s · b · h bytes per layer**.

**Use it when** activations are what's stopping you from fitting the model or a larger micro-batch. **Turn it off when** memory is fine. It's pure overhead then. Selective checkpointing (only the attention internals) gets most of the savings for a fraction of the cost.

Note that [[mfu|MFU]] deliberately doesn't count recomputed FLOPs, so checkpointing lowers MFU even though the GPU is just as busy.`,
    related: ["hbm", "zero-fsdp", "mfu"],
    sources: ["actRecompute", "dtbook"],
    widget: "memory",
    track: "optimization",
  },
  {
    slug: "roofline",
    title: "Roofline model",
    category: "Performance",
    summary: "Attainable FLOP/s = min(peak compute, arithmetic intensity × memory bandwidth). Tells you which wall you're hitting.",
    body: `Every kernel has an **arithmetic intensity** (AI): FLOPs performed per byte moved from memory. The roofline says:

\`\`\`
attainable FLOP/s = min( peak FLOP/s ,  AI × memory bandwidth )
\`\`\`

Plot it on log-log axes and you get a slanted "memory roof" meeting a flat "compute roof" at the **ridge point**. For an H100 in BF16 that's ~989 TFLOP/s ÷ 3.35 TB/s ≈ **295 FLOPs/byte**.

- Elementwise ops (add, GELU, layer norm) have AI around 1. They're hopelessly memory-bound, so **fuse** them.
- Large matmuls have AI in the thousands. They're compute-bound, and that's where [[tensor-core|tensor cores]] shine.
- Attention without fusion is memory-bound. FlashAttention restructures it to stay on-chip.

The PRACE GPGPU guide uses the same reasoning for HPC kernels: first decide which roof you're under, then optimize for *that* resource.`,
    related: ["hbm", "tensor-core", "memory-coalescing", "mfu"],
    sources: ["roofline", "prace", "modal"],
    widget: "roofline",
    track: "performance",
  },
  {
    slug: "mfu",
    title: "MFU (Model FLOPs Utilization)",
    category: "Performance",
    summary: "Useful model FLOPs per second divided by the hardware's peak. The honest headline number for training efficiency.",
    body: `For dense transformers, training costs about **6 × parameters × tokens** FLOPs (2 forward + 4 backward). MFU compares what you achieved to the theoretical peak:

\`\`\`
MFU = (6 · N · tokens_per_second) / (num_GPUs · peak_FLOP/s)
\`\`\`

It deliberately ignores recomputation from [[activation-checkpointing]] (that's *HFU*, hardware FLOPs utilization), so it only rewards useful work.

**What's good?** 35–55% is typical for well-tuned large-model training on H100-class clusters. Above 60% is excellent.

**What drags it down**: small micro-batches, exposed communication (no overlap), pipeline bubbles, data-loader stalls, [[stragglers]], throttled clocks and plain FP32. The *Feed the Beast* mission walks through these in order.`,
    related: ["tensor-core", "activation-checkpointing", "input-pipeline", "stragglers"],
    sources: ["palm", "dtbook"],
    track: "performance",
  },
  {
    slug: "scaling-efficiency",
    title: "Scaling efficiency",
    category: "Performance",
    summary: "Why 2× the GPUs rarely gives 2× the speed: serial work, communication and synchronization (Amdahl's law and friends).",
    body: `**Amdahl's law**: if a fraction *s* of the work is serial, the speedup on *n* workers is at most 1 / (s + (1−s)/n). Even 5% serial work caps you at 20× speedup.

Distributed training adds **communication that grows with scale**: collective latency terms, cross-rack hops, and the growing chance that *some* GPU is slow (see [[stragglers]]).

**Weak vs strong scaling**
- *Strong scaling*: same problem, more GPUs. Efficiency drops as per-GPU work shrinks.
- *Weak scaling*: grow the batch with the GPU count. Much friendlier, which is why large-batch training exists, within the limits of what still converges.

**Measuring it**: scaling efficiency = (throughput at n) / (n × throughput at 1). Report it alongside [[mfu|MFU]]. A job can scale perfectly and still be inefficient per GPU.`,
    related: ["all-reduce", "stragglers", "mfu", "data-parallelism"],
    sources: ["dtbook", "prace"],
    widget: "scaling",
    track: "performance",
  },
  {
    slug: "memory-coalescing",
    title: "Memory coalescing",
    category: "Performance",
    summary: "When a warp's 32 threads read adjacent addresses, the hardware merges them into a few wide transactions.",
    body: `Global memory is accessed in aligned segments (32-byte sectors, grouped into 128-byte lines). If the 32 threads of a [[warp]] read 32 consecutive 4-byte floats, the hardware serves them with **one** 128-byte transaction. If they read with a large stride, it may need **32** separate transactions, a 32× bandwidth penalty.

**Classic fixes from GPU programming practice (e.g. the PRACE guide)**
- Structure-of-arrays instead of array-of-structures.
- Have thread *i* touch element *i*, not *i × stride*.
- Stage awkward access patterns (transposes, stencils) through **shared memory**, then write out coalesced.
- Watch for shared-memory **bank conflicts** when you do.

Profilers (Nsight Compute) report "sectors per request". Ideal is 4 for 4-byte loads.`,
    related: ["warp", "roofline", "occupancy"],
    sources: ["prace", "cudaBest"],
    track: "optimization",
  },
  {
    slug: "occupancy",
    title: "Occupancy",
    category: "Performance",
    summary: "Resident warps per SM as a fraction of the maximum: the scheduler's pool for hiding latency.",
    body: `Each SM can host a limited number of warps (64 on H100). **Occupancy** is how many are actually resident, limited by each block's use of:

- **Registers** per thread (the register file is shared by all resident warps),
- **Shared memory** per block,
- **Threads** per block and blocks per SM.

Higher occupancy gives the warp scheduler more candidates to switch to while others wait on memory. But it's a means, not a goal. Many fast kernels (big GEMMs, FlashAttention) run at *low* occupancy, using registers and shared memory for data reuse instead.

**Practical approach** (from CUDA and PRACE best practice): use the occupancy calculator or Nsight Compute to see the limiting resource, try a few block sizes (multiples of 32), and measure. Don't assume.`,
    related: ["streaming-multiprocessor", "warp", "memory-coalescing"],
    sources: ["cudaBest", "prace", "modal"],
    track: "optimization",
  },
  {
    slug: "input-pipeline",
    title: "Input pipeline",
    category: "Performance",
    summary: "Reading, decoding and tokenizing data fast enough to keep the GPUs fed: the bottleneck after you fix everything else.",
    body: `Once the model math is fast, the CPU side often becomes the limit: reading shards from storage, decompressing, tokenizing, shuffling and collating batches.

**Symptoms**: GPU utilization saw-tooths, step time doesn't improve when you optimize the model, and logs show time waiting on the next batch.

**Fixes**
- More data-loader workers (processes) per rank, and pinned memory.
- **Prefetching**: prepare batch *k+1* while batch *k* trains (see [[cuda-streams]]).
- Pre-tokenize offline and store packed binary shards. It's the single biggest win for LLM pretraining.
- Make sure the parallel filesystem or object store can deliver the aggregate bandwidth: *GPUs × tokens/s × bytes per token*, plus checkpoint traffic.

The *Feed the Beast* mission shows the bottleneck moving to data loading the moment communication is fixed.`,
    related: ["mfu", "cuda-streams", "checkpointing"],
    sources: ["dtbook"],
    track: "performance",
  },
];
