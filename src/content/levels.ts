// The skill map: each track is an ordered path of Atlas concepts (levels) ending in boss missions.
// Every level has a short challenge so mastery means "can use it", not just "has read it".

import type { TrackId } from "@/missions";

export type Question =
  | { kind: "choice"; prompt: string; code?: string; options: string[]; answer: number; explain: string }
  | { kind: "number"; prompt: string; code?: string; answer: number; tolerance: number; unit?: string; explain: string };

export const TRACK_ORDER: TrackId[] = ["architecture", "running", "monitoring", "optimization", "performance", "security"];

export const TRACK_LEVELS: Record<TrackId, string[]> = {
  architecture: ["gpu", "streaming-multiprocessor", "hbm", "pcie", "nvlink", "nvswitch", "infiniband", "cluster-topology"],
  running: ["cuda-stack", "slurm", "nccl", "checkpointing", "kubernetes-gpu", "fair-share"],
  monitoring: ["nvidia-smi", "power-and-thermals", "xid-errors", "ecc-errors", "dcgm", "stragglers"],
  optimization: [
    "warp",
    "memory-coalescing",
    "occupancy",
    "tensor-core",
    "mixed-precision",
    "data-parallelism",
    "cuda-streams",
    "activation-checkpointing",
    "zero-fsdp",
    "tensor-parallelism",
    "pipeline-parallelism",
  ],
  performance: ["roofline", "mfu", "all-reduce", "scaling-efficiency", "input-pipeline", "power-capping", "energy-and-carbon"],
  security: ["containers-and-gpus", "multi-tenancy", "mig", "exposed-notebooks", "cryptojacking", "supply-chain-and-secrets"],
};

/** Boss missions at the end of each track. */
export const TRACK_BOSSES: Record<TrackId, string[]> = {
  architecture: ["pod-design"],
  running: ["first-multinode"],
  monitoring: ["fallen-off-bus", "straggler"],
  optimization: ["mfu-tune", "fit-70b"],
  performance: ["power-cap"],
  security: ["cryptominer"],
};

export const LEVEL_XP = 50;
export const LEVEL_XP_RETRY = 30;

