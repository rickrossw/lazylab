import type { AtlasEntry } from "./atlas";

export const HARDWARE: AtlasEntry[] = [
  {
    slug: "gpu",
    title: "GPU",
    category: "Hardware",
    summary: "A throughput processor: thousands of simple lanes that hide latency with parallelism instead of caches and prediction.",
    body: `A CPU spends its transistors making *one* thread fast: deep caches, branch prediction, out-of-order execution. A GPU spends them on **many** lanes of arithmetic. It hides memory latency by keeping thousands of threads in flight and switching between them for free.

For ML and HPC that trade is ideal. The work is mostly dense linear algebra, the same operation over huge arrays. A data-center GPU such as the H100 pairs ~130 [[streaming-multiprocessor|streaming multiprocessors]] with [[tensor-core|tensor cores]] and 80 GB of [[hbm|HBM]] at several TB/s.

**What makes a GPU fast in practice**
- Enough parallel work to fill every SM (see [[occupancy]]).
- Arithmetic intensity high enough to be compute-bound, not memory-bound (see [[roofline]]).
- Data that stays on the device. PCIe transfers are ~50× slower than HBM.

In a cluster, the GPU is one node in a hierarchy: GPU → [[nvlink]] within a server → [[infiniband]] between servers. Most cluster engineering is about keeping that hierarchy busy.`,
    related: ["streaming-multiprocessor", "hbm", "tensor-core", "roofline"],
    sources: ["modal", "prace", "cudaGuide"],
    track: "architecture",
  },
  {
    slug: "streaming-multiprocessor",
    title: "Streaming Multiprocessor (SM)",
    category: "Hardware",
    summary: "The GPU's core building block: schedulers, registers, shared memory, CUDA cores and tensor cores.",
    body: `An SM is roughly what a "core" is on a CPU, but built for throughput. Each SM has warp schedulers, a large register file, configurable **shared memory / L1** and execution units: FP32/INT "CUDA cores", special-function units and [[tensor-core|tensor cores]].

A kernel launch is split into **thread blocks**. Each block lands on one SM and stays there. The SM interleaves the [[warp|warps]] of all resident blocks every cycle, so when one warp waits on memory another issues.

**Why you care as an operator**
- SM count × clock sets peak FLOP/s. A GPU throttled to 55% clock (thermal or power) delivers ~55% of the math. See [[power-and-thermals]].
- \`DCGM_FI_PROF_SM_ACTIVE\` and \`SM_OCCUPANCY\` (from [[dcgm]]) tell you whether SMs are actually busy. "GPU utilization" in [[nvidia-smi]] only means *some* kernel was running, not that every SM was.`,
    related: ["warp", "occupancy", "tensor-core", "dcgm"],
    sources: ["modal", "cudaGuide", "prace"],
    track: "architecture",
  },
  {
    slug: "warp",
    title: "Warp & SIMT",
    category: "Hardware",
    summary: "32 threads that execute in lockstep. Divergent branches and scattered memory access cost real performance.",
    body: `NVIDIA GPUs execute threads in groups of **32 called warps**. This is *Single Instruction, Multiple Threads* (SIMT): the warp shares one instruction stream, while each thread has its own registers.

Two consequences dominate kernel performance:

1. **Branch divergence**: if threads in a warp take different paths of an \`if\`, the warp runs *both* paths with lanes masked off. Keep control flow uniform within a warp where you can.
2. **Memory coalescing**: when the 32 threads read adjacent addresses, the hardware merges them into a few wide transactions. Scattered access multiplies memory traffic. See [[memory-coalescing]].

Warps are also the unit the scheduler juggles to hide latency. More resident warps (higher [[occupancy]]) gives it more choices, up to the point where registers and shared memory run out.`,
    related: ["memory-coalescing", "occupancy", "streaming-multiprocessor"],
    sources: ["cudaGuide", "prace", "modal"],
    track: "optimization",
  },
  {
    slug: "tensor-core",
    title: "Tensor Core",
    category: "Hardware",
    summary: "Matrix-multiply-accumulate units that deliver most of a modern GPU's FLOPs, if you feed them the right precision and shapes.",
    body: `Tensor cores compute small matrix products (e.g. 16×16 tiles) in one instruction. On an H100 they deliver ~989 dense BF16 TFLOP/s versus ~67 TFLOP/s of plain FP32. That gap is why [[mixed-precision]] training is the default.

**Getting the FLOPs**
- Use BF16/FP16 (or FP8 with Transformer Engine) for matmuls. FP32 without TF32 never touches them.
- Keep GEMM dimensions large and multiples of 8/16. Tiny micro-batches or very narrow [[tensor-parallelism|tensor-parallel]] shards make small GEMMs that can't saturate the units.
- Keep data flowing from [[hbm]]. Tensor cores are so fast that many ops (normalization, activations, attention softmax) become memory-bound. Kernel fusion such as FlashAttention exists for this.

Model FLOPs Utilization ([[mfu]]) is ultimately a measure of how busy the tensor cores are.`,
    related: ["mixed-precision", "mfu", "roofline", "hbm"],
    sources: ["h100", "modal", "mixed"],
    widget: "roofline",
    track: "optimization",
  },
  {
    slug: "hbm",
    title: "HBM & the memory hierarchy",
    category: "Hardware",
    summary: "High Bandwidth Memory: stacked DRAM next to the GPU die. Its capacity bounds model size and its bandwidth bounds many kernels.",
    body: `High Bandwidth Memory stacks DRAM dies beside the GPU on a silicon interposer. An H100 SXM has 80 GB at ~3.35 TB/s. Below it sit L2 (tens of MB), per-SM shared memory/L1 and registers, each smaller and faster.

**Capacity** is the first wall in large-model training. Mixed-precision Adam needs ~16 bytes per parameter (weights, gradients, FP32 master copy and two moments), *before* activations. A 7B model needs ~107 GB of state alone, more than one GPU holds. That's why [[zero-fsdp|ZeRO/FSDP]], [[tensor-parallelism]] and [[activation-checkpointing]] exist.

**Bandwidth** is the second wall. Any kernel with low arithmetic intensity (elementwise ops, norms, small matmuls) is limited by HBM bandwidth, not FLOPs. See [[roofline]].

Try the calculator below: change the model, ZeRO stage and parallelism and watch the per-GPU footprint against the 80 GB line.`,
    related: ["zero-fsdp", "activation-checkpointing", "roofline", "tensor-parallelism"],
    sources: ["zero", "actRecompute", "modal", "h100"],
    widget: "memory",
    track: "architecture",
  },
  {
    slug: "mig",
    title: "Multi-Instance GPU (MIG)",
    category: "Hardware",
    summary: "Hardware partitioning of one GPU into up to seven isolated instances, each with its own SMs, L2 slices and memory.",
    body: `MIG (A100, H100 and later) splits a GPU into up to **7 instances**. Each gets a dedicated slice of SMs, L2 cache and HBM, with its own memory controllers. Faults and memory pressure in one instance don't leak into another, which makes MIG the strongest of the GPU-sharing options. See [[multi-tenancy]].

Profiles are named by compute slices and memory, e.g. on an 80 GB H100: \`1g.10gb\`, \`2g.20gb\`, \`3g.40gb\`, \`4g.40gb\`, \`7g.80gb\`. Not every combination fits. Placement follows fixed rules about which slices can sit together.

**When to use it**: inference, notebooks and CI workloads that need a fraction of a GPU and *must not* interfere with each other. **When not to**: large training jobs. They want whole GPUs and NVLink, which MIG instances can't use for peer-to-peer.

Play with the partitioner below to see how profiles pack.`,
    related: ["multi-tenancy", "kubernetes-gpu", "gpu"],
    sources: ["mig", "modal"],
    widget: "mig",
    track: "security",
  },
  {
    slug: "power-and-thermals",
    title: "Power & thermals",
    category: "Hardware",
    summary: "GPUs throttle clocks to stay under their power limit and temperature thresholds, and the slowest GPU sets the pace.",
    body: `Every GPU has a **power limit** (TDP; 700 W for H100 SXM) and **thermal thresholds**. When it would exceed either, firmware lowers clocks:

- **SW Power Cap**: drawing the configured limit; clocks drop slightly. Often intentional. See [[power-capping]].
- **HW Slowdown / HW Thermal Slowdown**: an emergency brake, typically from overheating (failed fan, blocked airflow, hot inlet air). Clocks can drop by half.

In synchronous training, one throttled GPU turns into a cluster-wide slowdown. Every collective waits for it. That's a [[stragglers|straggler]].

**Where to look**
- \`nvidia-smi -q -d PERFORMANCE\` shows "Clocks Event Reasons" (formerly *throttle reasons*).
- \`nvidia-smi -q -d TEMPERATURE\` shows current, slowdown and shutdown temperatures.
- [[dcgm]] fields such as \`DCGM_FI_DEV_GPU_TEMP\`, \`DCGM_FI_DEV_POWER_USAGE\` and the clock-throttle bitmask feed alerting.`,
    related: ["stragglers", "power-capping", "nvidia-smi", "dcgm"],
    sources: ["nvsmi", "dcgm"],
    widget: "power",
    track: "monitoring",
  },
  {
    slug: "pcie",
    title: "PCIe",
    category: "Interconnect",
    summary: "The general-purpose bus between CPU, GPU, NIC and NVMe. Ubiquitous, but an order of magnitude slower than NVLink.",
    body: `PCI Express connects GPUs to the host CPU, NICs and storage. A Gen5 x16 link moves ~64 GB/s per direction. Gen4 x16 moves ~32 GB/s. That's plenty for loading data, but slow for GPU-to-GPU traffic during training.

**Why it matters**
- GPUs without [[nvlink]] (e.g. L40S) must do all peer traffic over PCIe, often through the CPU's root complex. [[tensor-parallelism|Tensor parallelism]] suffers badly.
- **GPUDirect RDMA** lets a NIC read and write GPU memory directly over PCIe, skipping host memory. Good servers pair each GPU with a NIC under the same PCIe switch. Check with \`nvidia-smi topo -m\`.
- "Fallen off the bus" ([[xid-errors|Xid 79]]) is literally the GPU disappearing from PCIe.`,
    related: ["nvlink", "infiniband", "xid-errors"],
    sources: ["modal", "prace"],
    track: "architecture",
  },
  {
    slug: "nvlink",
    title: "NVLink",
    category: "Interconnect",
    summary: "NVIDIA's high-bandwidth GPU-to-GPU link: ~450 GB/s per direction per H100, roughly 7× PCIe Gen5.",
    body: `NVLink is a point-to-point interconnect between GPUs. An H100 SXM has 18 NVLink 4 links totalling ~900 GB/s bidirectional (~450 GB/s each way). Through [[nvswitch]], all 8 GPUs in an HGX server talk to each other at full speed.

**Design rule**: put the *chattiest* parallelism on the fastest link. [[tensor-parallelism|Tensor parallelism]] does several all-reduces per layer, so it lives inside the NVLink domain. Data parallelism, which syncs once per step and overlaps with compute, can cross [[infiniband]].

**Failure mode**: NVLink errors appear as [[xid-errors|Xid 74]]. A degraded link forces traffic over PCIe and quietly slows collectives. \`nvidia-smi nvlink -s\` shows per-link status, and \`all_reduce_perf\` (nccl-tests) on an idle node shows the bandwidth drop.`,
    related: ["nvswitch", "tensor-parallelism", "all-reduce", "pcie"],
    sources: ["modal", "nccl", "h100"],
    widget: "allreduce",
    track: "architecture",
  },
  {
    slug: "nvswitch",
    title: "NVSwitch",
    category: "Interconnect",
    summary: "A switch chip that gives every GPU in a server full-bandwidth NVLink to every other GPU.",
    body: `Without a switch, NVLink is point-to-point, so GPUs only connect to a few neighbors. **NVSwitch** builds a non-blocking crossbar: in an HGX H100 server, four NVSwitch chips connect all 8 GPUs all-to-all at full NVLink bandwidth.

Newer systems extend the NVLink domain *beyond* a server (e.g. NVL72 racks), so 72 GPUs act like one large tensor-parallel island. The rule from [[nvlink]] still applies: the bigger the NVLink domain, the larger the tensor-parallel or expert-parallel groups you can run without touching the slower scale-out network.

\`nvidia-smi topo -m\` shows \`NV18\` (18 bonded links) between every GPU pair in an NVSwitch system.`,
    related: ["nvlink", "cluster-topology", "tensor-parallelism"],
    sources: ["modal", "h100"],
    track: "architecture",
  },
  {
    slug: "infiniband",
    title: "InfiniBand & RoCE",
    category: "Interconnect",
    summary: "The scale-out fabric: RDMA networks that move tensors between servers without involving the CPU.",
    body: `Between servers, GPUs talk over a **scale-out network**. Two families dominate:

- **InfiniBand (IB)**: a purpose-built RDMA fabric. NDR runs 400 Gb/s per port with very low latency and credit-based lossless flow control.
- **RoCE v2**: RDMA over Converged Ethernet. Same verbs API over Ethernet. It needs careful configuration (PFC/ECN) to stay lossless, but it's cheaper and familiar to network teams.

Modern training servers attach **one 400G NIC per GPU** (rail-optimized), so each GPU gets ~50 GB/s of scale-out bandwidth via GPUDirect RDMA.

**Ops checklist**
- \`ibstat\` should show every port \`Active\` / \`LinkUp\` at the expected rate.
- [[nccl]] logs \`NET/IB\` when it uses RDMA and \`NET/Socket\` when it fell back to TCP, a classic silent 10× slowdown (often from \`NCCL_IB_DISABLE=1\` or a bad HCA config).
- A port going down mid-job hangs collectives until the NCCL watchdog times out.`,
    related: ["nccl", "cluster-topology", "all-reduce", "nvlink"],
    sources: ["nccl", "dtbook", "modal"],
    track: "architecture",
  },
  {
    slug: "cluster-topology",
    title: "Cluster topology",
    category: "Interconnect",
    summary: "How nodes, switches and links are wired: fat trees, rail-optimized designs, and why oversubscription bites collectives.",
    body: `A GPU cluster network is usually a **fat tree**. Leaf switches connect servers, and spine switches connect leaves. If uplink capacity equals downlink capacity the fabric is **non-blocking** (1:1). Cheaper designs oversubscribe (e.g. 2:1), which is fine for web traffic and painful for all-reduce, where everyone transmits at once.

**Rail-optimized** designs wire NIC *i* of every server to the same leaf switch ("rail *i*"). NCCL's ring and tree algorithms then keep most traffic on one rail, one hop away.

**Rules of thumb**
- The bandwidth hierarchy (HBM ≫ NVLink ≫ IB ≫ storage) should map onto the parallelism hierarchy. See [[tensor-parallelism]], [[pipeline-parallelism]] and [[data-parallelism]].
- Keep spare capacity. A warm spare node turns a hardware failure into a requeue instead of an outage. See [[checkpointing]].
- Power and cooling are topology too. Racks have kW budgets, and liquid cooling changes what fits. See [[energy-and-carbon]].`,
    related: ["infiniband", "nvswitch", "all-reduce", "energy-and-carbon"],
    sources: ["dtbook", "nccl"],
    track: "architecture",
  },
];
