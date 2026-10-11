"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MISSIONS } from "@/missions";
import { loadProgress } from "@/lib/progress";
import { MissionRunner } from "./MissionRunner";

/** The game entry point: drops you straight into the first mission you haven't finished. */
export function Play() {
  const [id, setId] = useState(MISSIONS[0].id);
  const [done, setDone] = useState(0);
  useEffect(() => {
    const p = loadProgress();
    const next = MISSIONS.find((m) => !p.missions[m.id]);
    setDone(MISSIONS.filter((m) => p.missions[m.id]).length);
    if (next) setId(next.id);
  }, []);
  const idx = MISSIONS.findIndex((m) => m.id === id);
  return (
    <>
      <div className="row" style={{ marginBottom: 10, fontSize: 13.5 }}>
        <span className="eyebrow">
          Mission {idx + 1} of {MISSIONS.length}
        </span>
        <span className="muted">
          · {done} completed · progress saves automatically
        </span>
        <span className="spacer" />
        <Link href="/missions/" className="muted">
          Pick a different mission
        </Link>
      </div>
      <MissionRunner key={id} id={id} />
    </>
  );
}
