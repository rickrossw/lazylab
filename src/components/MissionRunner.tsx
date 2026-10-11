"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { MISSIONS, TRACKS, createMissionSim, getMission, scoreRun, type DesignerMission, type Mission, type TerminalMission } from "@/missions";
import { evaluateDesign, type Design } from "@/sim/designer";
import { FABRICS, GPUS, type FabricId, type GpuModelId } from "@/sim/hardware";
import { atlasTitle } from "@/content/atlas";
import { recordMission } from "@/lib/progress";
import { Console } from "./Console";
import { Markdown } from "./Markdown";
import { Difficulty } from "./MissionCards";
import { useSimulation } from "./useSimulation";

interface Result {
  score: number;
  stars: number;
  lines: [string, string][];
}

function Header({ m }: { m: Mission }) {
  const t = TRACKS[m.track];
  return (
    <div style={{ marginBottom: 14 }}>
      <div className="row" style={{ marginBottom: 4 }}>
        <Link href="/missions/" className="muted" style={{ fontSize: 14 }}>← Missions</Link>
        <span className="chip">
          <span className="dot" style={{ background: t.color }} />
          {t.name}
        </span>
        <Difficulty level={m.difficulty} />
      </div>
      <h1 style={{ fontSize: "2rem", marginBottom: 2 }}>{m.title}</h1>
      <p className="muted" style={{ margin: 0 }}>{m.tagline}</p>
    </div>
  );
}

function Briefing({ m }: { m: Mission }) {
  return (
    <details open className="panel" style={{ marginBottom: 14 }}>
      <summary className="panel-head" style={{ cursor: "pointer" }}>
        <strong>Briefing</strong>
        <span className="muted">click to collapse</span>
      </summary>
      <div className="panel-body prose" style={{ maxWidth: "none" }}>
        <Markdown source={m.briefing} resolve={atlasTitle} />
      </div>
    </details>
  );
}

function ObjectivesPanel({ items, hints, hintsUsed, onHint }: { items: { text: string; ok: boolean }[]; hints: string[]; hintsUsed: number; onHint: () => void }) {
  return (
    <div className="panel">
      <div className="panel-head">
        <strong>Objectives</strong>
        <span className="muted">
          {items.filter((i) => i.ok).length}/{items.length} met
        </span>
      </div>
      <div className="panel-body">
        <ul className="objectives">
          {items.map((o, i) => (
            <li key={i}>
              <span className={`check${o.ok ? " on" : ""}`} aria-hidden>{o.ok ? "✓" : ""}</span>
              <span>
                {o.text}
                <span className="sr-only">{o.ok ? " (met)" : " (not met)"}</span>
              </span>
            </li>
          ))}
        </ul>
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
          {hints.slice(0, hintsUsed).map((h, i) => (
            <div key={i} className="prose" style={{ fontSize: 14, marginBottom: 8 }}>
              <span className="eyebrow">Hint {i + 1}</span>
              <Markdown source={h} resolve={atlasTitle} />
            </div>
          ))}
          <button className="btn small" onClick={onHint} disabled={hintsUsed >= hints.length}>
            {hintsUsed >= hints.length ? "No more hints" : `Show hint ${hintsUsed + 1}/${hints.length}`}
          </button>
          <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>−{Math.round(100 / hints.length)} pts each</span>
        </div>
      </div>
    </div>
  );
}

