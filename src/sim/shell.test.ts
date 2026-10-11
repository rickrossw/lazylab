import { describe, expect, test } from "vitest";
import { Simulation } from "./sim";
import { COMMAND_NAMES } from "./shell";
import { MISSIONS, createMissionSim, type TerminalMission } from "@/missions";

const CASES = [
  "help", "sinfo", "sinfo -R", "sinfo -N", "squeue", "squeue --me", "sacct", "scontrol show job 101", "scontrol show node node-1",
  "scontrol show partition", "ls", "ls -la", "cat train.sh", "cat slurm-101.out", "tail -n 3 slurm-101.out", "head train.sh",
  "grep model train.sh", "cat train.sh | grep SBATCH | wc -l", "history", "date", "whoami", "id", "uptime",
  "ssh node-2", "nvidia-smi", "nvidia-smi -q", "nvidia-smi -q -d PERFORMANCE,TEMPERATURE,POWER,ECC -i 0", "nvidia-smi topo -m",
  "nvidia-smi nvlink -s -i 1", "nvidia-smi -L", "nvidia-smi --query-gpu=index,temperature.gpu,clocks.sm,power.draw --format=csv,noheader",
  "dcgmi diag -r 3", "dcgmi discovery -l", "dmesg", "dmesg -T | tail -2", "ibstat", "all_reduce_perf -g 8", "ps aux", "top", "ss -tnp",
  "systemctl list-units", "systemctl status jupyter-intern", "journalctl -u jupyter-intern -n 3", "sudo crontab -l -u intern", "last",
  "sudo cat /var/log/auth.log", "ls /tmp/.cache/.k", "exit", "pdsh -w node-[1-2] hostname",
];

describe("shell", () => {
  test("every documented command runs without internal errors on every mission", () => {
    for (const m of MISSIONS.filter((x): x is TerminalMission => x.kind === "terminal")) {
      const sim = createMissionSim(m);
      for (const c of CASES) {
        const r = sim.exec(c);
        const internal = r.lines.find((l) => l.text.includes("internal error"));
        expect(internal, `${m.id}: ${c}`).toBeUndefined();
      }
    }
  });

  test("every command name handles no arguments", () => {
    const sim = new Simulation({ seed: 1, gpu: "L40S", fabric: "ETH-100", nodes: 2, files: {} });
    for (const name of COMMAND_NAMES) {
      for (const host of ["login-1", "node-1"]) {
        sim.state.shell.host = host;
        if (["nano", "vim", "vi", "edit", "code"].includes(name)) continue;
        const r = sim.exec(name);
        expect(r.lines.find((l) => l.text.includes("internal error")), `${name}@${host}`).toBeUndefined();
      }
    }
  });

  test("unknown commands and login-node GPU tools give helpful errors", () => {
    const sim = new Simulation({ seed: 1, gpu: "H100", fabric: "IB-NDR", nodes: 2, files: {} });
    expect(sim.exec("foo").lines[0].text).toBe("foo: command not found");
    expect(sim.exec("nvidia-smi").lines.some((l) => l.kind === "info" && l.text.includes("ssh node-1"))).toBe(true);
  });

  test("drain requires a reason", () => {
    const sim = new Simulation({ seed: 1, gpu: "H100", fabric: "IB-NDR", nodes: 2, files: {} });
    expect(sim.exec("scontrol update NodeName=node-1 State=DRAIN").lines[0].text).toMatch(/must specify a reason/);
    expect(sim.exec('scontrol update NodeName=node-[1-2] State=DRAIN Reason="maint"').lines).toEqual([]);
    expect(sim.exec("sinfo").lines[1].text).toMatch(/drain node-\[1-2\]/);
  });
});
