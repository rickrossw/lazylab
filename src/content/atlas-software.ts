import type { AtlasEntry } from "./atlas";

export const SOFTWARE: AtlasEntry[] = [
  {
    slug: "cuda-stack",
    title: "The CUDA software stack",
    category: "Software stack",
    summary: "Kernel driver → user-mode driver → CUDA runtime → libraries → frameworks. Version mismatches live at every seam.",
    body: `From the bottom up:

1. **Kernel module** (\`nvidia.ko\` and friends). It owns the hardware, memory management (including Unified Memory / UVM), interrupts and error reporting. NVIDIA publishes an **open-source** version, *open-gpu-kernel-modules*, the default for Turing and newer GPUs. The [[xid-errors|Xid]] messages you read in \`dmesg\` come from here.
2. **User-mode driver** (\`libcuda.so\`): the CUDA *driver API*, shipped with the driver.
3. **CUDA runtime and toolkit** (\`libcudart\`, \`nvcc\`): what applications compile against.
4. **Libraries**: cuBLAS, cuDNN, [[nccl|NCCL]], CUTLASS.
5. **Frameworks**: PyTorch, JAX, plus higher-level tooling.

**Compatibility rule**: a newer driver runs older CUDA runtimes, but not the reverse. \`nvidia-smi\` prints the driver version and the *maximum* CUDA version it supports. Containers bundle their own runtime but must use the host's driver, injected by the NVIDIA Container Toolkit. See [[containers-and-gpus]].`,
    related: ["containers-and-gpus", "xid-errors", "nccl", "cuda-streams"],
    sources: ["ogkm", "cudaGuide", "containerToolkit"],
    track: "running",
  },
  {
    slug: "cuda-streams",
    title: "CUDA streams & async execution",
    category: "Software stack",
    summary: "Queues of GPU work that let copies, kernels and communication overlap instead of waiting on each other.",
    body: `A **stream** is an ordered queue of GPU operations. Work in different streams can run concurrently: a host-to-device copy in one, a kernel in another, an NCCL collective in a third. **Events** express dependencies between streams without blocking the CPU.

This is the mechanism behind every "overlap" optimization:
- Gradient all-reduce overlapping with the backward pass in [[data-parallelism|DDP]] uses a separate communication stream.
- Prefetching the next batch while the current one computes (see [[input-pipeline]]).
- ZeRO-3/FSDP prefetching the next layer's parameters (see [[zero-fsdp]]).

Projects such as **grCUDA** go further. They build the dependency graph from the data each kernel touches and schedule independent kernels on separate streams automatically, so polyglot programs get concurrency without hand-written stream code.

*Pitfall*: any implicit synchronization (\`cudaDeviceSynchronize\`, \`.item()\` in PyTorch, pageable memory copies) collapses your carefully built overlap back into serial execution.`,
    related: ["data-parallelism", "input-pipeline", "zero-fsdp", "cuda-stack"],
    sources: ["grcuda", "cudaGuide", "cudaBest"],
    track: "optimization",
  },
  {
    slug: "nccl",
    title: "NCCL",
    category: "Software stack",
    summary: "NVIDIA's collective communication library: topology-aware all-reduce, all-gather and friends over NVLink, PCIe and RDMA.",
    body: `NCCL ("nickel") implements the collectives distributed training runs on: all-reduce, all-gather, reduce-scatter, broadcast and send/recv. It discovers the topology (NVLink, NVSwitch, PCIe, NICs) and builds **rings** and **trees** to use it. See [[all-reduce]].

**Environment variables worth knowing**
- \`NCCL_DEBUG=INFO\` prints the chosen transport and channels. Read it.
- \`NCCL_IB_DISABLE=1\` forces TCP sockets instead of InfiniBand. It's useful on laptops and a disaster in production.
- \`NCCL_SOCKET_IFNAME\` / \`NCCL_IB_HCA\` select interfaces.

**Diagnosing**
- \`all_reduce_perf\` from *nccl-tests* measures achievable *bus bandwidth*. Run it on idle nodes to catch bad links before users do.
- Hung collectives end with a PyTorch **watchdog timeout**. The cause is usually one bad rank: a dead link, a lost GPU or a [[stragglers|straggler]] that stopped responding.`,
    related: ["all-reduce", "infiniband", "nvlink", "data-parallelism"],
    sources: ["nccl", "dtbook"],
    track: "running",
  },
  {
    slug: "slurm",
    title: "Slurm",
    category: "Software stack",
    summary: "The batch scheduler that runs most HPC and many AI clusters: partitions, jobs, allocations and node states.",
    body: `Slurm turns a pile of servers into a shared machine. Key concepts:

- **Partitions**: named groups of nodes with limits (\`sinfo\` lists them).
- **Jobs** are submitted with \`sbatch script.sh\`. \`#SBATCH\` lines in the script request resources: \`--nodes\`, \`--gpus-per-node\`, \`--time\`, \`--partition\`.
- **Allocation**: the scheduler picks nodes (backfill, priority, [[fair-share]]) and runs the script on the first one. \`srun\` launches tasks across the rest.
- **Node states**: \`idle\`, \`alloc\`, \`drain\` (finish current work, take no new work) and \`down\`.

**Daily operator commands**
\`\`\`
squeue --me                       # what's running / pending and why
sacct                             # history with exit codes
scontrol show job <id>            # everything about a job
scontrol update NodeName=node-3 State=DRAIN Reason="gpu5 fan"
sinfo -R                          # why nodes are drained
scontrol requeue <id>             # restart a job (from its checkpoint)
\`\`\`
Draining with a clear reason is the polite way to say "this hardware is suspect" without killing anyone's job.`,
    related: ["fair-share", "checkpointing", "kubernetes-gpu", "xid-errors"],
    sources: ["slurm"],
    track: "running",
  },
  {
    slug: "kubernetes-gpu",
    title: "Kubernetes & the GPU Operator",
    category: "Software stack",
    summary: "Running GPU workloads on Kubernetes: device plugins, the GPU Operator, MIG profiles and gang scheduling.",
    body: `Kubernetes doesn't know about GPUs by default. The **NVIDIA device plugin** advertises \`nvidia.com/gpu\` as a schedulable resource. The **GPU Operator** installs and manages the whole stack as containers: driver, container toolkit, device plugin, [[dcgm|DCGM exporter]] and MIG manager.

**Differences from [[slurm]] that matter for training**
- Kubernetes schedules *pods* one at a time. Distributed training needs **gang scheduling** (all-or-nothing), provided by add-ons such as Kueue or Volcano.
- Topology awareness (same rack, same NVLink domain) needs extra configuration.
- It excels at mixed fleets: inference services, notebooks and CI next to batch jobs, often on [[mig|MIG]] slices.

Many organizations run both: Slurm for large training, Kubernetes for everything else, sometimes on the same hardware.`,
    related: ["slurm", "mig", "containers-and-gpus", "multi-tenancy"],
    sources: ["gpuOperator"],
    track: "running",
  },
  {
    slug: "containers-and-gpus",
    title: "Containers & GPUs",
    category: "Software stack",
    summary: "How containers get GPU access: the host driver, injected device nodes and the NVIDIA Container Toolkit.",
    body: `A container image carries the CUDA *runtime* and libraries, but the GPU *driver* must come from the host (it's a kernel module). The **NVIDIA Container Toolkit** bridges the two. At start it mounts the driver's user-space libraries and the \`/dev/nvidia*\` device nodes into the container.

**Practical rules**
- Pin images to a CUDA version the host driver supports (see [[cuda-stack]]).
- HPC sites often use **Enroot/Pyxis** or **Apptainer** with Slurm. They run images unprivileged, which is a big security win.
- Never run training containers \`--privileged\`. Device access should be granted narrowly by the runtime.

**Security angle**: the device nodes *are* the GPU. Anything that can open \`/dev/nvidia*\` outside the scheduler's control can use the GPU. That's exactly how an unauthorized miner hides in plain sight. See [[cryptojacking]] and [[multi-tenancy]].`,
    related: ["cuda-stack", "kubernetes-gpu", "multi-tenancy", "cryptojacking"],
    sources: ["containerToolkit", "gpuOperator"],
    track: "security",
  },
];
