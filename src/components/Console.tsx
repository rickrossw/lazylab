"use client";

import { useState, type ReactNode } from "react";
import type { Simulation } from "@/sim/sim";
import { TimeChart } from "./Charts";
import { EditorModal, Terminal } from "./Terminal";
import { GpuDetail, Topology, TopoLegend, type GpuRef, type TopoMode } from "./Topology";
import { SPEEDS, type SimControls } from "./useSimulation";
import { useLang } from "@/i18n/client";

function fmtTime(t: number) {
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function Hud({ ctl, extra }: { ctl: SimControls; extra?: ReactNode }) {
  const { t } = useLang();
  const { sim, speed, setSpeed, paused, setPaused } = ctl;
  const a = sim.state.acct;
  return (
    <div className="hud">
      <span>
        {t("hud.simTime")} <b>{fmtTime(sim.state.t)}</b>
      </span>
      <span className="seg" role="group" aria-label={t("hud.speed")}>
        <button aria-pressed={paused} onClick={() => setPaused(!paused)} title={paused ? t("hud.resume") : t("hud.pause")}>
          {paused ? "▶" : "❚❚"}
        </button>
        {SPEEDS.map((s) => (
          <button key={s} aria-pressed={!paused && speed === s} onClick={() => { setSpeed(s); setPaused(false); }}>
            {s}×
          </button>
        ))}
      </span>
      <span title={t("hud.energyTip")}>
        {t("hud.energy")} <b>{a.kWh.toFixed(2)} kWh</b>
      </span>
      <span title={t("hud.costTip")}>
        {t("hud.cost")} <b>${a.usd.toFixed(2)}</b>
      </span>
      <span title={t("hud.carbonTip")}>
        {t("hud.carbon")} <b>{a.kgCo2.toFixed(2)} kg CO₂e</b>
      </span>
      {extra}
    </div>
  );
}

export function MetricsPanel({ sim }: { sim: Simulation }) {
  const { t } = useLang();
  const h = sim.state.history;
  const last = h[h.length - 1];
  const series = (k: "utilAvg" | "powerKW" | "tokensPerSec" | "mfu" | "maxTemp", scale = 1) => h.map((s) => ({ x: s.t, y: s[k] * scale }));
  const tok = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0));
  const metrics = [
    { key: "tok", title: t("dash.tok"), value: last ? `${tok(last.tokensPerSec)} tok/s` : "—", pts: series("tokensPerSec"), fmt: (v: number) => `${tok(v)} tok/s` },
    { key: "mfu", title: t("dash.mfu"), value: last ? `${(last.mfu * 100).toFixed(1)}%` : "—", pts: series("mfu", 100), max: 100, fmt: (v: number) => `${v.toFixed(1)}%` },
    { key: "util", title: t("dash.util"), value: last ? `${(last.utilAvg * 100).toFixed(0)}%` : "—", pts: series("utilAvg", 100), max: 100, fmt: (v: number) => `${v.toFixed(0)}%` },
    { key: "pow", title: t("dash.power"), value: last ? `${last.powerKW.toFixed(1)} kW` : "—", pts: series("powerKW"), fmt: (v: number) => `${v.toFixed(1)} kW` },
    { key: "temp", title: t("dash.temp"), value: last ? `${last.maxTemp.toFixed(0)}°C` : "—", pts: series("maxTemp"), max: 100, min: 20, fmt: (v: number) => `${v.toFixed(0)}°C` },
  ];
  return (
    <div className="panel">
      <div className="panel-head">
        <strong>{t("dash.title")}</strong>
        <span className="muted">{t("dash.sub", { n: Math.min(h.length, 240) })}</span>
      </div>
      <div className="panel-body" style={{ paddingTop: 0, paddingBottom: 0 }}>
        {metrics.map((m) => (
          <div className="metric" key={m.key}>
            <div className="metric-head">
              <span>{m.title}</span>
              <span className="v tnum">{m.value}</span>
            </div>
            <TimeChart points={m.pts} yMax={m.max} yMin={m.min} format={m.fmt} label={m.title} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function AlertsPanel({ sim }: { sim: Simulation }) {
  const { t } = useLang();
  const alerts = [...sim.state.alerts].sort((a, b) => Number(b.active) - Number(a.active) || b.firstT - a.firstT).slice(0, 8);
  const firing = sim.state.alerts.filter((a) => a.active).length;
  return (
    <div className="panel">
      <div className="panel-head">
        <strong>{t("alerts.title")}</strong>
        <span className="muted">{firing ? t("alerts.firing", { n: firing }) : t("alerts.clear")}</span>
      </div>
      <div className="panel-body" style={{ paddingTop: 2, paddingBottom: 2 }}>
        {alerts.length === 0 && <div className="muted" style={{ fontSize: 13, padding: "8px 0" }}>{t("alerts.none")}</div>}
        {alerts.map((a) => (
          <div key={a.key} className={`alert ${a.severity}${a.active ? "" : " resolved"}`}>
            <span className="ico" aria-hidden>
              {a.severity === "critical" ? "!" : "▲"}
            </span>
            <div>
              <div>
                <span className="rule">{a.rule}</span> <span className="muted">{a.target}</span>
                <span className="muted"> · {a.active ? a.severity : t("alerts.resolved")}</span>
              </div>
              <div className="muted">{a.message}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Console({
  ctl,
  welcome,
  quick,
  side,
  hudExtra,
  onCommand,
}: {
  ctl: SimControls;
  welcome: string[];
  quick?: string[];
  side?: ReactNode;
  hudExtra?: ReactNode;
  onCommand?: () => void;
}) {
  const { t } = useLang();
  const { sim, refresh } = ctl;
  const [mode, setMode] = useState<TopoMode>("util");
  const [sel, setSel] = useState<GpuRef | null>(null);
  const [editing, setEditing] = useState<{ path: string; content: string; readOnly: boolean } | null>(null);

  return (
    <>
      <div className="panel" style={{ padding: "10px 14px", marginBottom: 14 }}>
        <Hud ctl={ctl} extra={hudExtra} />
      </div>
      <div className="console">
        <div className="stack" style={{ minWidth: 0 }}>
          <div className="panel">
            <div className="panel-head">
              <strong>{t("cluster.title")}</strong>
              <span className="muted">
                {sim.state.nodes.length} × 8 {sim.gpuSpec.name} · {sim.state.fabric}
              </span>
              <span className="spacer" />
              <span className="seg" role="group" aria-label={t("cluster.colorBy")}>
                {(["util", "temp", "power"] as TopoMode[]).map((m) => (
                  <button key={m} aria-pressed={mode === m} onClick={() => setMode(m)}>
                    {m === "util" ? t("cluster.util") : m === "temp" ? t("cluster.temp") : t("cluster.power")}
                  </button>
                ))}
              </span>
            </div>
            <div className="panel-body">
              <Topology sim={sim} mode={mode} selected={sel} onSelect={(r) => setSel(sel && sel.node === r.node && sel.gpu === r.gpu ? null : r)} />
              <div className="row" style={{ marginTop: 10 }}>
                <TopoLegend mode={mode} />
                <span className="spacer" />
                <span className="muted" style={{ fontSize: 12 }}>{t("cluster.click")}</span>
              </div>
              {sel && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                  <GpuDetail sim={sim} sel={sel} />
                </div>
              )}
            </div>
          </div>
          <Terminal sim={sim} welcome={welcome} quick={quick} onRan={() => { refresh(); onCommand?.(); }} onEdit={(path, content, readOnly) => setEditing({ path, content, readOnly })} />
        </div>
        <div className="stack">
          {side}
          <AlertsPanel sim={sim} />
          <MetricsPanel sim={sim} />
        </div>
      </div>
      {editing && (
        <EditorModal
          path={editing.path}
          content={editing.content}
          readOnly={editing.readOnly}
          onClose={() => setEditing(null)}
          onSave={(text) => {
            sim.writeFile(editing.path, text);
            setEditing(null);
            refresh();
            onCommand?.();
          }}
        />
      )}
    </>
  );
}
