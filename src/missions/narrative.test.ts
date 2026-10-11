import { describe, expect, test } from "vitest";
import { createMissionSim, getMission, objectivesMet, jobScript, type TerminalMission } from "./index";

const M = (id: string) => getMission(id) as TerminalMission;
const ticks = (sim: { tick(): void }, n: number) => { for (let i = 0; i < n; i++) sim.tick(); };

describe("scenarios match their briefings", () => {
  test("first-multinode: broken script is rejected; IB-disabled run is too slow", () => {
    const m = M("first-multinode");
    const sim = createMissionSim(m);
    expect(sim.exec("sbatch train.sh").lines[0].kind).toBe("err");
    sim.writeFile("train.sh", jobScript({ name: "x", nodes: 2, env: ["NCCL_IB_DISABLE=1"], args: "--model 7b" }));
    expect(sim.exec("sbatch train.sh").lines[0].text).toMatch(/Submitted batch job/);
    ticks(sim, 15);
    expect(objectivesMet(m, sim)).toEqual([true, false]);
  });

  test("fallen-off-bus: job 101 has failed by the time the player arrives", () => {
    const sim = createMissionSim(M("fallen-off-bus"));
    expect(sim.job(101)?.state).toBe("FAILED");
    expect(sim.state.alerts.some((a) => a.rule === "GpuFellOffBus" && a.active)).toBe(true);
  });

  test("straggler: MFU is depressed by a thermally throttled GPU", () => {
    const sim = createMissionSim(M("straggler"));
    const j = sim.job(101)!;
    expect(j.state).toBe("RUNNING");
    expect(j.estimate!.mfu).toBeLessThan(0.45);
    expect(sim.node("node-3")!.gpus[5].throttle).toBe("thermal");
    // A requeue without draining lands back on node-3 (first fit) and stays slow.
    sim.exec("scontrol requeue 101");
    ticks(sim, 15);
    expect(sim.job(101)!.nodes).toContain("node-3");
  });

  test("mfu-tune: starts ~26% MFU; fixing only overlap+ckpt makes it data-bound", () => {
    const m = M("mfu-tune");
    const sim = createMissionSim(m);
    expect(sim.job(101)!.estimate!.mfu).toBeGreaterThan(0.2);
    expect(sim.job(101)!.estimate!.mfu).toBeLessThan(0.3);
    sim.writeFile("train.sh", jobScript({ name: "x", nodes: 2, args: "--model 7b --micro-batch 1 --grad-accum 2 --overlap --no-ckpt --workers 1" }));
    sim.exec("scontrol requeue 101");
    ticks(sim, 12);
    expect(sim.job(101)!.estimate!.bottleneck).toBe("data");
    expect(objectivesMet(m, sim)[0]).toBe(false);
  });

  test("mfu-tune: micro-batch 4 without checkpointing OOMs", () => {
    const sim = createMissionSim(M("mfu-tune"));
    sim.writeFile("train.sh", jobScript({ name: "x", nodes: 2, args: "--model 7b --micro-batch 4 --no-ckpt --overlap --workers 8" }));
    sim.exec("scontrol requeue 101");
    ticks(sim, 12);
    expect(sim.job(101)!.state).toBe("FAILED");
    expect(sim.job(101)!.log.join("\n")).toMatch(/OutOfMemoryError/);
  });

  test("power-cap: capping one node is not enough; too low a cap loses throughput", () => {
    const m = M("power-cap");
    const one = createMissionSim(m);
    one.exec("ssh node-1");
    one.exec("sudo nvidia-smi -pl 450");
    ticks(one, 5);
    expect(objectivesMet(m, one).every(Boolean)).toBe(false);
    const low = createMissionSim(m);
    low.exec("sudo pdsh -w node-[1-2] nvidia-smi -pl 400");
    ticks(low, 5);
    expect(objectivesMet(m, low)).toEqual([true, false]);
  });

  test("power-cap: without sudo the limit is refused", () => {
    const sim = createMissionSim(M("power-cap"));
    sim.exec("ssh node-1");
    expect(sim.exec("nvidia-smi -pl 500").lines[0].text).toMatch(/Insufficient Permissions/);
  });

  test("cryptominer: killing the miner alone does not stick", () => {
    const m = M("cryptominer");
    const sim = createMissionSim(m);
    expect(sim.state.alerts.some((a) => a.rule === "GpuBusyWithoutJob" && a.active)).toBe(true);
    sim.exec("ssh node-2");
    sim.exec("sudo kill -9 31337");
    expect(sim.minerRunning()).toBe(false);
    ticks(sim, 130);
    expect(sim.minerRunning()).toBe(true);
    expect(objectivesMet(m, sim).every(Boolean)).toBe(false);
  });

  test("fit-70b: starts OOM; ZeRO-3 fits but is too slow; tp=16 is terrible", () => {
    const m = M("fit-70b");
    const sim = createMissionSim(m);
    expect(sim.job(101)!.state).toBe("FAILED");
    const z3 = createMissionSim(m);
    z3.writeFile("train.sh", jobScript({ name: "x", nodes: 4, args: "--model 70b --micro-batch 1 --grad-accum 16 --zero 3 --ckpt --overlap" }));
    z3.exec("sbatch train.sh");
    ticks(z3, 12);
    expect(objectivesMet(m, z3)).toEqual([true, false]);
  });
});
