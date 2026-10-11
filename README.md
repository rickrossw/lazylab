# LazyLab

**Learn GPU clusters by breaking them.** Live at **[lazylab.com](https://lazylab.com/)**.

LazyLab is a browser game for learning how to design, run, tune, monitor and secure GPU clusters. Open the site and you're dropped straight into a simulated cluster with a terminal, live dashboards and a problem to fix. Everything runs client-side against a deterministic simulator, so hosting is free.

## What's inside

- **Play** (`/`): starts at your first unfinished mission. Progress is saved in your browser.
- **Missions**: eight graded scenarios across six tracks:

  | # | Mission | Track |
  |---|---|---|
  | 1 | Two Nodes, One Job: fix a broken multi-node Slurm script | Running |
  | 2 | Fallen Off the Bus: diagnose Xid 79, drain the node, recover | Monitoring |
  | 3 | The Slow Lane: find a thermally throttled straggler | Monitoring |
  | 4 | Feed the Beast: raise MFU from 26% to 55%+ | Optimization |
  | 5 | Watts Up: cut power 20% and keep 85% of throughput | Performance |
  | 6 | Night Shift: contain a cryptominer on a shared node | Security |
  | 7 | Seventy Billion Reasons: fit and train a 70B model on 32 GPUs | Optimization |
  | 8 | Build the Pod: spec a cluster under budget, power and deadline | Architecture |

- **Lab** (`/lab`): free-play cluster. Choose GPU, node count and network, then inject faults (fan failure, Xid 79, ECC, NVLink, InfiniBand, rogue process).
- **Atlas** (`/atlas`): 44 cross-linked concept pages with six interactive widgets (roofline, training memory, all-reduce, MIG, scaling, power capping).
- **Terminal**: about 40 commands with realistic output, including `sinfo`, `squeue`, `sbatch`, `scontrol`, `sacct`, `nvidia-smi`, `dcgmi`, `dmesg`, `ibstat`, `all_reduce_perf`, `ps`, `kill`, `ss`, `systemctl`, `journalctl`, `crontab`, `usermod`, `ssh`, `pdsh`, `nano`, pipes and `sudo`.

Every run reports energy (kWh), cost and CO₂e alongside performance.

## Develop

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # simulator, shell, content and mission tests
npm run build    # static export to ./out
```

Requires Node 20+.

## Deploy

```bash
npm run deploy
```

This runs the tests, builds the site and force-pushes `./out` (with a `CNAME` for lazylab.com) to the `gh-pages` branch, which GitHub Pages serves.

DNS for lazylab.com points at GitHub Pages: four `A` records for `@` → `185.199.108.153`, `.109.153`, `.110.153`, `.111.153`, and a `CNAME` for `www` → `rickrossw.github.io`.

## Project layout

```
src/
  sim/         deterministic cluster simulator (pure TypeScript, no DOM)
    hardware.ts  GPU, network and model catalog
    perf.ts      analytical models: roofline, memory, step time, collectives, power
    sim.ts       scheduler, jobs, GPU physics, faults, alerts, energy accounting
    shell.ts     simulated command line
    jobscript.ts #SBATCH and train.py argument parser
    designer.ts  capex / power / time-to-train estimator
  missions/    mission catalog and golden-solution tests
  content/     Atlas entries and sources
  components/  React UI: console, terminal, topology, charts, widgets
  app/         Next.js routes (static export)
scripts/
  deploy-pages.sh
```

- **Deterministic**: one tick is one simulated second, and all randomness comes from a seeded RNG. A run is fully described by its scenario and action log. `replay()` reproduces it exactly, and tests check this for every mission.
- **Analytical models**: directionally correct and explainable, not cycle-accurate. Formulas and references are in `src/sim/perf.ts`.

## Adding content

- **Atlas entry**: add an object to one of `src/content/atlas-*.ts`. Cross-link with `[[slug]]` or `[[slug|label]]`. Tests fail on broken links or unknown sources.
- **Mission**: add a `TerminalMission` (scenario, objectives, hints, debrief, golden `solution`) to `src/missions/index.ts` and append it to `MISSIONS`. Tests replay the golden solution and fail if the mission can't be won or isn't deterministic.

## Sources

The Atlas is original writing that cites its sources, including the [PRACE GPGPU Best Practice Guide](https://prace-ri.eu/wp-content/uploads/Best-Practice-Guide_GPGPU.pdf), the [Distributed Training book](https://ttsugriy.github.io/distributed-training-book/), the [Modal GPU Glossary](https://modal.com/gpu-glossary), [NVIDIA grCUDA](https://github.com/NVIDIA/grcuda), [NVIDIA open-gpu-kernel-modules](https://github.com/NVIDIA/open-gpu-kernel-modules), and the ZeRO, Megatron-LM, PaLM and activation-recomputation papers.

Security missions are defensive exercises on a simulated cluster only.
