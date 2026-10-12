"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createMissionSim, getMission, scoreRun, type DesignerMission, type Mission, type TerminalMission } from "@/missions";
import { evaluateDesign, type Design } from "@/sim/designer";
import { FABRICS, GPUS, type FabricId, type GpuModelId } from "@/sim/hardware";
import { missionXp, recordMission } from "@/lib/progress";
import { bossTrack, trackOf } from "@/lib/game";
import { CHAPTERS } from "@/content/chapters";
import { chapterText, entryText, missionText, trackText, type MissionCopy } from "@/content/localized";
import { useLang } from "@/i18n/client";
import { Console } from "./Console";
import { Markdown } from "./Markdown";
import { Difficulty } from "./MissionCards";
import { useSimulation } from "./useSimulation";

interface Result {
  score: number;
  stars: number;
  lines: [string, string][];
}

function Header({ m, copy }: { m: Mission; copy: MissionCopy }) {
  const { lang, t, L } = useLang();
  const tr = trackText(m.track, lang);
  const track = bossTrack(m.id);
  return (
    <div style={{ marginBottom: 14 }}>
      <div className="row" style={{ marginBottom: 4 }}>
        <Link href={L(track ? `/play/${track}/#boss` : "/missions/")} className="muted" style={{ fontSize: 14 }}>
          {t("runner.backChapter")}
        </Link>
        <span className="chip">
          <span className="dot" style={{ background: tr.color }} />
          {tr.name}
        </span>
        <Difficulty level={m.difficulty} />
      </div>
      <h1 style={{ fontSize: "2rem", marginBottom: 2 }}>{copy.title}</h1>
      <p className="muted" style={{ margin: 0 }}>{copy.tagline}</p>
    </div>
  );
}

function Briefing({ copy }: { copy: MissionCopy }) {
  const { lang, t } = useLang();
  return (
    <details open className="panel" style={{ marginBottom: 14 }}>
      <summary className="panel-head" style={{ cursor: "pointer" }}>
        <strong>{t("runner.briefing")}</strong>
        <span className="muted">{t("runner.collapse")}</span>
      </summary>
      <div className="panel-body prose" style={{ maxWidth: "none" }}>
        <Markdown source={copy.briefing} lang={lang} />
      </div>
    </details>
  );
}

function ObjectivesPanel({ items, hints, hintsUsed, onHint }: { items: { text: string; ok: boolean }[]; hints: string[]; hintsUsed: number; onHint: () => void }) {
  const { lang, t } = useLang();
  return (
    <div className="panel">
      <div className="panel-head">
        <strong>{t("runner.objectives")}</strong>
        <span className="muted">{t("runner.met", { n: items.filter((i) => i.ok).length, total: items.length })}</span>
      </div>
      <div className="panel-body">
        <ul className="objectives">
          {items.map((o, i) => (
            <li key={i}>
              <span className={`check${o.ok ? " on" : ""}`} aria-hidden>{o.ok ? "✓" : ""}</span>
              <span>
                {o.text}
                <span className="sr-only">{o.ok ? " ✓" : ""}</span>
              </span>
            </li>
          ))}
        </ul>
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
          {hints.slice(0, hintsUsed).map((h, i) => (
            <div key={i} className="prose" style={{ fontSize: 14, marginBottom: 8 }}>
              <span className="eyebrow">{t("runner.hint", { n: i + 1 })}</span>
              <Markdown source={h} lang={lang} />
            </div>
          ))}
          <button className="btn small" onClick={onHint} disabled={hintsUsed >= hints.length}>
            {hintsUsed >= hints.length ? t("runner.noHints") : t("runner.showHint", { n: hintsUsed + 1, total: hints.length })}
          </button>
          <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>{t("runner.hintCost", { n: Math.round(100 / hints.length) })}</span>
        </div>
      </div>
    </div>
  );
}