function Complete({ m, result, onReplay }: { m: Mission; result: Result; onReplay: () => void }) {
  const idx = MISSIONS.findIndex((x) => x.id === m.id);
  const next = MISSIONS[idx + 1];
  return (
    <div className="modal-bg">
      <div className="modal" role="dialog" aria-label="Mission complete">
        <div className="panel-body" style={{ padding: 22 }}>
          <div className="eyebrow">Mission complete</div>
          <div className="row" style={{ alignItems: "baseline" }}>
            <h2 style={{ margin: 0 }}>{m.title}</h2>
            <span className="spacer" />
            <span className="stars" style={{ fontSize: 26 }} aria-label={`${result.stars} of 3 stars`}>
              {"★".repeat(result.stars)}
              {"☆".repeat(3 - result.stars)}
            </span>
          </div>
          <div className="readout" style={{ margin: "14px 0" }}>
            <div className="stat">
              <div className="k">Score</div>
              <div className="v">{result.score}</div>
            </div>
            {result.lines.map(([k, v]) => (
              <div className="stat" key={k}>
                <div className="k">{k}</div>
                <div className="v" style={{ fontSize: 18 }}>{v}</div>
              </div>
            ))}
          </div>
          <div className="prose" style={{ maxWidth: "none" }}>
            <Markdown source={m.debrief} resolve={atlasTitle} />
          </div>
          <div className="row" style={{ margin: "10px 0 16px" }}>
            <span className="muted" style={{ fontSize: 13 }}>Go deeper:</span>
            {m.atlas.map((a) => (
              <Link key={a} href={`/atlas/${a}/`} className="chip" style={{ textDecoration: "none" }}>{atlasTitle(a)}</Link>
            ))}
          </div>
          <div className="row">
            {next ? (
              <Link href={`/missions/${next.id}/`} className="btn primary">Next: {next.title} →</Link>
            ) : (
              <Link href="/lab/" className="btn primary">Free play in the Lab →</Link>
            )}
            <button className="btn" onClick={onReplay}>Play again</button>
            <Link href="/missions/" className="btn">All missions</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function TerminalRunner({ m }: { m: TerminalMission }) {
  const ctl = useSimulation(() => createMissionSim(m));
  const { sim } = ctl;
  const [hints, setHints] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const startT = useRef(sim.state.t);
  const startAcct = useRef({ ...sim.state.acct });
  useEffect(() => {
    startT.current = sim.state.t;
    startAcct.current = { ...sim.state.acct };
  }, [sim]);

  const status = m.objectives.map((o) => ({ text: o.text, ok: o.check(sim) }));
  const allOk = status.every((s) => s.ok);

  useEffect(() => {
    if (!allOk || result) return;
    ctl.setPaused(true);
    const elapsed = sim.state.t - startT.current;
    const s = scoreRun(m.parSeconds, elapsed, hints, m.hints.length);
    const kWh = sim.state.acct.kWh - startAcct.current.kWh;
    const usd = sim.state.acct.usd - startAcct.current.usd;
    recordMission(m.id, s.score, s.stars);
    const min = Math.floor(elapsed / 60);
    setResult({
      score: s.score,
      stars: s.stars,
      lines: [
        ["Sim time", `${min}:${String(elapsed % 60).padStart(2, "0")} (par ${Math.round(m.parSeconds / 60)}:00)`],
        ["Hints", `${hints}/${m.hints.length}`],
        ["Energy", `${kWh.toFixed(2)} kWh`],
        ["Cost", `$${usd.toFixed(2)}`],
        ["Carbon", `${(kWh * 0.38).toFixed(2)} kg CO₂e`],
      ],
    });
  }, [allOk, result, sim, m, hints, ctl]);

  const restart = () => {
    setResult(null);
    setHints(0);
    ctl.reset();
  };

  return (
    <>
      <Header m={m} />
      <Briefing m={m} />
      <Console
        ctl={ctl}
        welcome={[`Mission: ${m.title}. You are ops@login-1 with sudo.`, "Type `help` for commands, `cat README.md` for notes. Objectives check themselves (right panel)."]}
        quick={["help", "cat README.md", "squeue", "sinfo", "sacct"]}
        side={<ObjectivesPanel items={status} hints={m.hints} hintsUsed={hints} onHint={() => setHints((h) => Math.min(h + 1, m.hints.length))} />}
        hudExtra={
          <button className="btn small" onClick={restart} style={{ marginLeft: "auto" }}>
            Restart mission
          </button>
        }
      />
      {result && <Complete m={m} result={result} onReplay={restart} />}
    </>
  );
}

function Meter({ label, value, limit, fmt, lowerIsBetter = true }: { label: string; value: number; limit: number; fmt: (v: number) => string; lowerIsBetter?: boolean }) {
  const ok = lowerIsBetter ? value <= limit : value >= limit;
  const max = Math.max(limit * 1.6, Number.isFinite(value) ? value * 1.05 : limit * 1.6);
  const w = Number.isFinite(value) ? Math.min(100, (value / max) * 100) : 100;
  return (
    <div style={{ marginBottom: 14 }}>
      <div className="row" style={{ fontSize: 13.5, marginBottom: 4 }}>
        <span>{label}</span>
        <span className="spacer" />
        <span className="mono" style={{ color: ok ? "var(--good-text)" : "var(--critical)" }}>
          {ok ? "✓" : "✕"} {Number.isFinite(value) ? fmt(value) : "doesn't fit"}
        </span>
        <span className="muted mono">/ {fmt(limit)}</span>
      </div>
      <div style={{ position: "relative", height: 12, background: "var(--surface-2)", borderRadius: 6 }} role="img" aria-label={`${label} ${Number.isFinite(value) ? fmt(value) : "n/a"} of limit ${fmt(limit)}`}>
        <div style={{ width: `${w}%`, height: "100%", borderRadius: 6, background: "var(--series-1)" }} />
        <div style={{ position: "absolute", left: `${(limit / max) * 100}%`, top: -4, bottom: -4, borderLeft: "2px dashed var(--text)" }} title="limit" />
      </div>
    </div>
  );
}

function DesignerRunner({ m }: { m: DesignerMission }) {
  const [d, setD] = useState<Design>(m.initial);
  const [hints, setHints] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const r = useMemo(() => evaluateDesign(d, m.workload), [d, m.workload]);
  const status = m.objectives.map((o) => ({ text: o.text, ok: o.check({ design: d, result: r }) }));
  const allOk = status.every((s) => s.ok);
  const bestMWh = useMemo(() => {
    let best = Infinity;
    for (const gpu of Object.keys(GPUS) as GpuModelId[])
      for (const fabric of Object.keys(FABRICS) as FabricId[])
        for (let nodes = 1; nodes <= 16; nodes++) {
          const design = { gpu, nodes, fabric };
          const res = evaluateDesign(design, m.workload);
          if (m.objectives.every((o) => o.check({ design, result: res }))) best = Math.min(best, res.energyMWh);
        }
    return best;
  }, [m]);

  const submit = () => {
    const eff = Math.min(1, bestMWh / r.energyMWh);
    const score = Math.round(600 + 300 * eff + 100 * (1 - hints / m.hints.length));
    const stars = score >= 900 ? 3 : score >= 760 ? 2 : 1;
    recordMission(m.id, score, stars);
    setResult({
      score,
      stars,
      lines: [
        ["Design", `${d.nodes}× ${d.gpu} nodes, ${d.fabric}`],
        ["Capex", `$${(r.capexUsd / 1e6).toFixed(2)}M`],
        ["Time to train", `${r.days.toFixed(1)} days`],
        ["Energy", `${r.energyMWh.toFixed(1)} MWh (best ${bestMWh.toFixed(1)})`],
        ["Carbon", `${(r.kgCo2 / 1000).toFixed(1)} t CO₂e`],
      ],
    });
  };

  const b = r.best;
  return (
    <>
      <Header m={m} />
      <Briefing m={m} />
      <div className="console">
        <div className="stack">
          <div className="panel">
            <div className="panel-head">
              <strong>Your design</strong>
              <span className="muted">8 GPUs per node</span>
            </div>
            <div className="panel-body">
              <div className="controls">
                <div className="control">
                  <label htmlFor="d-gpu">GPU</label>
                  <select id="d-gpu" value={d.gpu} onChange={(e) => setD({ ...d, gpu: e.target.value as GpuModelId })}>
                    {Object.values(GPUS).map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name} · ${(g.priceUsd / 1000).toFixed(0)}k · {g.tdpW} W
                      </option>
                    ))}
                  </select>
                </div>
                <div className="control">
                  <label htmlFor="d-nodes">
                    Nodes <span className="val">{d.nodes} ({d.nodes * 8} GPUs)</span>
                  </label>
                  <input id="d-nodes" type="range" min={1} max={16} value={d.nodes} onChange={(e) => setD({ ...d, nodes: Number(e.target.value) })} />
                </div>
                <div className="control">
                  <label htmlFor="d-fab">Scale-out network</label>
                  <select id="d-fab" value={d.fabric} onChange={(e) => setD({ ...d, fabric: e.target.value as FabricId })}>
                    {Object.values(FABRICS).map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name} · ${(f.costPerNodeUsd / 1000).toFixed(0)}k/node
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <Meter label="Capex" value={r.capexUsd} limit={m.limits.capexUsd} fmt={(v) => `$${(v / 1e6).toFixed(2)}M`} />
              <Meter label="Facility power" value={r.facilityKW} limit={m.limits.facilityKW} fmt={(v) => `${v.toFixed(0)} kW`} />
              <Meter label="Time to train" value={r.days} limit={m.limits.days} fmt={(v) => `${v.toFixed(1)} d`} />
              <div className="readout">
                <div className="stat">
                  <div className="k">Energy to train</div>
                  <div className="v">{Number.isFinite(r.energyMWh) ? `${r.energyMWh.toFixed(1)} MWh` : "—"}</div>
                </div>
                <div className="stat">
                  <div className="k">Carbon</div>
                  <div className="v">{Number.isFinite(r.kgCo2) ? `${(r.kgCo2 / 1000).toFixed(1)} t` : "—"}</div>
                </div>
                <div className="stat">
                  <div className="k">Best layout</div>
                  <div className="v" style={{ fontSize: 15 }}>{b ? `tp${b.config.tp} pp${b.config.pp} zero${b.config.zero} mb${b.config.microBatch}${b.config.ckpt ? " ckpt" : ""}` : "nothing fits"}</div>
                </div>
                <div className="stat">
                  <div className="k">MFU / bottleneck</div>
                  <div className="v" style={{ fontSize: 15 }}>{b ? `${(b.est.mfu * 100).toFixed(0)}% · ${b.est.bottleneck}` : "—"}</div>
                </div>
              </div>
              <div className="row" style={{ marginTop: 16 }}>
                <button className="btn primary" disabled={!allOk} onClick={submit}>
                  {allOk ? "Submit design" : "Meet all constraints to submit"}
                </button>
                <button className="btn" onClick={() => { setD(m.initial); setResult(null); setHints(0); }}>Reset</button>
              </div>
            </div>
          </div>
        </div>
        <div className="stack">
          <ObjectivesPanel items={status} hints={m.hints} hintsUsed={hints} onHint={() => setHints((h) => Math.min(h + 1, m.hints.length))} />
        </div>
      </div>
      {result && <Complete m={m} result={result} onReplay={() => { setResult(null); setD(m.initial); setHints(0); }} />}
    </>
  );
}

export function MissionRunner({ id }: { id: string }) {
  const m = getMission(id);
  if (!m) return null;
  return m.kind === "terminal" ? <TerminalRunner key={m.id} m={m} /> : <DesignerRunner key={m.id} m={m} />;
}
