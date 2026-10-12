# LazyLab

**Learn GPU clusters by breaking them.** Live at **[lazylab.com](https://lazylab.com/)**.

LazyLab is an interactive book you can play: **The LazyLab Playbook** teaches how to design, run, tune, monitor and secure GPU clusters. Each section mixes explanation, live models and a checkpoint challenge. Each chapter ends in a boss mission: a broken simulated cluster with a real terminal. Everything runs client-side, so hosting is free. Sign-in is optional and only syncs progress.

## What's inside

- **Playbook** (`/`): six chapters, 44 sections. Every section ends with a checkpoint (multiple choice, real tool output to interpret, or quick calculations) worth XP. Progress gives you a rank (Intern → Distinguished Engineer) and a daily streak.
- **Boss missions** (8), unlocked once you master half a chapter's sections:

  | Chapter | Boss |
  |---|---|
  | 1. Anatomy of a GPU Cluster | Build the Pod: spec a cluster under budget, power and deadline |
  | 2. Running Jobs | Two Nodes, One Job: fix a broken multi-node Slurm script |
  | 3. Watching the Fleet | Fallen Off the Bus (Xid 79), The Slow Lane (thermal straggler) |
  | 4. Making Training Fast | Feed the Beast (MFU 26% → 55%), Seventy Billion Reasons (fit 70B) |
  | 5. Measuring and Scaling | Watts Up: cut power 20%, keep 85% throughput |
  | 6. Securing Shared GPUs | Night Shift: contain a cryptominer |

- **Lab** (`/lab`): free-play simulated cluster with fault injection (fan failure, Xid 79, ECC, NVLink, InfiniBand, rogue process).
- **Glossary** (`/atlas`): every concept as a standalone reference page.
- **Terminal**: about 40 commands with realistic output (`sbatch`, `scontrol`, `nvidia-smi`, `dcgmi`, `dmesg`, `ibstat`, `ss`, `systemctl`, `crontab`, `ssh`, `pdsh`, pipes, `sudo`, …).

Design: visual language inspired by nebius.com; long-form chapter layout inspired by the Ultra-Scale Playbook.

## Develop

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # simulator, shell, content and mission tests
npm run build    # static export to ./out
```

Requires Node 20+.

## Optional sign-in (Supabase)

Guests can play everything; progress is saved in the browser. Signing in syncs progress across devices (and later, the mobile app). It stays hidden until configured.

1. Create a free project at [supabase.com](https://supabase.com).
2. In **SQL Editor**, run `supabase/migrations/0001_progress.sql`. It creates the `progress` table with row-level security.
3. In **Authentication → URL Configuration**, set **Site URL** to `https://lazylab.com/` and add `https://lazylab.com/**` and `http://localhost:3000/**` to **Redirect URLs**.
4. Optional: enable GitHub or Google under **Authentication → Providers**.
5. Copy `.env.example` to `.env.local` and fill in the project URL and anon key from **Project Settings → API**.
6. Run `npm run deploy`.

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
  missions/    boss mission catalog and golden-solution tests
  content/     chapters, sections (Atlas entries), checkpoints, sources
  lib/         progress (XP, streaks, merge), game rules, Supabase client
  components/  React UI: console, terminal, topology, charts, widgets
  app/         Next.js routes (static export)
scripts/
  deploy-pages.sh
```

- **Deterministic**: one tick is one simulated second, and all randomness comes from a seeded RNG. A run is fully described by its scenario and action log. `replay()` reproduces it exactly, and tests check this for every mission.
- **Analytical models**: directionally correct and explainable, not cycle-accurate. Formulas and references are in `src/sim/perf.ts`.

## Adding content

- **Section**: add an entry to one of `src/content/atlas-*.ts`, place it in a chapter in `TRACK_LEVELS` and write its checkpoint in `CHALLENGES` (`src/content/levels.ts`). Cross-link with `[[slug]]`. Tests fail on broken links, unplaced sections or invalid answers.
- **Mission**: add a `TerminalMission` (scenario, objectives, hints, debrief, golden `solution`) to `src/missions/index.ts` and append it to `MISSIONS`. Tests replay the golden solution and fail if the mission can't be won or isn't deterministic.

## Sources

The Atlas is original writing that cites its sources, including the [PRACE GPGPU Best Practice Guide](https://prace-ri.eu/wp-content/uploads/Best-Practice-Guide_GPGPU.pdf), the [Distributed Training book](https://ttsugriy.github.io/distributed-training-book/), the [Modal GPU Glossary](https://modal.com/gpu-glossary), [NVIDIA grCUDA](https://github.com/NVIDIA/grcuda), [NVIDIA open-gpu-kernel-modules](https://github.com/NVIDIA/open-gpu-kernel-modules), and the ZeRO, Megatron-LM, PaLM and activation-recomputation papers.

Security missions are defensive exercises on a simulated cluster only.
