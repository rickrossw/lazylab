"use client";

import { useRef, useState } from "react";

/**
 * Single-series time chart: 2px line, recessive grid, crosshair + tooltip on hover.
 * The title names the series, so no legend box is needed.
 */
export function TimeChart({
  points,
  yMax,
  yMin = 0,
  format,
  height = 56,
  label,
}: {
  points: { x: number; y: number }[];
  yMax?: number;
  yMin?: number;
  format: (v: number) => string;
  height?: number;
  label: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 300;
  const H = height;
  const pad = 2;
  const max = yMax ?? Math.max(1e-9, ...points.map((p) => p.y)) * 1.15;
  const n = points.length;
  const xs = (i: number) => (n <= 1 ? W : (i / (n - 1)) * W);
  const ys = (v: number) => H - pad - ((Math.min(Math.max(v, yMin), max) - yMin) / (max - yMin || 1)) * (H - pad * 2);
  const d = points.map((p, i) => `${i ? "L" : "M"}${xs(i).toFixed(1)},${ys(p.y).toFixed(1)}`).join("");
  const area = n ? `${d}L${xs(n - 1).toFixed(1)},${H}L0,${H}Z` : "";
  const hp = hover !== null ? points[hover] : null;

  const onMove = (e: React.PointerEvent) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r || n === 0) return;
    const i = Math.round(((e.clientX - r.left) / r.width) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  return (
    <div style={{ position: "relative" }}>
      <svg
        ref={ref}
        className="spark"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ height: H }}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={`${label}: latest ${points.length ? format(points[n - 1].y) : "no data"}`}
      >
        <line className="viz-grid" x1={0} x2={W} y1={H / 2} y2={H / 2} strokeWidth={1} vectorEffect="non-scaling-stroke" strokeDasharray="2 3" />
        <line className="viz-axis" x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        {n > 1 && <path d={area} fill="var(--series-1)" opacity={0.1} />}
        {n > 1 && <path d={d} fill="none" stroke="var(--series-1)" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />}
        {hp && hover !== null && (
          <>
            <line x1={xs(hover)} x2={xs(hover)} y1={0} y2={H} stroke="var(--text-2)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          </>
        )}
        <rect x={0} y={0} width={W} height={H} fill="transparent" />
      </svg>
      {hp && hover !== null && (
        <>
          <span
            style={{
              position: "absolute",
              left: `calc(${(xs(hover) / W) * 100}% - 5px)`,
              top: ys(hp.y) - 5,
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: "var(--series-1)",
              border: "2px solid var(--surface)",
              pointerEvents: "none",
            }}
          />
          <div className="tooltip" style={{ left: `min(calc(${(xs(hover) / W) * 100}% + 8px), calc(100% - 120px))`, top: -30 }}>
            <span className="muted">t={hp.x}s</span> <b className="tnum">{format(hp.y)}</b>
          </div>
        </>
      )}
    </div>
  );
}

export interface XYSeries {
  name: string;
  color: string;
  points: { x: number; y: number }[];
  dashed?: boolean;
}

export interface XYMarker {
  x: number;
  y: number;
  label: string;
  color?: string;
  emphasis?: boolean;
}

/**
 * Multi-series line chart with one y-axis, optional log scales, a legend (≥2 series),
 * end-of-line direct labels and a crosshair tooltip.
 */