function Complete({ m, copy, result, onReplay }: { m: Mission; copy: MissionCopy; result: Result; onReplay: () => void }) {
  const { lang, t, L } = useLang();
  const track = bossTrack(m.id);
  const base = CHAPTERS.find((c) => c.track === track);
  const chapter = base ? chapterText(base, lang) : undefined;
  return (
    <div className="modal-bg">
      <div className="modal" role="dialog" aria-label={copy.title}>
        <div className="panel-body" style={{ padding: 22 }}>
          <div className="eyebrow">{t("done.eyebrow", { xp: missionXp(result.score) })}</div>
          <div className="row" style={{ alignItems: "baseline" }}>
            <h2 style={{ margin: 0 }}>{copy.title}</h2>
            <span className="spacer" />
            <span className="stars" style={{ fontSize: 26 }} aria-label={`${result.stars}/3`}>
              {"★".repeat(result.stars)}
              {"☆".repeat(3 - result.stars)}
            </span>
          </div>
          <div className="readout" style={{ margin: "14px 0" }}>
            <div className="stat">
              <div className="k">{t("done.score")}</div>
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
            <Markdown source={copy.debrief} lang={lang} />
          </div>
          <div className="row" style={{ margin: "10px 0 16px" }}>
            <span className="muted" style={{ fontSize: 13 }}>{t("done.deeper")}</span>
            {m.atlas.map((a) => (
              <Link key={a} href={L(trackOf(a) ? `/play/${trackOf(a)}/#${a}` : `/atlas/${a}/`)} className="chip" style={{ textDecoration: "none" }}>
                {entryText(a, lang)?.title}
              </Link>
            ))}
          </div>
          <div className="row">
            <Link href={L("/")} className="btn primary">{t("done.back")}</Link>
            {chapter && <Link href={L(`/play/${chapter.track}/`)} className="btn">{t("chapter.n", { n: chapter.n })}</Link>}
            <button className="btn" onClick={onReplay}>{t("done.again")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TerminalRunner({ m }: { m: TerminalMission }) {
  const { lang, t } = useLang();
  const copy = missionText(m, lang);
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

  const status = m.objectives.map((o, i) => ({ text: copy.objectives[i] ?? o.text, ok: o.check(sim) }));
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
        [t("done.simTime"), `${min}:${String(elapsed % 60).padStart(2, "0")} (${t("done.par")} ${Math.round(m.parSeconds / 60)}:00)`],
        [t("done.hints"), `${hints}/${m.hints.length}`],
        [t("done.energy"), `${kWh.toFixed(2)} kWh`],
        [t("done.cost"), `$${usd.toFixed(2)}`],
        [t("done.carbon"), `${(kWh * 0.38).toFixed(2)} kg CO₂e`],
      ],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allOk, result, sim, m, hints]);

  const restart = () => {
    setResult(null);
    setHints(0);
    ctl.reset();
  };

  return (
    <>
      <Header m={m} copy={copy} />
      <Briefing copy={copy} />
      <Console
        ctl={ctl}
        welcome={[t("runner.welcome1", { title: copy.title }), t("runner.welcome2")]}
        quick={["help", "cat README.md", "squeue", "sinfo", "sacct"]}
        side={<ObjectivesPanel items={status} hints={copy.hints} hintsUsed={hints} onHint={() => setHints((h) => Math.min(h + 1, m.hints.length))} />}
        hudExtra={
          <button className="btn small" onClick={restart} style={{ marginLeft: "auto" }}>
            {t("runner.restart")}
          </button>
        }
      />
      {result && <Complete m={m} copy={copy} result={result} onReplay={restart} />}
    </>
  );
}

function Meter({ label, value, limit, fmt }: { label: string; value: number; limit: number; fmt: (v: number) => string }) {
  const { t } = useLang();
  const ok = value <= limit;
  const max = Math.max(limit * 1.6, Number.isFinite(value) ? value * 1.05 : limit * 1.6);
  const w = Number.isFinite(value) ? Math.min(100, (value / max) * 100) : 100;
  return (
    <div style={{ marginBottom: 14 }}>
      <div className="row" style={{ fontSize: 13.5, marginBottom: 4 }}>
        <span>{label}</span>
        <span className="spacer" />
        <span className="mono" style={{ color: ok ? "var(--good-text)" : "var(--critical)" }}>
          {ok ? "✓" : "✕"} {Number.isFinite(value) ? fmt(value) : t("designer.noFit")}
        </span>
        <span className="muted mono">/ {fmt(limit)}</span>
      </div>
      <div style={{ position: "relative", height: 12, background: "var(--surface-2)", borderRadius: 6 }} role="img" aria-label={`${label}: ${Number.isFinite(value) ? fmt(value) : "—"} / ${fmt(limit)}`}>
        <div style={{ width: `${w}%`, height: "100%", borderRadius: 6, background: "var(--series-1)" }} />
        <div style={{ position: "absolute", left: `${(limit / max) * 100}%`, top: -4, bottom: -4, borderLeft: "2px dashed var(--text)" }} title={t("designer.limit")} />
      </div>
    </div>
  );
}

