import { describe, expect, test } from "vitest";
import { MISSIONS, createMissionSim, objectivesMet, type TerminalMission, type DesignerMission } from "./index";
import { replay } from "@/sim/sim";
import { evaluateDesign } from "@/sim/designer";

const terminal = MISSIONS.filter((m): m is TerminalMission => m.kind === "terminal");
const designer = MISSIONS.filter((m): m is DesignerMission => m.kind === "designer");

describe("terminal missions", () => {
  for (const m of terminal) {
    test(`${m.id}: not solved at start, golden solution wins, replay is deterministic`, () => {
      const sim = createMissionSim(m);
      expect(objectivesMet(m, sim).every(Boolean)).toBe(false);
      for (const step of m.solution) {
        for (let i = 0; i < (step.wait ?? 0); i++) sim.tick();
        if (step.cmd) {
          const res = sim.exec(step.cmd);
          const errs = res.lines.filter((l) => l.kind === "err");
          expect(errs, `"${step.cmd}" printed errors`).toEqual([]);
        }
        if (step.write) sim.writeFile(step.write.path, step.write.content);
        sim.tick();
      }
      let done = objectivesMet(m, sim).every(Boolean);
      for (let i = 0; i < 30 && !done; i++) {
        sim.tick();
        done = objectivesMet(m, sim).every(Boolean);
      }
      if (!done) {
        const job = sim.state.jobs.at(-1);
        console.log(m.id, objectivesMet(m, sim), job?.state, job?.log.slice(-4), job?.estimate?.mfu);
      }
      expect(done).toBe(true);

      const again = replay(() => createMissionSim(m), sim.actions, sim.state.t);
      expect(again.hash()).toBe(sim.hash());
    });
  }
});

describe("designer missions", () => {
  for (const m of designer) {
    test(`${m.id}: initial design fails, solution passes`, () => {
      const check = (d: typeof m.initial) => {
        const result = evaluateDesign(d, m.workload);
        return m.objectives.every((o) => o.check({ design: d, result }));
      };
      expect(check(m.initial)).toBe(false);
      expect(check(m.solution)).toBe(true);
    });
  }
});
