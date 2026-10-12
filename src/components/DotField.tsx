import { Rng } from "@/sim/rng";

/** Decorative "cluster" field: 6 racks × 8 nodes × 8 GPUs, shaded like a utilization heatmap. */
export function DotField() {
  const rng = new Rng(2026);
  const cells: { x: number; y: number; c: string; o: number }[] = [];
  const cols = 48;
  const rows = 8;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = rng.next();
      const hot = Math.sin((c / cols) * Math.PI) * 0.6 + v * 0.4;
      cells.push({ x: c * 12 + (Math.floor(c / 8) * 6), y: r * 12, c: hot > 0.78 ? "#e0ff4f" : hot > 0.5 ? "#8f82ff" : "#3987e5", o: 0.35 + hot * 0.65 });
    }
  }
  const w = cols * 12 + 5 * 6;
  return (
    <svg className="dotfield" viewBox={`0 0 ${w} ${rows * 12}`} aria-hidden>
      {cells.map((d, i) => (
        <rect key={i} x={d.x} y={d.y} width={9} height={9} rx={2} fill={d.c} opacity={d.o} />
      ))}
    </svg>
  );
}
