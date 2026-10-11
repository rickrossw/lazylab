import type { AtlasEntry } from "./atlas";

export const OPS: AtlasEntry[] = [
  {
    slug: "nvidia-smi",
    title: "nvidia-smi",
    category: "Operations",
    summary: "The first tool you reach for: per-GPU utilization, memory, temperature, power, clocks, processes and configuration.",
    body: `\`nvidia-smi\` talks to the driver through NVML. The default table shows each GPU's temperature, power draw versus cap, memory use, utilization and the processes using it.

**The views that answer real questions**
\`\`\`
nvidia-smi                                   # overview + processes
nvidia-smi -q -d PERFORMANCE                 # why are clocks low? (event reasons)
nvidia-smi -q -d TEMPERATURE,POWER,ECC       # thermals, power limits, memory errors
nvidia-smi --query-gpu=index,temperature.gpu,clocks.sm,power.draw --format=csv
nvidia-smi topo -m                           # NVLink/PCIe/NIC topology matrix
nvidia-smi nvlink -s                         # per-link NVLink status
sudo nvidia-smi -pl 500                      # set a power limit
\`\`\`

**Caveat**: "GPU-Util" means *a kernel was running* during the sample window. It does not mean the GPU was busy. A GPU waiting at a barrier for a [[stragglers|straggler]] still spins. For real saturation metrics use [[dcgm]] profiling fields such as SM activity and tensor pipe activity.`,
    related: ["dcgm", "xid-errors", "power-and-thermals", "ecc-errors"],
    sources: ["nvsmi"],
    track: "monitoring",
  },
  {
    slug: "dcgm",
    title: "DCGM",
    category: "Operations",
    summary: "Data Center GPU Manager: fleet-scale GPU telemetry, health checks, diagnostics and policy, the backbone of GPU monitoring.",
    body: `DCGM runs a host engine (\`nv-hostengine\`) on each node and exposes:

- **Telemetry fields**: temperature, power, clocks, ECC, NVLink counters, Xid events and *profiling* metrics (\`SM_ACTIVE\`, \`SM_OCCUPANCY\`, \`PIPE_TENSOR_ACTIVE\`, \`DRAM_ACTIVE\`).
- **Health watches** that flag thermal, power, memory, PCIe and NVLink issues.
- **Diagnostics**: \`dcgmi diag -r 1|2|3\`, from quick deployment checks to stress tests. Run level 1 before a node rejoins the pool and level 3 after hardware work.
- **dcgm-exporter** for Prometheus, so it feeds Grafana dashboards and alert rules.

**Alerts worth having on day one**
- Any [[xid-errors|Xid]] event (critical ones page someone).
- HW thermal slowdown active for more than a minute.
- Uncorrectable [[ecc-errors|ECC]] or pending row remap.
- GPU busy while the scheduler shows *no job* on that node. That catches leaks *and* [[cryptojacking]].`,
    related: ["nvidia-smi", "xid-errors", "stragglers", "cryptojacking"],
    sources: ["dcgm"],
    track: "monitoring",
  },
  {
    slug: "xid-errors",
    title: "Xid errors",
    category: "Operations",
    summary: "Error codes the NVIDIA kernel driver writes to the system log when something goes wrong on a GPU.",
    body: `An Xid is the driver's way of saying "this GPU had a problem". It appears in the kernel log (\`dmesg\`, \`journalctl -k\`) as \`NVRM: Xid (PCI:0000:xx:00.0): <code>, ...\`. The messages are emitted by the kernel driver, which you can read in NVIDIA's *open-gpu-kernel-modules*.

**Codes every GPU operator should recognize**
| Xid | Meaning | Typical action |
|---|---|---|
| 13, 31, 43 | Application errors (bad memory access, illegal instruction) | Usually the user's code |
| 48 | Uncorrectable (double-bit) ECC error | Reset GPU, check row remapping, watch for repeats |
| 63, 64 | Row-remapping events | Reset when idle; RMA if remapping fails |
| 74 | NVLink error | Check links, reseat, run nccl-tests |
| 79 | GPU has fallen off the bus | Drain node, reboot, likely hardware ticket |
| 94, 95 | Contained / uncontained ECC error | Contained: affected app only. Uncontained: reset |

**Ops pattern**: alert on Xid via [[dcgm]], **drain** the node in [[slurm]] with the Xid in the reason, requeue affected jobs from their [[checkpointing|checkpoints]], then diagnose offline.`,
    related: ["ecc-errors", "dcgm", "slurm", "nvidia-smi"],
    sources: ["xid", "ogkm", "dcgm"],
    track: "monitoring",
  },
  {
    slug: "ecc-errors",
    title: "ECC errors & row remapping",
    category: "Operations",
    summary: "HBM is protected by error-correcting codes: single-bit errors are fixed silently, double-bit errors stop the work.",
    body: `Data-center GPUs protect HBM (and on-chip SRAM) with ECC:

- **Single-bit (correctable)**: fixed on the fly and counted. A slowly growing count is normal. A rapidly growing one is a warning.
- **Double-bit (uncorrectable, DBE)**: the data is lost. The application gets an error ([[xid-errors|Xid 48]] / 94 / 95) and the GPU usually needs a **reset**.

A100 and later GPUs use **row remapping**: a bad DRAM row is replaced with a spare at the next GPU reset. \`nvidia-smi -q -d ECC\` shows "Remapped Rows → Pending: Yes" until you reset. If remapping *fails* (spares exhausted), the GPU needs replacing.

**Procedure**: drain → wait for jobs to leave → \`nvidia-smi -r -i <gpu>\` → \`dcgmi diag -r 2\` → return to service if clean.`,
    related: ["xid-errors", "dcgm", "nvidia-smi"],
    sources: ["xid", "nvsmi", "dcgm"],
    track: "monitoring",
  },
  {
    slug: "stragglers",
    title: "Stragglers",
    category: "Operations",
    summary: "In synchronous training the whole job runs at the speed of its slowest GPU. Finding that GPU is a core ops skill.",
    body: `Every collective is a barrier. If one of 1,024 GPUs runs 40% slower (a thermal throttle, a flaky link, a noisy neighbor or a slow disk on one node), **all 1,024** run 40% slower.

**Signatures**
- Throughput drops with no errors in the logs.
- Per-GPU utilization looks *inverted*: the straggler shows ~100%, the others less, because they idle at the barrier.
- The straggler's SM clock is low. \`nvidia-smi -q -d PERFORMANCE\` shows *HW Thermal Slowdown* or *SW Power Cap*.
- NCCL or framework timing shows one rank consistently arriving late to collectives.

**Response**: identify, drain, restart from a [[checkpointing|checkpoint]] on healthy hardware, and file a hardware ticket. At scale, automate it: continuous per-rank timing plus [[dcgm]] clocks and temperatures, and automatic cordoning.`,
    related: ["power-and-thermals", "dcgm", "all-reduce", "scaling-efficiency"],
    sources: ["dcgm", "dtbook"],
    track: "monitoring",
  },
  {
    slug: "checkpointing",
    title: "Checkpointing & fault tolerance",
    category: "Operations",
    summary: "Periodically save model and optimizer state so a failure costs minutes of progress, not days.",
    body: `At thousands of GPUs, *something* fails every few hours. **Checkpointing** bounds the damage: on failure, you restart from the last saved state and lose at most one checkpoint interval.

**Choosing the interval**: too frequent wastes I/O time, too rare wastes compute on failure. A classic approximation (Young/Daly) is *interval ≈ √(2 × checkpoint_cost × MTBF)*.

**Making it cheap**
- Shard checkpoints: each rank writes its own slice in parallel.
- Async checkpointing: copy to host memory, then write in the background.
- Keep a few recent checkpoints. Corrupt or partial saves happen.

**Ops integration**: \`scontrol requeue\` or a job-level retry loop, plus a **warm spare** pool, turns "a GPU died" into a 5-minute blip. That's the loop you practice in *Fallen Off the Bus* and *The Slow Lane*.`,
    related: ["slurm", "xid-errors", "stragglers", "input-pipeline"],
    sources: ["dtbook", "slurm"],
    track: "running",
  },
  {
    slug: "multi-tenancy",
    title: "Multi-tenancy & GPU sharing",
    category: "Security",
    summary: "Time-slicing, MPS and MIG: three ways to share a GPU, with very different isolation guarantees.",
    body: `Shared clusters must decide how tenants share GPUs:

| Approach | Isolation | Good for |
|---|---|---|
| Whole-GPU allocation (scheduler-enforced) | Strong | Training, anything serious |
| [[mig\\|MIG]] instances | Strong (hardware partitioned memory and SMs) | Inference, notebooks, CI |
| MPS (Multi-Process Service) | Weak: shared address-space faults can affect others | Cooperative jobs from one team |
| Time-slicing | None for memory; context switches | Dev and test only |

**Enforcement matters more than policy.** The scheduler should be the *only* path to a GPU: cgroup device controls restrict \`/dev/nvidia*\` to processes inside a job allocation. Without that, any user with a shell on a node can quietly use idle GPUs. See [[cryptojacking]].

Pair it with least-privilege accounts, no shared service users, audit logs and per-tenant accounting so usage is visible and fair (see [[fair-share]]).`,
    related: ["mig", "cryptojacking", "containers-and-gpus", "fair-share"],
    sources: ["mig", "gpuOperator", "slurm"],
    track: "security",
  },
  {
    slug: "cryptojacking",
    title: "Cryptojacking on GPU clusters",
    category: "Security",
    summary: "Unauthorized cryptocurrency mining on stolen GPU time: the most common way GPU clusters get abused.",
    body: `GPUs are valuable, and attackers who get code execution on a GPU node very often just **mine cryptocurrency**. Common entry points:

- Exposed, unauthenticated services: notebooks, dashboards and ML tooling UIs on \`0.0.0.0\` (see [[exposed-notebooks]]).
- Leaked credentials and API keys in images, repos or job scripts (see [[supply-chain-and-secrets]]).
- Over-privileged containers.

**Detection signals**
- A GPU busy with **no scheduled job**: compare [[dcgm]] utilization to scheduler state.
- Unknown process names on GPUs (\`nvidia-smi\`), often disguised as kernel threads.
- Outbound connections to mining pools (stratum protocol, ports like 3333/4444) in \`ss -tnp\` or firewall logs.
- New cron entries or systemd units owned by unexpected users.

**Response**: preserve evidence → kill the process → remove persistence → close the entry point → lock or rotate the affected identities → look for lateral movement → report. Killing the process alone is never enough. The *Night Shift* mission makes that concrete.`,
    related: ["exposed-notebooks", "multi-tenancy", "dcgm", "supply-chain-and-secrets"],
    sources: ["dcgm", "jupyterSec"],
    track: "security",
  },
  {
    slug: "exposed-notebooks",
    title: "Exposed notebooks & dashboards",
    category: "Security",
    summary: "A Jupyter server with no token on 0.0.0.0 is remote code execution for anyone who can reach it.",
    body: `Jupyter is designed to run arbitrary code: that's the point. With \`--ip=0.0.0.0\` and authentication disabled (empty token and password), anyone who can reach the port can run commands as the notebook's user. The same applies to many ML dashboards, experiment trackers and inference UIs.

**Safer patterns**
- Bind to \`127.0.0.1\` and reach it through an **SSH tunnel** or an authenticated gateway (JupyterHub with SSO).
- Never disable tokens or passwords. Use TLS when traffic leaves the host.
- Firewall compute nodes: only the scheduler, monitoring and admin networks should reach them.
- Run notebooks *inside* scheduler allocations so they're time-limited and accounted.

**Detecting**: \`ss -tlnp\` shows listeners on \`0.0.0.0\`. Server logs record requests from unexpected IPs. Network monitoring flags inbound connections to compute nodes from outside.`,
    related: ["cryptojacking", "multi-tenancy", "supply-chain-and-secrets"],
    sources: ["jupyterSec"],
    track: "security",
  },
  {
    slug: "supply-chain-and-secrets",
    title: "Supply chain & secrets",
    category: "Security",
    summary: "Container images, model weights and job scripts are code you run, and a common place for leaked credentials.",
    body: `A training job pulls in a lot of other people's code: base images, Python packages, custom kernels, pretrained weights and datasets. Each is part of your supply chain.

**Risks**
- Images with **baked-in secrets** (cloud keys, tokens) are readable by anyone who can pull them.
- **Pickle-based model files** can execute code when loaded. Prefer \`safetensors\`.
- Unpinned dependencies change underneath you.

**Controls**
- Pin images by digest, scan them, and build from trusted bases.
- Inject secrets at runtime from a secret manager, scoped per job. Never put them in \`#SBATCH\` scripts, env files in repos or image layers.
- Short-lived credentials and least privilege for storage access.
- Verify checksums or signatures for weights and datasets.

These controls protect *your* cluster and also the people whose data and models you're responsible for.`,
    related: ["containers-and-gpus", "exposed-notebooks", "cryptojacking"],
    sources: ["containerToolkit"],
    track: "security",
  },
  {
    slug: "energy-and-carbon",
    title: "Energy & carbon",
    category: "Responsible compute",
    summary: "kWh, PUE and CO₂e: measuring the environmental cost of compute so it can be managed, not guessed.",
    body: `A GPU cluster is a power plant's customer. A rough accounting:

\`\`\`
facility energy (kWh) = IT energy (GPUs + hosts + network) × PUE
emissions (kg CO₂e)   = facility energy × grid carbon intensity
\`\`\`

- **PUE** (Power Usage Effectiveness) captures cooling and power-delivery overhead: ~1.1 for the best liquid-cooled sites, 1.3–1.6 for typical ones.
- **Carbon intensity** varies by more than 10× between regions and by time of day. Where and when you train can matter as much as how.

**Levers you control**
- Efficiency first: higher [[mfu|MFU]] means fewer GPU-hours for the same model.
- [[power-capping|Power caps]] trade a little speed for a lot of energy.
- Right-size: don't leave idle allocations running. Schedulers can reclaim them.
- Report kWh and CO₂e per run, next to cost and accuracy, so trade-offs are visible.

Every LazyLab run shows its energy, cost and carbon in the header.`,
    related: ["power-capping", "mfu", "fair-share", "cluster-topology"],
    sources: ["patterson", "mlco2"],
    track: "performance",
  },
  {
    slug: "power-capping",
    title: "Power capping",
    category: "Responsible compute",
    summary: "Lower a GPU's power limit and give up a little speed for a lot less energy: often 20% less power for under 10% slower.",
    body: `Near the top of the voltage/frequency curve, power grows much faster than performance: dynamic power ∝ *f·V²*, and voltage must rise with frequency. Capping power therefore costs proportionally *less* performance than it saves.

In training, only the compute-bound part of each step slows down. Communication, data loading and pipeline bubbles don't care about SM clocks, so the real-world throughput hit is smaller still.

**How**
\`\`\`
sudo nvidia-smi -pl 550            # all GPUs on this node
sudo nvidia-smi -pl 550 -i 3       # just GPU 3
\`\`\`
Caps reset on reboot unless managed by your provisioning or by [[dcgm]] policies.

**Caveats**: cap *all* GPUs in a job. Capping one creates a [[stragglers|straggler]]. And measure tokens per joule, not just tokens per second.`,
    related: ["power-and-thermals", "energy-and-carbon", "stragglers"],
    sources: ["nvsmi", "patterson"],
    widget: "power",
    track: "performance",
  },
  {
    slug: "fair-share",
    title: "Fair-share scheduling",
    category: "Responsible compute",
    summary: "Scheduler policies that balance access between teams based on what they're entitled to and what they've recently used.",
    body: `On a shared cluster, "first come, first served" lets one team's 1,000 queued jobs starve everyone else. **Fair-share** scheduling (e.g. Slurm's multifactor priority) lowers the priority of users and accounts that recently used more than their share, with usage decaying over time.

**The ingredients**
- **Shares**: each account's entitlement, often matching funding or team size.
- **Usage decay**: a half-life (e.g. 7 days) so past usage is forgiven gradually.
- **QOS limits**: caps on concurrent GPUs, wall time or job count, so no single job blocks the cluster.
- **Preemption**: low-priority or opportunistic jobs can be checkpointed and requeued when priority work arrives. This only works if jobs [[checkpointing|checkpoint]] well.

Fairness is also about *transparency*: publish usage per team, queue wait times and energy, so allocation debates use data instead of anecdotes.`,
    related: ["slurm", "multi-tenancy", "energy-and-carbon", "checkpointing"],
    sources: ["slurm"],
    track: "running",
  },
];
