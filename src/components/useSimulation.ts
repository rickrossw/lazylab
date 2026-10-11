"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { Simulation } from "@/sim/sim";

export const SPEEDS = [1, 4, 16] as const;

/** Owns a Simulation and advances it on a timer. `speed` is sim-seconds per real second. */
export function useSimulation(make: () => Simulation) {
  const makeRef = useRef(make);
  makeRef.current = make;
  const [sim, setSim] = useState<Simulation>(() => make());
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const [speed, setSpeed] = useState<number>(4);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => {
      sim.tick();
      bump();
    }, 1000 / speed);
    return () => window.clearInterval(id);
  }, [sim, speed, paused]);

  const reset = useCallback(() => {
    setSim(makeRef.current());
    setPaused(false);
  }, []);

  return { sim, speed, setSpeed, paused, setPaused, reset, refresh: bump, setSim };
}

export type SimControls = ReturnType<typeof useSimulation>;
