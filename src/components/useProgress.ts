"use client";

import { useEffect, useState } from "react";
import { emptyProgress, loadProgress, onProgressChange, type Progress } from "@/lib/progress";

/** Current progress, re-rendering on every change. Empty during static render, so markup hydrates cleanly. */
export function useProgress(): Progress {
  const [p, setP] = useState<Progress>(emptyProgress);
  useEffect(() => {
    setP(loadProgress());
    return onProgressChange((next) => setP({ ...next }));
  }, []);
  return p;
}