export function XYChart({
  series,
  markers = [],
  xLog = false,
  yLog = false,
  xDomain,
  yDomain,
  xTicks,
  yTicks,
  fmtX,
  fmtY,
  xLabel,
  yLabel,
  height = 240,
}: {
  series: XYSeries[];
  markers?: XYMarker[];
  xLog?: boolean;
  yLog?: boolean;
  xDomain: [number, number];
  yDomain: [number, number];
  xTicks: number[];
  yTicks: number[];
  fmtX: (v: number) => string;
  fmtY: (v: number) => string;
  xLabel: string;
  yLabel: string;
  height?: number;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [hx, setHx] = useState<number | null>(null);
  const W = 640;
  const H = height;
  const m = { l: 52, r: 86, t: 12, b: 36 };
  const tx = (v: number) => (xLog ? Math.log10(v) : v);
  const ty = (v: number) => (yLog ? Math.log10(Math.max(v, 1e-12)) : v);
  const [x0, x1] = [tx(xDomain[0]), tx(xDomain[1])];
  const [y0, y1] = [ty(yDomain[0]), ty(yDomain[1])];
  const px = (v: number) => m.l + ((tx(v) - x0) / (x1 - x0)) * (W - m.l - m.r);
  const py = (v: number) => {
    const c = Math.min(Math.max(ty(v), y0), y1);
    return H - m.b - ((c - y0) / (y1 - y0)) * (H - m.t - m.b);
  };
  const path = (pts: { x: number; y: number }[]) => pts.map((p, i) => `${i ? "L" : "M"}${px(p.x).toFixed(1)},${py(p.y).toFixed(1)}`).join("");

  const base = series[0]?.points ?? [];
  const onMove = (e: React.PointerEvent) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r || !base.length) return;
    const sx = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    for (let i = 1; i < base.length; i++) if (Math.abs(px(base[i].x) - sx) < Math.abs(px(base[best].x) - sx)) best = i;
    setHx(best);
  };

  // Direct labels at line ends, nudged apart to avoid collisions.
  const ends = series
    .map((s) => ({ s, y: py(s.points[s.points.length - 1]?.y ?? 0) }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 13) ends[i].y = ends[i - 1].y + 13;

  return (
    <div style={{ position: "relative" }}>
      {series.length >= 2 && (
        <div className="row" style={{ gap: 14, fontSize: 12.5, color: "var(--text-2)", marginBottom: 4 }} aria-label="Legend">
          {series.map((s) => (
            <span key={s.name} className="row" style={{ gap: 6 }}>
              <svg width="18" height="8" aria-hidden>
                <line x1="1" x2="17" y1="4" y2="4" stroke={s.color} strokeWidth="2" strokeDasharray={s.dashed ? "4 3" : undefined} strokeLinecap="round" />
              </svg>
              {s.name}
            </span>
          ))}
        </div>
      )}
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block", touchAction: "pan-y" }} onPointerMove={onMove} onPointerLeave={() => setHx(null)} role="img" aria-label={`${yLabel} versus ${xLabel}`}>
        {yTicks.map((t) => (
          <g key={`y${t}`}>
            <line className="viz-grid" x1={m.l} x2={W - m.r} y1={py(t)} y2={py(t)} strokeWidth={1} />
            <text className="viz-label" x={m.l - 6} y={py(t) + 4} textAnchor="end">{fmtY(t)}</text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text key={`x${t}`} className="viz-label" x={px(t)} y={H - m.b + 16} textAnchor="middle">{fmtX(t)}</text>
        ))}
        <line className="viz-axis" x1={m.l} x2={W - m.r} y1={H - m.b} y2={H - m.b} strokeWidth={1} />
        <text className="viz-label" x={(m.l + W - m.r) / 2} y={H - 4} textAnchor="middle">{xLabel}</text>
        <text className="viz-label" transform={`translate(12 ${(m.t + H - m.b) / 2}) rotate(-90)`} textAnchor="middle">{yLabel}</text>
        {series.map((s) => (
          <path key={s.name} d={path(s.points)} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? "5 4" : undefined} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {ends.map(({ s, y }) => (
          <text key={`l${s.name}`} className="viz-label-strong" x={W - m.r + 6} y={y + 4}>{s.name}</text>
        ))}
        {markers.map((mk, i) => (
          <g key={`m${i}`}>
            <circle cx={px(mk.x)} cy={py(mk.y)} r={mk.emphasis ? 6 : 4.5} fill={mk.color ?? "var(--text-2)"} stroke="var(--surface)" strokeWidth={2} />
            <text className={mk.emphasis ? "viz-label-strong" : "viz-label"} x={px(mk.x) + 8} y={py(mk.y) - 8}>{mk.label}</text>
          </g>
        ))}
        {hx !== null && base[hx] && (
          <g pointerEvents="none">
            <line x1={px(base[hx].x)} x2={px(base[hx].x)} y1={m.t} y2={H - m.b} stroke="var(--text-2)" strokeWidth={1} />
            {series.map((s) => s.points[hx] && <circle key={s.name} cx={px(s.points[hx].x)} cy={py(s.points[hx].y)} r={4.5} fill={s.color} stroke="var(--surface)" strokeWidth={2} />)}
          </g>
        )}
        <rect x={m.l} y={m.t} width={W - m.l - m.r} height={H - m.t - m.b} fill="transparent" />
      </svg>
      {hx !== null && base[hx] && (
        <div className="tooltip" style={{ left: `min(${(px(base[hx].x) / W) * 100}% + 10px, calc(100% - 180px))`, top: 28 }}>
          <div className="muted">{xLabel}: {fmtX(base[hx].x)}</div>
          {series.map((s) => s.points[hx] && (
            <div key={s.name} className="row" style={{ gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, display: "inline-block" }} />
              {s.name}: <b className="tnum">{fmtY(s.points[hx].y)}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
