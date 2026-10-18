import type { AtlasCategory } from "../atlas";

export const CATEGORY_ES: Record<AtlasCategory, string> = {
  Hardware: "Hardware",
  Interconnect: "Interconexión",
  "Software stack": "Pila de software",
  Parallelism: "Paralelismo",
  Performance: "Rendimiento",
  Operations: "Operación",
  Security: "Seguridad",
  "Responsible compute": "Cómputo responsable",
};

export const RANKS_ES: Record<string, string> = {
  Intern: "Practicante",
  "Junior SRE": "SRE Junior",
  SRE: "SRE",
  "Senior SRE": "SRE Senior",
  "Staff Engineer": "Staff Engineer",
  "Principal Engineer": "Principal Engineer",
  "Distinguished Engineer": "Distinguished Engineer",
};