function DesignerRunner({ m }: { m: DesignerMission }) {
  const { lang, t } = useLang();
  const copy = missionText(m, lang);
  const [d, setD] = useState<Design>(m.initial);
  const [hints, setHints] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const r = useMemo(() => evaluateDesign(d, m.workload), [d, m.workload]);
  const status = m.objectives.map((o, i) => ({ text: copy.objectives[i] ?? o.text, ok: o.check({ design: d, result: r }) }));
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
        [t("done.design"), t("done.nodesV", { n: d.nodes, gpu: d.gpu, fabric: d.fabric })],
        [t("done.capex"), `$${(r.capexUsd / 1e6).toFixed(2)}M`],
        [t("done.time"), t("done.daysV", { v: r.days.toFixed(1) })],
        [t("done.energy"), t("done.energyBest", { v: r.energyMWh.toFixed(1), best: bestMWh.toFixed(1) })],
        [t("done.carbon"), `${(r.kgCo2 / 1000).toFixed(1)} t CO₂e`],
      ],
    });
  };

  const b = r.best;
  return (
    <>
      <Header m={m} copy={copy} />
      <Briefing copy={copy} />
      <div className="console">
        <div className="stack">
          <div className="panel">
            <div className="panel-head">
              <strong>{t("designer.your")}</strong>
              <span className="muted">{t("designer.perNode")}</span>
            </div>
            <div className="panel-body">
              <div className="controls">
                <div className="control">
                  <label htmlFor="d-gpu">{t("designer.gpu")}</label>
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
                    {t("designer.nodes")} <span className="val">{d.nodes} ({t("designer.gpus", { n: d.nodes * 8 })})</span>
                  </label>
                  <input id="d-nodes" type="range" min={1} max={16} value={d.nodes} onChange={(e) => setD({ ...d, nodes: Number(e.target.value) })} />
                </div>
                <div className="control">
                  <label htmlFor="d-fab">{t("designer.net")}</label>
                  <select id="d-fab" value={d.fabric} onChange={(e) => setD({ ...d, fabric: e.target.value as FabricId })}>
                    {Object.values(FABRICS).map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name} · ${(f.costPerNodeUsd / 1000).toFixed(0)}k/node
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <Meter label={t("designer.capex")} value={r.capexUsd} limit={m.limits.capexUsd} fmt={(v) => `$${(v / 1e6).toFixed(2)}M`} />
              <Meter label={t("designer.power")} value={r.facilityKW} limit={m.limits.facilityKW} fmt={(v) => `${v.toFixed(0)} kW`} />
              <Meter label={t("designer.time")} value={r.days} limit={m.limits.days} fmt={(v) => `${v.toFixed(1)} d`} />
              <div className="readout">
                <div className="stat">
                  <div className="k">{t("designer.energy")}</div>
                  <div className="v">{Number.isFinite(r.energyMWh) ? `${r.energyMWh.toFixed(1)} MWh` : "—"}</div>
                </div>
                <div className="stat">
                  <div className="k">{t("designer.carbon")}</div>
                  <div className="v">{Number.isFinite(r.kgCo2) ? `${(r.kgCo2 / 1000).toFixed(1)} t` : "—"}</div>
                </div>
                <div className="stat">
                  <div className="k">{t("designer.layout")}</div>
                  <div className="v" style={{ fontSize: 15 }}>{b ? `tp${b.config.tp} pp${b.config.pp} zero${b.config.zero} mb${b.config.microBatch}${b.config.ckpt ? " ckpt" : ""}` : t("designer.nothing")}</div>
                </div>
                <div className="stat">
                  <div className="k">{t("designer.mfu")}</div>
                  <div className="v" style={{ fontSize: 15 }}>{b ? `${(b.est.mfu * 100).toFixed(0)}% · ${b.est.bottleneck}` : "—"}</div>
                </div>
              </div>
              <div className="row" style={{ marginTop: 16 }}>
                <button className="btn primary" disabled={!allOk} onClick={submit}>
                  {allOk ? t("designer.submit") : t("designer.meetAll")}
                </button>
                <button className="btn" onClick={() => { setD(m.initial); setResult(null); setHints(0); }}>{t("designer.reset")}</button>
              </div>
            </div>
          </div>
        </div>
        <div className="stack">
          <ObjectivesPanel items={status} hints={copy.hints} hintsUsed={hints} onHint={() => setHints((h) => Math.min(h + 1, m.hints.length))} />
        </div>
      </div>
      {result && <Complete m={m} copy={copy} result={result} onReplay={() => { setResult(null); setD(m.initial); setHints(0); }} />}
    </>
  );
}

export function MissionRunner({ id }: { id: string }) {
  const m = getMission(id);
  if (!m) return null;
  return m.kind === "terminal" ? <TerminalRunner key={m.id} m={m} /> : <DesignerRunner key={m.id} m={m} />;
}
