# LazyLab

**Learn GPU clusters by breaking them.** LazyLab is an interactive learning environment for GPU cluster architecture, scheduling, optimization, monitoring, performance, security and responsible operations. Everything runs in the browser against a deterministic cluster simulator, so it is free to host and costs nothing per learner.

- **Atlas**: 44 cross-linked concept pages (SM, HBM, NVLink, InfiniBand, NCCL, Slurm, ZeRO, tensor and pipeline parallelism, roofline, MFU, Xid errors, DCGM, MIG, cryptojacking, power capping, …), with six live widgets.
- **Lab**: a free-play simulated cluster with a terminal (`sinfo`, `sbatch`, `scontrol`, `nvidia-smi`, `dcgmi`, `dmesg`, `ibstat`, `all_reduce_perf`, `ps`, `ss`, `systemctl`, …), dashboards, alerts and fault injection.
- **Missions**: eight graded scenarios with self-checking objectives, hints, scoring and debriefs. Every run reports energy, cost and CO₂e.

## Run locally

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # simulator, shell, content and mission tests
npm run build      # static export to ./out
```

Requires Node 20+.

## Deploy to GitHub Pages (free)

The site is a static export. `.github/workflows/deploy.yml` builds, tests and publishes it on every push to `main`.

1. Create a GitHub repository (e.g. `lazylab`) and push this project to its `main` branch.
2. In the repository, go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
3. The workflow runs automatically. The site appears at `https://<your-user>.github.io/<repo>/`. The base path is detected automatically.

### Custom domain (lazylab.com)

1. In **Settings → Pages → Custom domain**, enter `lazylab.com` and save.
2. At your DNS provider, add:
   - `A` records for `lazylab.com` → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - `CNAME` record for `www` → `<your-user>.github.io`
3. Once DNS resolves, tick **Enforce HTTPS**, then re-run the deploy workflow (Actions → Deploy to GitHub Pages → Run workflow) so the site rebuilds without the `/<repo>` prefix.

## How it works

```
src/
  sim/          deterministic simulator (pure TypeScript, no DOM)
    hardware.ts   GPU / fabric / model catalog
    perf.ts       analytical models: roofline, memory, step time, all-reduce, power
    sim.ts        cluster state machine: scheduler, jobs, GPU physics, faults, alerts, accounting
    shell.ts      simulated CLI (Slurm, NVIDIA tools, Linux, security tools)
    jobscript.ts  #SBATCH / train.py argument parser
    designer.ts   capex / power / time-to-train estimator
  missions/     mission catalog + golden-solution tests
  content/      Atlas entries (Markdown in TS) and sources
  components/   React UI: console, terminal, topology, charts, widgets
  app/          Next.js routes (static export)
```

- **Deterministic**: one tick is one simulated second, and all randomness comes from a seeded RNG. A run is fully described by `(scenario, action log)`. `replay()` rebuilds it exactly, and the tests check this for every mission.
- **Models are analytical**: directionally correct and explainable, not cycle-accurate. The formulas and their references are in `src/sim/perf.ts`.
- **Progress** is stored in the browser (`localStorage`). No account is needed.

## Adding content

**An Atlas entry**: add an object to one of `src/content/atlas-*.ts`. Use `[[slug]]` or `[[slug|label]]` to cross-link. `npm test` fails on broken links or unknown sources.

**A mission**: add a `TerminalMission` (scenario, objectives, hints, debrief, golden `solution`) to `src/missions/index.ts` and append it to `MISSIONS`. `npm test` replays the golden solution and fails if the mission isn't winnable or isn't deterministic.

## Sources

The Atlas is original writing that cites its sources, including the [PRACE GPGPU Best Practice Guide](https://prace-ri.eu/wp-content/uploads/Best-Practice-Guide_GPGPU.pdf), the [Distributed Training book](https://ttsugriy.github.io/distributed-training-book/), the [Modal GPU Glossary](https://modal.com/gpu-glossary), [NVIDIA grCUDA](https://github.com/NVIDIA/grcuda), [NVIDIA open-gpu-kernel-modules](https://github.com/NVIDIA/open-gpu-kernel-modules), and the ZeRO, Megatron-LM, PaLM and activation-recomputation papers.

Security missions are defensive exercises on a simulated cluster only.