export const CHALLENGES: Record<string, Question[]> = {
  // ------------------------------------------------------------ architecture
  gpu: [
    {
      kind: "choice",
      prompt: "How does a GPU mainly hide memory latency?",
      options: ["Large branch predictors", "Keeping thousands of threads in flight and switching between them", "A bigger L3 cache than CPUs", "Much higher clock speeds"],
      answer: 1,
      explain: "GPUs trade single-thread speed for parallelism: while one warp waits on memory, the scheduler issues another.",
    },
    {
      kind: "choice",
      prompt: "Roughly how much slower is PCIe Gen5 (~64 GB/s) than an H100's HBM (~3,350 GB/s)?",
      options: ["About the same", "~2×", "~50×", "~10,000×"],
      answer: 2,
      explain: "3350 ÷ 64 ≈ 52. That's why data should stay on the device instead of shuttling over PCIe.",
    },
  ],
  "streaming-multiprocessor": [
    {
      kind: "choice",
      prompt: "nvidia-smi reports 100% GPU-Util. What does that actually guarantee?",
      options: ["Every SM is busy", "A kernel was running during the sample window", "Tensor cores are saturated", "Memory bandwidth is maxed out"],
      answer: 1,
      explain: "GPU-Util only means some kernel was active. Use DCGM's SM_ACTIVE / tensor-pipe metrics to measure real saturation.",
    },
    {
      kind: "number",
      prompt: "An H100 is thermally throttled to 55% of its max SM clock. Roughly what percent of its peak FLOP/s can it deliver?",
      answer: 55,
      tolerance: 5,
      unit: "%",
      explain: "Peak FLOP/s = SMs × FLOPs/clock × clock, so throughput scales with clock: ~55%.",
    },
  ],
  hbm: [
    {
      kind: "number",
      prompt: "Mixed-precision Adam needs ~16 bytes per parameter. How many GB of state does a 7-billion-parameter model need, before activations?",
      answer: 112,
      tolerance: 8,
      unit: "GB",
      explain: "7e9 × 16 B = 112 GB, more than an 80 GB GPU holds, which is why we shard (ZeRO) or split (TP/PP).",
    },
    {
      kind: "choice",
      prompt: "A kernel does one addition for every 8 bytes it reads from memory. What limits its speed on an H100?",
      options: ["Tensor core throughput", "HBM bandwidth", "PCIe bandwidth", "Register count"],
      answer: 1,
      explain: "Arithmetic intensity ≈ 0.125 FLOP/byte, far below the ridge point (~295). It's memory-bound.",
    },
  ],
  pcie: [
    {
      kind: "choice",
      prompt: "`nvidia-smi topo -m` shows `SYS` between every pair of GPUs (no NVLink). Which parallelism suffers most?",
      options: ["Data parallel with gradient accumulation", "Tensor parallel", "Independent inference on each GPU", "Data loading"],
      answer: 1,
      explain: "Tensor parallelism needs several all-reduces per layer. Over PCIe through the CPU that becomes the bottleneck.",
    },
    {
      kind: "choice",
      prompt: "Xid 79 says the GPU has \"fallen off the bus\". Which bus?",
      options: ["NVLink", "PCIe", "InfiniBand", "The HBM memory bus"],
      answer: 1,
      explain: "The driver can no longer reach the GPU over PCIe. That's a reboot at minimum, often a hardware ticket.",
    },
  ],
  nvlink: [
    {
      kind: "choice",
      prompt: "Which parallelism should live inside the NVLink domain?",
      options: ["Data parallel", "Tensor parallel", "Pipeline parallel", "None of them"],
      answer: 1,
      explain: "Put the chattiest traffic on the fastest link: TP all-reduces activations every layer.",
    },
    {
      kind: "choice",
      prompt: "Given this output, which Xid would you expect in `dmesg`?",
      code: "$ nvidia-smi nvlink -s -i 2\nGPU 2: NVIDIA H100 80GB HBM3\n\t Link 3: 26.562 GB/s\n\t Link 4: <inactive>\n\t Link 5: 26.562 GB/s",
      options: ["Xid 79", "Xid 74", "Xid 48", "Xid 13"],
      answer: 1,
      explain: "Xid 74 is an NVLink error. Traffic quietly falls back to PCIe and collectives slow down.",
    },
  ],
  nvswitch: [
    {
      kind: "choice",
      prompt: "What does NVSwitch add on top of point-to-point NVLink?",
      options: ["Encryption", "All-to-all, full-bandwidth connectivity between GPUs", "Faster HBM", "Links to other servers over InfiniBand"],
      answer: 1,
      explain: "Without a switch, each GPU links to only a few neighbors. NVSwitch builds a non-blocking crossbar.",
    },
    {
      kind: "choice",
      prompt: "`nvidia-smi topo -m` shows `NV18` between every pair of GPUs. What does 18 mean?",
      options: ["18 GB/s", "18 bonded NVLinks", "18 hops", "NVLink version 18"],
      answer: 1,
      explain: "NV# is the number of bonded NVLinks: 18 on an H100 SXM, about 900 GB/s bidirectional.",
    },
  ],
  infiniband: [
    {
      kind: "choice",
      prompt: "You see this in a multi-node job log. What's happening?",
      code: "NCCL INFO NET/Socket : Using [0]eth0:10.0.1.12<0>\nNCCL INFO NCCL_IB_DISABLE set by environment to 1.",
      options: ["All good: RDMA is in use", "NCCL fell back to TCP sockets, so expect a big slowdown", "NVLink is down", "The job is out of memory"],
      answer: 1,
      explain: "NET/Socket means TCP. Remove NCCL_IB_DISABLE=1 to get NET/IB (RDMA).",
    },
    {
      kind: "choice",
      prompt: "In a rail-optimized H100 server, roughly how much scale-out bandwidth does each GPU get?",
      options: ["~1 GB/s", "~50 GB/s (one 400 Gb/s NIC per GPU)", "~450 GB/s", "~3 TB/s"],
      answer: 1,
      explain: "400 Gb/s ÷ 8 bits = 50 GB/s per GPU, about a ninth of NVLink.",
    },
  ],
  "cluster-topology": [
    {
      kind: "choice",
      prompt: "Why does network oversubscription (e.g. 2:1) hurt training more than web traffic?",
      options: ["Training uses UDP", "During all-reduce every GPU transmits at the same time", "Training needs more storage", "It doesn't"],
      answer: 1,
      explain: "Collectives are bursty and synchronized. Everyone needs full bandwidth at the same moment.",
    },
    {
      kind: "choice",
      prompt: "Order the bandwidth hierarchy, fastest first:",
      options: ["HBM > NVLink > InfiniBand > storage", "NVLink > HBM > storage > InfiniBand", "InfiniBand > NVLink > HBM > storage", "storage > HBM > NVLink > InfiniBand"],
      answer: 0,
      explain: "~3.35 TB/s HBM, ~450 GB/s NVLink, ~50 GB/s per-GPU InfiniBand, then storage. Map parallelism onto it.",
    },
  ],

  // ------------------------------------------------------------ running
  "cuda-stack": [
    {
      kind: "choice",
      prompt: "A container ships the CUDA 12.4 runtime, but the host driver only supports up to CUDA 12.2. What happens?",
      options: [
        "Works fine: newer runtimes always run on older drivers",
        "It will likely fail: the driver must support the runtime's CUDA version (unless forward-compat packages are used)",
        "The container installs its own kernel driver",
        "Only performance drops",
      ],
      answer: 1,
      explain: "A newer driver runs older runtimes, not the reverse. nvidia-smi shows the max CUDA version the driver supports.",
    },
    {
      kind: "choice",
      prompt: "Where do Xid messages come from?",
      options: ["PyTorch", "The NVIDIA kernel driver", "Slurm", "NCCL"],
      answer: 1,
      explain: "The kernel module (open-gpu-kernel-modules) logs them to the kernel log: dmesg / journalctl -k.",
    },
  ],
  slurm: [
    {
      kind: "choice",
      prompt: "Nodes have 8 GPUs and the script asks for `--gpus-per-node=16`. What's the most likely cause of this error?",
      code: "$ sbatch train.sh\nsbatch: error: Batch job submission failed: Requested node configuration is not available",
      options: ["The cluster is busy", "It requests more GPUs per node than any node has", "Wrong Python version", "Out of memory"],
      answer: 1,
      explain: "Slurm rejects requests no node can ever satisfy. Ask for 2 nodes × 8 GPUs instead.",
    },
    {
      kind: "choice",
      prompt: "You suspect node-3's hardware. What's the polite way to take it out of service?",
      options: ["scancel every job on it", 'scontrol update NodeName=node-3 State=DRAIN Reason="gpu5 fan"', "Reboot it immediately", "Delete it from slurm.conf"],
      answer: 1,
      explain: "Drain lets running jobs finish, keeps new ones away, and records why in `sinfo -R`.",
    },
  ],
  nccl: [
    {
      kind: "choice",
      prompt: "Which environment variable makes NCCL print the transport it chose?",
      options: ["NCCL_IB_DISABLE=1", "NCCL_DEBUG=INFO", "CUDA_VISIBLE_DEVICES", "OMP_NUM_THREADS"],
      answer: 1,
      explain: "NCCL_DEBUG=INFO logs NET/IB vs NET/Socket, channels and topology. Read it when a job is slow.",
    },
    {
      kind: "choice",
      prompt: "A job hangs, then dies with a ProcessGroupNCCL watchdog timeout. What's the most likely cause?",
      options: ["Learning rate too high", "One rank stopped responding (dead link, lost GPU, or a straggler)", "Disk full", "Wrong tokenizer"],
      answer: 1,
      explain: "Collectives are barriers. One missing rank stalls everyone until the watchdog fires.",
    },
  ],
  checkpointing: [
    {
      kind: "number",
      prompt: "Young/Daly: interval ≈ √(2 × checkpoint cost × MTBF). A checkpoint takes 2 minutes and MTBF is 4 hours. Interval in minutes?",
      answer: 31,
      tolerance: 3,
      unit: "min",
      explain: "√(2 × 2 × 240) = √960 ≈ 31 minutes.",
    },
    {
      kind: "choice",
      prompt: "A job is requeued after a node failure. Where does it resume?",
      options: ["From step 0", "From the last saved checkpoint", "From exactly where it crashed", "It can't resume"],
      answer: 1,
      explain: "Work since the last checkpoint is lost. That's why the interval matters.",
    },
  ],
  "kubernetes-gpu": [
    {
      kind: "choice",
      prompt: "Distributed training on Kubernetes needs gang scheduling. Why?",
      options: ["To save power", "All workers must start together or not at all, because partial starts deadlock", "For GPU encryption", "To use MIG"],
      answer: 1,
      explain: "Kubernetes schedules pods one by one. Add-ons like Kueue or Volcano provide all-or-nothing placement.",
    },
    {
      kind: "choice",
      prompt: "Which component advertises `nvidia.com/gpu` to the Kubernetes scheduler?",
      options: ["kube-proxy", "The NVIDIA device plugin", "CoreDNS", "etcd"],
      answer: 1,
      explain: "The device plugin (usually installed by the GPU Operator) exposes GPUs as a schedulable resource.",
    },
  ],
  "fair-share": [
    {
      kind: "choice",
      prompt: "Team A used 3× its share last week. Under fair-share scheduling, its new jobs…",
      options: ["are rejected", "get lower priority until the usage decays", "run first", "are preempted immediately"],
      answer: 1,
      explain: "Priority drops with recent usage and recovers as it decays (e.g. a 7-day half-life).",
    },
    {
      kind: "choice",
      prompt: "Preemption works well only if jobs…",
      options: ["use MIG", "checkpoint frequently", "use FP8", "run on one node"],
      answer: 1,
      explain: "A preempted job restarts from its last checkpoint. Rare checkpoints waste a lot of work.",
    },
  ],

  // ------------------------------------------------------------ monitoring
  "nvidia-smi": [
    {
      kind: "choice",
      prompt: "This GPU draws 437 W while its neighbors draw ~650 W at the same job. Which command shows *why*?",
      code: "| N/A   85C    P0             437W / 700W |  70471MiB / 81560MiB |   98%      Default |",
      options: ["nvidia-smi -L", "nvidia-smi -q -d PERFORMANCE", "nvidia-smi topo -m", "nvidia-smi -pl 700"],
      answer: 1,
      explain: "The PERFORMANCE section lists Clocks Event Reasons: power cap, HW slowdown, thermal slowdown.",
    },
    {
      kind: "choice",
      prompt: "Which nvidia-smi flag sets a GPU power limit?",
      options: ["-r", "-pl", "-L", "-q"],
      answer: 1,
      explain: "`sudo nvidia-smi -pl 550` (add `-i <gpu>` for one GPU). -r resets, -L lists, -q queries.",
    },
  ],
  "power-and-thermals": [
    {
      kind: "choice",
      prompt: "What's the most likely cause?",
      code: "    Clocks Event Reasons\n        SW Power Cap                      : Not Active\n        HW Slowdown                       : Active\n            HW Thermal Slowdown           : Active",
      options: ["Someone set a power cap", "Overheating (a failed fan or blocked airflow)", "The GPU is idle", "The driver is too old"],
      answer: 1,
      explain: "HW Thermal Slowdown is the emergency brake for heat. A power cap would show SW Power Cap.",
    },
    {
      kind: "choice",
      prompt: "In synchronous training, one GPU drops to 55% clock. Whole-job throughput becomes roughly…",
      options: ["~99%: the others compensate", "~55–60% of normal", "Unchanged", "Zero"],
      answer: 1,
      explain: "Every collective waits for the slowest GPU, so the whole job runs at the straggler's pace.",
    },
  ],
  "xid-errors": [
    {
      kind: "choice",
      prompt: "You find this in dmesg on node-2. What's the right first response?",
      code: "NVRM: Xid (PCI:0000:9a:00.0): 79, pid='<unknown>', name=<unknown>, GPU has fallen off the bus.",
      options: ["Restart the job on the same node", "Drain the node with the Xid in the reason and requeue the job elsewhere", "Ignore it", "Lower the learning rate"],
      answer: 1,
      explain: "Contain first (drain), recover (requeue from checkpoint), then diagnose the hardware offline.",
    },
    {
      kind: "choice",
      prompt: "Xids 13, 31 and 43 usually point to…",
      options: ["Hardware failure", "The application's code (bad memory access, illegal instruction)", "Network failure", "The power supply"],
      answer: 1,
      explain: "Those are typically user-code faults. Check the job before blaming the GPU.",
    },
  ],
  "ecc-errors": [
    {
      kind: "choice",
      prompt: "`nvidia-smi -q -d ECC` shows Remapped Rows → Pending: Yes. What's needed?",
      options: ["Nothing", "A GPU reset once it's idle", "Replace the HBM immediately", "Reinstall CUDA"],
      answer: 1,
      explain: "Row remapping takes effect at the next reset: drain, wait for jobs, `nvidia-smi -r -i <gpu>`, then run diagnostics.",
    },
    {
      kind: "choice",
      prompt: "Single-bit ECC errors are…",
      options: ["Fatal to the job", "Corrected on the fly and counted", "Only found in CPUs", "Caused by NCCL"],
      answer: 1,
      explain: "A slowly rising count is normal. A rapidly rising one is an early warning.",
    },
  ],
  dcgm: [
    {
      kind: "choice",
      prompt: "Which alert catches both leaked processes and cryptominers?",
      options: ["GPU temperature > 80°C", "GPU busy while the scheduler shows no job on that node", "Disk usage > 90%", "Low fan speed"],
      answer: 1,
      explain: "Compare DCGM utilization with scheduler state. Busy with no job means something is running that shouldn't be.",
    },
    {
      kind: "choice",
      prompt: "A node is back from hardware repair. Before it rejoins the pool, run…",
      options: ["nvidia-smi -L only", "dcgmi diag -r 3", "ping it", "Nothing; it's repaired"],
      answer: 1,
      explain: "Level 3 diagnostics include stress tests. Level 1 is the quick deployment check.",
    },
  ],
  stragglers: [
    {
      kind: "choice",
      prompt: "Which GPU is the straggler?",
      code: "index, utilization.gpu, clocks.sm\n0, 61 %, 1980 MHz\n1, 60 %, 1980 MHz\n5, 99 %, 1089 MHz\n6, 61 %, 1980 MHz",
      options: ["GPU 0", "GPU 5", "None of them", "All of them"],
      answer: 1,
      explain: "Low clock with high utilization: it's the one everyone else is waiting for.",
    },
    {
      kind: "choice",
      prompt: "Why do the healthy GPUs show *lower* utilization during a straggler event?",
      options: ["They are throttled too", "They finish early and wait at the barrier for the slow GPU", "They crashed", "They're busy loading data"],
      answer: 1,
      explain: "Inverted utilization (one pegged, the rest lower) is the classic straggler signature.",
    },
  ],

  // ------------------------------------------------------------ optimization
  warp: [
    {
      kind: "number",
      prompt: "How many threads are in an NVIDIA warp?",
      answer: 32,
      tolerance: 0,
      explain: "32 threads execute in lockstep (SIMT).",
    },
    {
      kind: "choice",
      prompt: "Half the threads in a warp take the `if` branch and half take the `else`. What happens?",
      options: ["Both halves run in parallel at full speed", "The warp runs both paths with lanes masked off, taking roughly 2× the time", "It crashes", "The compiler picks one branch"],
      answer: 1,
      explain: "Branch divergence serializes the paths. Keep control flow uniform within a warp.",
    },
  ],
  "memory-coalescing": [
    {
      kind: "number",
      prompt: "32 threads in a warp read 32 consecutive 4-byte floats. How many 128-byte memory transactions does that need?",
      answer: 1,
      tolerance: 0,
      explain: "32 × 4 = 128 bytes, fully coalesced into one transaction. A large stride could need 32.",
    },
    {
      kind: "choice",
      prompt: "Which data layout helps coalescing when kernels touch one field at a time?",
      options: ["Array of structures", "Structure of arrays", "Linked list", "Hash map"],
      answer: 1,
      explain: "With SoA, thread i reads element i of the same field, so the reads are adjacent.",
    },
  ],
  occupancy: [
    {
      kind: "choice",
      prompt: "What limits how many warps can be resident on an SM?",
      options: ["Registers per thread, shared memory per block, and threads/blocks per SM", "Disk space", "PCIe lanes", "Network bandwidth"],
      answer: 0,
      explain: "The register file and shared memory are split among resident warps.",
    },
    {
      kind: "choice",
      prompt: "Is maximum occupancy always fastest?",
      options: ["Yes, always", "No: many top kernels trade occupancy for data reuse in registers and shared memory"],
      answer: 1,
      explain: "GEMMs and FlashAttention often run at low occupancy. Measure, don't assume.",
    },
  ],
  "tensor-core": [
    {
      kind: "number",
      prompt: "An H100 does ~989 dense BF16 TFLOP/s on tensor cores versus ~67 TFLOP/s plain FP32. Roughly how many times faster?",
      answer: 15,
      tolerance: 1.5,
      unit: "×",
      explain: "989 ÷ 67 ≈ 14.8, which is why training in plain FP32 leaves most of the GPU idle.",
    },
    {
      kind: "choice",
      prompt: "Which of these hurts tensor core efficiency?",
      options: ["Large GEMMs", "Tiny micro-batches and very narrow tensor-parallel shards", "BF16", "Kernel fusion"],
      answer: 1,
      explain: "Small matrices can't fill the tensor core tiles and pipelines.",
    },
  ],
  "mixed-precision": [
    {
      kind: "choice",
      prompt: "Why does BF16 rarely need loss scaling, while FP16 does?",
      options: ["BF16 has more mantissa bits", "BF16 keeps FP32's exponent range", "BF16 is slower", "FP16 isn't supported on H100"],
      answer: 1,
      explain: "BF16's 8-bit exponent matches FP32's range, so small gradients don't underflow.",
    },
    {
      kind: "choice",
      prompt: "In mixed-precision training, what is kept in FP32?",
      options: ["Activations", "Master weights (plus Adam moments) for the optimizer update", "Only gradients", "Nothing"],
      answer: 1,
      explain: "2 B weights + 2 B grads + 12 B FP32 optimizer state gives the 16 bytes/param rule.",
    },
  ],
  "data-parallelism": [
    {
      kind: "choice",
      prompt: "With ring all-reduce, what happens to per-GPU gradient traffic as you add GPUs?",
      options: ["It grows linearly", "It stays roughly constant (~2× the gradient size)", "It shrinks", "It grows quadratically"],
      answer: 1,
      explain: "2(n−1)/n × S approaches 2S. That's why data parallelism scales so well.",
    },
    {
      kind: "choice",
      prompt: "Gradient accumulation lets you…",
      options: ["use less compute", "grow the global batch without more memory, and sync less often per token", "skip the backward pass", "avoid all-reduce entirely"],
      answer: 1,
      explain: "Several micro-batches, one sync. Fewer bytes on the wire per token.",
    },
  ],
  "cuda-streams": [
    {
      kind: "choice",
      prompt: "Which PyTorch habit silently kills compute/communication overlap?",
      options: ["Using torch.compile", "Calling .item() inside the training loop", "Using pinned memory", "Large batches"],
      answer: 1,
      explain: ".item() forces a device sync, collapsing async streams back into serial execution.",
    },
    {
      kind: "choice",
      prompt: "How does grCUDA run independent kernels concurrently without hand-written streams?",
      options: ["You assign streams manually", "It infers dependencies from the data each kernel touches", "It runs them on the CPU", "It uses MIG"],
      answer: 1,
      explain: "It builds a dependency graph from kernel arguments and schedules independent work on separate streams.",
    },
  ],
  "activation-checkpointing": [
    {
      kind: "number",
      prompt: "Full checkpointing costs an extra forward pass: 8N instead of 6N FLOPs per token. How much extra compute, in %?",
      answer: 33,
      tolerance: 3,
      unit: "%",
      explain: "8 ÷ 6 = 1.33, so ~33% more compute in exchange for much less activation memory.",
    },
    {
      kind: "choice",
      prompt: "Memory is comfortable, MFU is low, and activation checkpointing is on. What should you try?",
      options: ["Turn checkpointing off", "Checkpoint even more layers", "Switch to FP32", "Reduce dataloader workers"],
      answer: 0,
      explain: "When activations fit, recomputation is pure overhead.",
    },
  ],
  "zero-fsdp": [
    {
      kind: "number",
      prompt: "ZeRO-1 with dp = 8 shards only the 12 B/param optimizer state. Per-GPU state in bytes per parameter (2 weights + 2 grads + 12/8)?",
      answer: 5.5,
      tolerance: 0.1,
      unit: "B/param",
      explain: "2 + 2 + 1.5 = 5.5 bytes/param, down from 16.",
    },
    {
      kind: "choice",
      prompt: "Why can ZeRO-3 / FSDP be slow across nodes?",
      options: ["It disables overlap", "It all-gathers parameters before every forward and backward of every micro-batch", "It forces FP32", "It requires MIG"],
      answer: 1,
      explain: "For 70B that's ~140 GB moved twice per micro-batch. That's fine on NVLink, painful over a 400G NIC.",
    },
  ],
  "tensor-parallelism": [
    {
      kind: "choice",
      prompt: "Why keep tensor parallelism ≤ 8 on HGX servers?",
      options: ["Licensing", "TP's per-layer all-reduces need NVLink; beyond 8 GPUs they cross InfiniBand", "A PyTorch limit", "Memory alignment"],
      answer: 1,
      explain: "An HGX NVLink domain is 8 GPUs. Past it, latency-critical traffic hits the slower fabric.",
    },
    {
      kind: "number",
      prompt: "Megatron-style TP needs how many activation all-reduces per transformer layer per micro-batch (forward + backward)?",
      answer: 4,
      tolerance: 0,
      explain: "One for attention and one for the MLP in forward, and the same again in backward.",
    },
  ],
  "pipeline-parallelism": [
    {
      kind: "number",
      prompt: "p = 4 pipeline stages, m = 12 micro-batches per step. Bubble fraction (p−1)/(m+p−1), in %?",
      answer: 20,
      tolerance: 1,
      unit: "%",
      explain: "3 ÷ 15 = 20% of the step is idle fill and drain.",
    },
    {
      kind: "choice",
      prompt: "How do you shrink the pipeline bubble?",
      options: ["More micro-batches per step", "Fewer GPUs", "A bigger learning rate", "Disable overlap"],
      answer: 0,
      explain: "More micro-batches (gradient accumulation) amortize fill and drain. Interleaved schedules help too.",
    },
  ],

  // ------------------------------------------------------------ performance
  roofline: [
    {
      kind: "number",
      prompt: "H100 BF16: 989 TFLOP/s peak and 3.35 TB/s HBM. Where's the ridge point, in FLOPs per byte?",
      answer: 295,
      tolerance: 10,
      unit: "FLOP/B",
      explain: "989e12 ÷ 3.35e12 ≈ 295. Below it you're memory-bound, above it compute-bound.",
    },
    {
      kind: "choice",
      prompt: "A kernel with arithmetic intensity 10 runs on an H100. It can reach about…",
      options: ["989 TFLOP/s", "~33 TFLOP/s (memory-bound)", "3.35 TFLOP/s", "0"],
      answer: 1,
      explain: "min(989, 10 × 3.35) = 33.5 TFLOP/s. Fusing ops raises intensity.",
    },
  ],
  mfu: [
    {
      kind: "number",
      prompt: "A 7B model trains at 500k tokens/s on 32 H100s (989 TFLOP/s each). MFU = 6·N·tokens/s ÷ (GPUs × peak). In %?",
      answer: 66,
      tolerance: 2,
      unit: "%",
      explain: "6 × 7e9 × 5e5 = 2.1e16; 32 × 989e12 = 3.16e16, giving ≈ 66%.",
    },
    {
      kind: "choice",
      prompt: "Do recomputed FLOPs from activation checkpointing count toward MFU?",
      options: ["Yes", "No: counting them gives HFU (hardware FLOPs utilization)"],
      answer: 1,
      explain: "MFU only rewards useful model FLOPs, so it can't be gamed with recomputation.",
    },
  ],
  "all-reduce": [
    {
      kind: "number",
      prompt: "Ring all-reduce of 1 GB across 8 GPUs at 100 GB/s per link, ignoring latency: 2(n−1)/n · S/B. Time in ms?",
      answer: 17.5,
      tolerance: 0.5,
      unit: "ms",
      explain: "2 × 7/8 × 1 GB ÷ 100 GB/s = 17.5 ms.",
    },
    {
      kind: "choice",
      prompt: "Tree all-reduce algorithms beat rings mainly for…",
      options: ["Huge messages on a few GPUs", "Small messages at large scale, where latency dominates", "A single GPU", "Storage traffic"],
      answer: 1,
      explain: "Trees need ~log₂(n) latency steps instead of ~2(n−1).",
    },
  ],
  "scaling-efficiency": [
    {
      kind: "number",
      prompt: "Amdahl's law: 5% of the work is serial. What's the maximum speedup, even with infinite GPUs?",
      answer: 20,
      tolerance: 0,
      unit: "×",
      explain: "1 ÷ 0.05 = 20×.",
    },
    {
      kind: "number",
      prompt: "1 GPU does 10k tokens/s; 64 GPUs do 512k tokens/s. Scaling efficiency, in %?",
      answer: 80,
      tolerance: 1,
      unit: "%",
      explain: "512k ÷ (64 × 10k) = 0.8.",
    },
  ],
  "input-pipeline": [
    {
      kind: "choice",
      prompt: "Your job log says this. What's the best first fix?",
      code: "[rank0] step 120 | loss 3.112 | 1.02 s/step | 128.4k tok/s | MFU 32.5% | dataloader wait",
      options: ["More dataloader workers, or pre-tokenized data", "More tensor parallelism", "A lower learning rate", "Disable overlap"],
      answer: 0,
      explain: "The GPUs are waiting on the CPU-side input pipeline, so feed them faster.",
    },
    {
      kind: "number",
      prompt: "Each worker tokenizes 8k tokens/s. A rank needs 64k tokens per 1-second step. Minimum number of workers?",
      answer: 8,
      tolerance: 0,
      explain: "64k ÷ 8k = 8 workers, plus headroom in practice.",
    },
  ],
  "power-capping": [
    {
      kind: "choice",
      prompt: "Why does a power cap cost less performance than the power it saves?",
      options: ["Dynamic power ∝ f·V², and voltage has to rise with frequency", "GPUs ignore power caps", "Caps only affect memory", "It doesn't"],
      answer: 0,
      explain: "The last few hundred MHz are the most expensive, so dropping them saves a lot of watts.",
    },
    {
      kind: "choice",
      prompt: "You cap only 1 of the 16 GPUs in a training job. What happens?",
      options: ["Saves 1/16 of the power at no cost", "Creates a straggler that slows all 16", "Nothing", "The job crashes"],
      answer: 1,
      explain: "Synchronous training runs at the slowest GPU's pace. Cap them all evenly.",
    },
  ],
  "energy-and-carbon": [
    {
      kind: "number",
      prompt: "IT load of 100 kW, PUE 1.3, running for 24 hours. Facility energy in MWh?",
      answer: 3.12,
      tolerance: 0.05,
      unit: "MWh",
      explain: "100 kW × 1.3 × 24 h = 3,120 kWh = 3.12 MWh.",
    },
    {
      kind: "number",
      prompt: "3,000 kWh on a grid at 0.4 kg CO₂e per kWh. How many kg of CO₂e?",
      answer: 1200,
      tolerance: 0,
      unit: "kg",
      explain: "3,000 × 0.4 = 1,200 kg. The same job in a cleaner region could be several times lower.",
    },
  ],

  // ------------------------------------------------------------ security
  "containers-and-gpus": [
    {
      kind: "choice",
      prompt: "When a container uses a GPU, where does the kernel driver come from?",
      options: ["Inside the image", "The host, injected by the NVIDIA Container Toolkit", "Docker Hub", "PyTorch"],
      answer: 1,
      explain: "Images carry the CUDA runtime; the driver (a kernel module) always comes from the host.",
    },
    {
      kind: "choice",
      prompt: "Should training containers run with `--privileged`?",
      options: ["Yes, for speed", "No: grant device access narrowly through the runtime"],
      answer: 1,
      explain: "Privileged containers can escape to the host. GPU access doesn't need it.",
    },
  ],
  "multi-tenancy": [
    {
      kind: "choice",
      prompt: "Which way of sharing a GPU gives hardware-isolated memory and SMs?",
      options: ["Time-slicing", "MPS", "MIG", "CUDA streams"],
      answer: 2,
      explain: "MIG partitions SMs, L2 and memory controllers. MPS and time-slicing share them.",
    },
    {
      kind: "choice",
      prompt: "What's the best way to ensure GPUs are only used through the scheduler?",
      options: ["A policy document", "cgroup device controls restricting /dev/nvidia* to job allocations", "Asking users nicely", "Uninstalling nvidia-smi"],
      answer: 1,
      explain: "Enforcement beats policy: processes outside an allocation simply can't open the device.",
    },
  ],
  mig: [
    {
      kind: "number",
      prompt: "What's the maximum number of MIG instances on an H100?",
      answer: 7,
      tolerance: 0,
      explain: "Seven compute slices, so up to seven 1g instances.",
    },
    {
      kind: "choice",
      prompt: "Can a 3g.40gb and a 4g.40gb instance fit together on one 80 GB H100 (7 compute slices, 8 memory slices)?",
      options: ["Yes: together they use exactly 7 compute and 8 memory slices", "No"],
      answer: 0,
      explain: "3 + 4 = 7 compute slices and 4 + 4 = 8 memory slices. A perfect fit.",
    },
  ],
  "exposed-notebooks": [
    {
      kind: "choice",
      prompt: "Why is this alarming on a compute node?",
      code: '$ ss -tlnp\nLISTEN 0 128 0.0.0.0:8888 0.0.0.0:* users:(("python3",pid=2741))',
      options: ["Port 8888 is slow", "A notebook server (remote code execution) is listening on all interfaces", "python3 is deprecated", "It isn't"],
      answer: 1,
      explain: "0.0.0.0 means reachable from the network. Without a token, anyone can run code as that user.",
    },
    {
      kind: "choice",
      prompt: "What's a safer way to use Jupyter on a cluster?",
      options: ["Disable the token for convenience", "Bind to 127.0.0.1 and use an SSH tunnel or an authenticated gateway", "Open port 8888 in the firewall", "Run it as root"],
      answer: 1,
      explain: "Keep it local and authenticated: SSH tunnels or JupyterHub with SSO.",
    },
  ],
  cryptojacking: [
    {
      kind: "choice",
      prompt: "You kill a miner process and it reappears a minute later. What do you check first?",
      options: ["GPU temperature", "Persistence (cron entries, systemd units) and the original entry point", "Slurm partitions", "NCCL settings"],
      answer: 1,
      explain: "Something is restarting it. Remove the persistence and close the door it came in through.",
    },
    {
      kind: "choice",
      prompt: "Outbound connections to which ports often indicate mining-pool (stratum) traffic?",
      options: ["22 / 443", "3333 / 4444", "53", "6818"],
      answer: 1,
      explain: "Stratum pools commonly use ports like 3333, 4444 and 5555. Watch for them in `ss -tnp` and firewall logs.",
    },
  ],
  "supply-chain-and-secrets": [
    {
      kind: "choice",
      prompt: "Which format is safer for downloaded model weights?",
      options: ["pickle (.bin / .pt)", "safetensors", "zip", "csv"],
      answer: 1,
      explain: "Loading a pickle can execute arbitrary code. safetensors is plain tensor data.",
    },
    {
      kind: "choice",
      prompt: "Where should a job's cloud credentials come from?",
      options: ["Baked into the container image", "Hard-coded in the #SBATCH script", "A secret manager, injected at runtime and scoped to the job", "The repo README"],
      answer: 2,
      explain: "Short-lived, least-privilege secrets injected at runtime never end up in images or git history.",
    },
  ],
};

/** Accepts answers within tolerance (absolute) and ignores thousands separators and units. */
export function checkNumber(q: Extract<Question, { kind: "number" }>, raw: string): boolean {
  const v = Number(raw.replace(/[, _]/g, "").replace(/[^\d.eE+-]/g, ""));
  if (!raw.trim() || !Number.isFinite(v)) return false;
  return Math.abs(v - q.answer) <= q.tolerance + 1e-9;
}

export const RANKS: { xp: number; title: string }[] = [
  { xp: 0, title: "Intern" },
  { xp: 150, title: "Junior SRE" },
  { xp: 500, title: "SRE" },
  { xp: 1000, title: "Senior SRE" },
  { xp: 1800, title: "Staff Engineer" },
  { xp: 2600, title: "Principal Engineer" },
  { xp: 3400, title: "Distinguished Engineer" },
];

export function rankFor(xp: number): { title: string; next?: { title: string; xp: number } } {
  let i = 0;
  while (i + 1 < RANKS.length && xp >= RANKS[i + 1].xp) i++;
  return { title: RANKS[i].title, next: RANKS[i + 1] };
}
