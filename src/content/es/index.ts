import type { AtlasText } from "./types";
import { HARDWARE_ES } from "./atlas-hardware";
import { SOFTWARE_ES } from "./atlas-software";
import { PARALLELISM_ES } from "./atlas-parallelism";
import { OPS_ES } from "./atlas-ops";

export const ATLAS_ES: Record<string, AtlasText> = { ...HARDWARE_ES, ...SOFTWARE_ES, ...PARALLELISM_ES, ...OPS_ES };
export { CHAPTERS_ES, TRACKS_ES } from "./chapters";
export { MISSIONS_ES } from "./missions";
export { CHALLENGES_ES } from "./levels";
