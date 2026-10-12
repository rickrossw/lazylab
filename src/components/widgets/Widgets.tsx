"use client";

import { useMemo, useState, type ReactNode } from "react";
import { GPUS, MODELS, type GpuModelId, type ModelId } from "@/sim/hardware";
import { estimateMemory, peakTFLOPs, powerModel, ringAllReduceMs, rooflineTFLOPs, scalingSpeedup, treeAllReduceMs, type Precision, type TrainConfig } from "@/sim/perf";
import type { WidgetId } from "@/content/atlas";
import { XYChart } from "../Charts";
import { useLang } from "@/i18n/client";

function Shell({ title, children, note }: { title: string; children: ReactNode; note?: string }) {
  const { t } = useLang();
  return (
    <section className="widget" aria-label={title}>
      <div className="widget-title">
        <span className="live">{t("w.live")}</span> {title}
      </div>
      {children}
      {note && <p className="muted" style={{ fontSize: 12.5, margin: "10px 0 0" }}>{note}</p>}
    </section>
  );
}

function Slider({ id, label, value, display, min, max, step = 1, onChange }: { id: string; label: string; value: number; display: string; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  return (
    <div className="control">
      <label htmlFor={id}>
        {label} <span className="val">{display}</span>
      </label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

function Select<T extends string | number>({ id, label, value, options, onChange }: { id: string; label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="control">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={String(value)} onChange={(e) => onChange((typeof value === "number" ? Number(e.target.value) : e.target.value) as T)}>
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function Stat({ k, v, tone }: { k: string; v: string; tone?: "ok" | "bad" }) {
  return (
    <div className="stat">
      <div className="k">{k}</div>
      <div className={`v tnum${tone ? " " + tone : ""}`}>{v}</div>
    </div>
  );
}

const fmtSi = (v: number) => (v >= 1000 ? `${+(v / 1000).toFixed(1)}k` : v >= 1 ? `${+v.toFixed(1)}` : `${+v.toPrecision(2)}`);
const logRange = (a: number, b: number, n: number) => Array.from({ length: n }, (_, i) => a * Math.pow(b / a, i / (n - 1)));
const GPU_OPTS = (Object.keys(GPUS) as GpuModelId[]).map((g) => ({ value: g, label: GPUS[g].name }));

// ------------------------------------------------------------------ roofline

function Roofline() {
  const { t } = useLang();
  const [gpu, setGpu] = useState<GpuModelId>("H100");
  const [prec, setPrec] = useState<Precision>("bf16");
  const [logAi, setLogAi] = useState(1.5);
  const g = GPUS[gpu];
  const ai = Math.pow(10, logAi);
  const peak = peakTFLOPs(g, prec);
  const ridge = (peak * 1000) / g.memBwGBs;
  const att = rooflineTFLOPs(g, ai, prec);
  const xs = logRange(0.1, 10000, 120);
  const kernels = [
    { x: 0.25, label: "vector add" },
    { x: 2, label: "layer norm" },
    { x: 40, label: "small GEMM" },
    { x: 1365, label: "4k×4k GEMM" },
  ];
  return (
    <Shell title={t("w.roof.title")} note={t("w.roof.note")}>
      <div className="controls">
        <Select id="rl-gpu" label="GPU" value={gpu} options={GPU_OPTS} onChange={setGpu} />
        <Select id="rl-prec" label={t("w.precision")} value={prec} options={[{ value: "fp32", label: t("w.fp32") }, { value: "bf16", label: t("w.bf16") }, { value: "fp8", label: "FP8" }]} onChange={setPrec} />
        <Slider id="rl-ai" label={t("w.ai")} value={logAi} display={`${fmtSi(ai)} FLOP/B`} min={-1} max={4} step={0.02} onChange={setLogAi} />
      </div>
      <XYChart
        series={[{ name: t("w.attainable").toLowerCase(), color: "var(--series-1)", points: xs.map((x) => ({ x, y: rooflineTFLOPs(g, x, prec) })) }]}
        markers={[
          ...kernels.map((k) => ({ x: k.x, y: rooflineTFLOPs(g, k.x, prec), label: k.label })),
          { x: ai, y: att, label: t("w.you"), color: "var(--series-2)", emphasis: true },
        ]}
        xLog
        yLog
        xDomain={[0.1, 10000]}
        yDomain={[0.1, 3000]}
        xTicks={[0.1, 1, 10, 100, 1000, 10000]}
        yTicks={[0.1, 1, 10, 100, 1000]}
        fmtX={fmtSi}
        fmtY={fmtSi}
        xLabel={t("w.flopsPerByte")}
        yLabel="TFLOP/s"
      />
      <div className="readout">
        <Stat k={t("w.attainable")} v={`${fmtSi(att)} TFLOP/s`} />
        <Stat k={t("w.pctPeak")} v={`${((att / peak) * 100).toFixed(0)}%`} />
        <Stat k={t("w.ridge")} v={`${ridge.toFixed(0)} FLOP/B`} />
        <Stat k={t("w.regime")} v={ai < ridge ? t("w.memBound") : t("w.computeBound")} tone={ai < ridge ? "bad" : "ok"} />
      </div>
    </Shell>
  );
}

// ------------------------------------------------------------------ memory calculator

const MEM_PARTS = [
  { key: "weightsGB", key2: "w.weights", color: "#2a78d6" },
  { key: "gradsGB", key2: "w.grads", color: "#eb6834" },
  { key: "optimizerGB", key2: "w.optimizer", color: "#1baf7a" },
  { key: "activationsGB", key2: "w.activations", color: "#eda100" },
  { key: "overheadGB", key2: "w.framework", color: "#9a9890" },
] as const;

function MemoryCalc() {
  const { t } = useLang();
  const [model, setModel] = useState<ModelId>("7b");
  const [gpu, setGpu] = useState<GpuModelId>("H100");
  const [gpus, setGpus] = useState(16);
  const [tp, setTp] = useState(1);
  const [pp, setPp] = useState(1);
  const [zero, setZero] = useState<0 | 1 | 2 | 3>(1);
  const [mb, setMb] = useState(2);
  const [ckpt, setCkpt] = useState(false);
  const [prec, setPrec] = useState<Precision>("bf16");
  const shard = tp * pp;
  const valid = gpus % shard === 0;
  const dp = valid ? gpus / shard : 1;
  const cfg: TrainConfig = { model, precision: prec, microBatch: mb, seqLen: 4096, gradAccum: 1, tp, pp, zero, overlap: true, ckpt, workers: 8 };
  const mem = estimateMemory(cfg, GPUS[gpu], dp);
  const cap = GPUS[gpu].memGB;
  const scaleMax = Math.max(cap * 1.25, mem.totalGB * 1.05);
  const fits = mem.totalGB <= cap;
  return (
    <Shell title={t("w.mem.title")} note={t("w.mem.note")}>
      <div className="controls">
        <Select id="mc-model" label={t("w.model")} value={model} options={(Object.keys(MODELS) as ModelId[]).map((m) => ({ value: m, label: MODELS[m].name }))} onChange={setModel} />
        <Select id="mc-gpu" label="GPU" value={gpu} options={GPU_OPTS} onChange={setGpu} />
        <Select id="mc-gpus" label={t("w.gpusInJob")} value={gpus} options={[1, 8, 16, 32, 64, 128].map((v) => ({ value: v, label: String(v) }))} onChange={setGpus} />
        <Select id="mc-prec" label={t("w.precision")} value={prec} options={[{ value: "bf16", label: t("w.bf16mixed") }, { value: "fp32", label: "FP32" }]} onChange={setPrec} />
        <Select id="mc-tp" label={t("w.tp")} value={tp} options={[1, 2, 4, 8].map((v) => ({ value: v, label: String(v) }))} onChange={setTp} />
        <Select id="mc-pp" label={t("w.pp")} value={pp} options={[1, 2, 4, 8].map((v) => ({ value: v, label: String(v) }))} onChange={setPp} />
        <Select id="mc-zero" label={t("w.zero")} value={zero} options={[0, 1, 2, 3].map((v) => ({ value: v as 0 | 1 | 2 | 3, label: String(v) }))} onChange={setZero} />
        <Select id="mc-mb" label={t("w.mb")} value={mb} options={[1, 2, 4, 8].map((v) => ({ value: v, label: String(v) }))} onChange={setMb} />
        <div className="control">
          <label htmlFor="mc-ckpt">{t("w.ckpt")}</label>
          <select id="mc-ckpt" value={ckpt ? "on" : "off"} onChange={(e) => setCkpt(e.target.value === "on")}>
            <option value="off">{t("w.off")}</option>
            <option value="on">{t("w.on")}</option>
          </select>
        </div>
      </div>
      {!valid ? (
        <p className="muted">{t("w.notDivisible", { gpus, shard })}</p>
      ) : (
        <>
          <div className="row" style={{ gap: 14, fontSize: 12.5, color: "var(--text-2)", marginBottom: 6 }}>
            {MEM_PARTS.map((p) => (
              <span key={p.key} className="row" style={{ gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: p.color }} />
                {t(p.key2)} <span className="mono">{mem[p.key].toFixed(1)} GB</span>
              </span>
            ))}
          </div>
          <div style={{ position: "relative", height: 34, background: "var(--surface-2)", borderRadius: 6 }} role="img" aria-label={`${mem.totalGB.toFixed(1)} / ${cap} GB`}>
            <div style={{ display: "flex", gap: 2, height: "100%" }}>
              {MEM_PARTS.map((p) => (
                <div key={p.key} title={`${t(p.key2)}: ${mem[p.key].toFixed(1)} GB`} style={{ width: `${(mem[p.key] / scaleMax) * 100}%`, background: p.color, borderRadius: 4, minWidth: mem[p.key] > 0.05 ? 2 : 0 }} />
              ))}
            </div>
            <div style={{ position: "absolute", left: `${(cap / scaleMax) * 100}%`, top: -6, bottom: -6, borderLeft: "2px dashed var(--text)" }} />
            <span className="mono" style={{ position: "absolute", left: `calc(${(cap / scaleMax) * 100}% + 6px)`, top: "calc(100% + 4px)", fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>
              {cap} GB HBM
            </span>
          </div>
          <div className="readout" style={{ marginTop: 26 }}>
            <Stat k={t("w.perGpu")} v={`${mem.totalGB.toFixed(1)} GB`} tone={fits ? "ok" : "bad"} />
            <Stat k={t("w.verdict")} v={fits ? t("w.fits") : "OOM"} tone={fits ? "ok" : "bad"} />
            <Stat k={t("w.dp")} v={`dp = ${dp}`} />
            <Stat k={t("w.paramsGpu")} v={`${((MODELS[model].params / shard) / 1e9).toFixed(2)} B`} />
          </div>
        </>
      )}
    </Shell>
  );
}

// ------------------------------------------------------------------ all-reduce

const LINKS = [
  { value: "nvlink", label: "NVLink (H100) 450 GB/s", bw: 450, a: 5 },
  { value: "ib", label: "InfiniBand NDR 48 GB/s", bw: 48, a: 20 },
  { value: "pcie", label: "PCIe Gen5 64 GB/s", bw: 64, a: 8 },
  { value: "eth", label: "100 GbE TCP 10 GB/s", bw: 10, a: 40 },
];

function AllReduce() {
  const { t } = useLang();
  const [link, setLink] = useState("ib");
  const [logN, setLogN] = useState(5);
  const [logS, setLogS] = useState(8.5);
  const l = LINKS.find((x) => x.value === link)!;
  const n = Math.round(Math.pow(2, logN));
  const size = Math.pow(10, logS);
  const sizes = logRange(1e3, 1e10, 60);
  const ring = ringAllReduceMs(size, n, l.bw, l.a);
  const tree = treeAllReduceMs(size, n, l.bw, l.a);
  const algbw = size / 1e9 / (Math.min(ring, tree) / 1000);
  const fmtBytes = (b: number) => (b >= 1e9 ? `${+(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${+(b / 1e6).toFixed(1)} MB` : `${+(b / 1e3).toFixed(0)} KB`);
  const fmtMs = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)} s` : v >= 1 ? `${v.toFixed(1)} ms` : `${(v * 1000).toFixed(0)} µs`);
  return (
    <Shell title={t("w.ar.title")} note={t("w.ar.note")}>
      <div className="controls">
        <Select id="ar-link" label={t("w.link")} value={link} options={LINKS.map((x) => ({ value: x.value, label: x.label }))} onChange={setLink} />
        <Slider id="ar-n" label={t("w.ranks")} value={logN} display={String(n)} min={1} max={11} step={1} onChange={setLogN} />
        <Slider id="ar-s" label={t("w.msg")} value={logS} display={fmtBytes(size)} min={3} max={10} step={0.05} onChange={setLogS} />
      </div>
      <XYChart
        series={[
          { name: t("w.ring"), color: "var(--series-1)", points: sizes.map((x) => ({ x, y: ringAllReduceMs(x, n, l.bw, l.a) })) },
          { name: t("w.tree"), color: "var(--series-2)", points: sizes.map((x) => ({ x, y: treeAllReduceMs(x, n, l.bw, l.a) })), dashed: true },
        ]}
        markers={[{ x: size, y: Math.min(ring, tree), label: t("w.you"), color: "var(--text)", emphasis: true }]}
        xLog
        yLog
        xDomain={[1e3, 1e10]}
        yDomain={[0.001, 10000]}
        xTicks={[1e3, 1e5, 1e7, 1e9]}
        yTicks={[0.001, 0.1, 10, 1000]}
        fmtX={fmtBytes}
        fmtY={fmtMs}
        xLabel={t("w.msgSize")}
        yLabel={t("w.time")}
      />
      <div className="readout">
        <Stat k={t("w.ringC")} v={fmtMs(ring)} tone={ring <= tree ? "ok" : undefined} />
        <Stat k={t("w.treeC")} v={fmtMs(tree)} tone={tree < ring ? "ok" : undefined} />
        <Stat k={t("w.algbw")} v={`${algbw.toFixed(1)} GB/s`} />
        <Stat k={t("w.busbw")} v={`${((size / 1e9 / (ring / 1000)) * (2 * (n - 1)) / n).toFixed(1)} GB/s`} />
      </div>
    </Shell>
  );
}

// ------------------------------------------------------------------ MIG

const MIG_PROFILES = [
  { name: "1g.10gb", c: 1, m: 1 },
  { name: "1g.20gb", c: 1, m: 2 },
  { name: "2g.20gb", c: 2, m: 2 },
  { name: "3g.40gb", c: 3, m: 4 },
  { name: "4g.40gb", c: 4, m: 4 },
  { name: "7g.80gb", c: 7, m: 8 },
];
const SLOT_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6"];

function Mig() {
  const { t } = useLang();
  const [parts, setParts] = useState<string[]>(["3g.40gb", "2g.20gb"]);
  const used = parts.map((p) => MIG_PROFILES.find((x) => x.name === p)!);
  const c = used.reduce((s, p) => s + p.c, 0);
  const m = used.reduce((s, p) => s + p.m, 0);
  const [msg, setMsg] = useState("");
  const add = (name: string) => {
    const p = MIG_PROFILES.find((x) => x.name === name)!;
    if (c + p.c > 7 || m + p.m > 8 || parts.length >= 7) {
      setMsg(t("w.mig.noFit", { name, c: p.c, m: p.m, fc: 7 - c, fm: 8 - m }));
      return;
    }
    setMsg("");
    setParts([...parts, name]);
  };
  const strip = (total: number, key: "c" | "m") => {
    const cells: { color: string; label: string }[] = [];
    used.forEach((p, i) => {
      for (let k = 0; k < p[key]; k++) cells.push({ color: SLOT_COLORS[i % SLOT_COLORS.length], label: p.name });
    });
    while (cells.length < total) cells.push({ color: "", label: t("w.mig.free") });
    return (
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${total}, 1fr)`, gap: 2 }}>
        {cells.map((x, i) => (
          <div key={i} title={x.label} style={{ height: 26, borderRadius: 4, background: x.color || "var(--surface-2)", border: x.color ? "none" : "1px dashed var(--border-strong)" }} />
        ))}
      </div>
    );
  };
  return (
    <Shell title={t("w.mig.title")} note={t("w.mig.note")}>
      <div className="row" style={{ marginBottom: 10 }}>
        {MIG_PROFILES.map((p) => (
          <button key={p.name} className="btn small mono" onClick={() => add(p.name)}>+ {p.name}</button>
        ))}
        <button className="btn small" onClick={() => { setParts([]); setMsg(""); }}>{t("w.mig.clear")}</button>
      </div>
      <div className="stack">
        <div>
          <div className="muted" style={{ fontSize: 12.5, marginBottom: 4 }}>{t("w.mig.compute", { n: c })}</div>
          {strip(7, "c")}
        </div>
        <div>
          <div className="muted" style={{ fontSize: 12.5, marginBottom: 4 }}>{t("w.mig.memory", { n: m })}</div>
          {strip(8, "m")}
        </div>
      </div>
      <div className="row" style={{ marginTop: 10, fontSize: 13 }}>
        {used.map((p, i) => (
          <span key={i} className="chip">
            <span className="dot" style={{ background: SLOT_COLORS[i % SLOT_COLORS.length] }} />
            {p.name}
            <button aria-label={t("w.mig.remove", { name: p.name })} onClick={() => setParts(parts.filter((_, j) => j !== i))} style={{ border: 0, background: "none", color: "var(--muted)", cursor: "pointer" }}>×</button>
          </span>
        ))}
      </div>
      {msg && <p style={{ color: "var(--critical)", fontSize: 13.5, margin: "8px 0 0" }}>{msg}</p>}
    </Shell>
  );
}

// ------------------------------------------------------------------ scaling

function Scaling() {
  const { t } = useLang();
  const [serial, setSerial] = useState(2);
  const [comm, setComm] = useState(0.5);
  const [logN, setLogN] = useState(6);
  const ns = Array.from({ length: 11 }, (_, i) => Math.pow(2, i));
  const n = Math.pow(2, logN);
  const sp = scalingSpeedup(n, serial / 100, comm / 100);
  return (
    <Shell title={t("w.sc.title")} note={t("w.sc.note")}>
      <div className="controls">
        <Slider id="sc-s" label={t("w.serial")} value={serial} display={`${serial}%`} min={0} max={20} step={0.5} onChange={setSerial} />
        <Slider id="sc-c" label={t("w.comm")} value={comm} display={`${comm}%`} min={0} max={5} step={0.1} onChange={setComm} />
        <Slider id="sc-n" label={t("w.workers")} value={logN} display={String(n)} min={0} max={10} step={1} onChange={setLogN} />
      </div>
      <XYChart
        series={[
          { name: t("w.ideal"), color: "var(--muted)", points: ns.map((x) => ({ x, y: x })), dashed: true },
          { name: t("w.actual"), color: "var(--series-1)", points: ns.map((x) => ({ x, y: scalingSpeedup(x, serial / 100, comm / 100) })) },
        ]}
        markers={[{ x: n, y: sp, label: `${sp.toFixed(1)}×`, color: "var(--series-2)", emphasis: true }]}
        xLog
        yLog
        xDomain={[1, 1024]}
        yDomain={[1, 1024]}
        xTicks={[1, 4, 16, 64, 256, 1024]}
        yTicks={[1, 4, 16, 64, 256, 1024]}
        fmtX={(v) => String(Math.round(v))}
        fmtY={(v) => `${+v.toFixed(1)}×`}
        xLabel={t("w.workersL")}
        yLabel={t("w.speedupL")}
      />
      <div className="readout">
        <Stat k={t("w.speedup")} v={`${sp.toFixed(1)}×`} />
        <Stat k={t("w.efficiency")} v={`${((sp / n) * 100).toFixed(0)}%`} tone={sp / n > 0.7 ? "ok" : "bad"} />
        <Stat k={t("w.amdahl")} v={serial > 0 ? `${(100 / serial).toFixed(0)}×` : "∞"} />
      </div>
    </Shell>
  );
}

// ------------------------------------------------------------------ power cap

function PowerCap() {
  const { t } = useLang();
  const [cap, setCap] = useState(550);
  const [computeFrac, setComputeFrac] = useState(85);
  const g = GPUS.H100;
  const curve = useMemo(() => {
    const caps = Array.from({ length: 50 }, (_, i) => 250 + i * 10);
    const at = (w: number) => {
      const { clockFactor, powerW } = powerModel(g, 1, w);
      const f = computeFrac / 100;
      const speed = 1 / (f / clockFactor + (1 - f));
      return { speed, energy: powerW / g.tdpW / speed };
    };
    return { caps, at };
  }, [computeFrac, g]);
  const cur = curve.at(cap);
  return (
    <Shell title={t("w.pc.title")} note={t("w.pc.note")}>
      <div className="controls">
        <Slider id="pc-cap" label={t("w.limit")} value={cap} display={`${cap} W`} min={250} max={700} step={10} onChange={setCap} />
        <Slider id="pc-f" label={t("w.computeShare")} value={computeFrac} display={`${computeFrac}%`} min={40} max={100} step={5} onChange={setComputeFrac} />
      </div>
      <XYChart
        series={[
          { name: t("w.throughput"), color: "var(--series-1)", points: curve.caps.map((x) => ({ x, y: curve.at(x).speed * 100 })) },
          { name: t("w.energyTok"), color: "var(--series-2)", points: curve.caps.map((x) => ({ x, y: curve.at(x).energy * 100 })), dashed: true },
        ]}
        markers={[{ x: cap, y: cur.speed * 100, label: `${(cur.speed * 100).toFixed(0)}%`, color: "var(--series-1)", emphasis: true }]}
        xDomain={[250, 700]}
        yDomain={[40, 110]}
        xTicks={[300, 400, 500, 600, 700]}
        yTicks={[40, 60, 80, 100]}
        fmtX={(v) => `${Math.round(v)} W`}
        fmtY={(v) => `${v.toFixed(0)}%`}
        xLabel={t("w.powerLimit")}
        yLabel={t("w.pctUncapped")}
      />
      <div className="readout">
        <Stat k={t("w.throughputC")} v={`${(cur.speed * 100).toFixed(0)}%`} />
        <Stat k={t("w.powerC")} v={`${((cap / g.tdpW) * 100).toFixed(0)}%`} />
        <Stat k={t("w.energyTokC")} v={`${(cur.energy * 100).toFixed(0)}%`} tone={cur.energy < 1 ? "ok" : undefined} />
      </div>
    </Shell>
  );
}

export function Widget({ id }: { id: WidgetId }) {
  switch (id) {
    case "roofline":
      return <Roofline />;
    case "memory":
      return <MemoryCalc />;
    case "allreduce":
      return <AllReduce />;
    case "mig":
      return <Mig />;
    case "scaling":
      return <Scaling />;
    case "power":
      return <PowerCap />;
  }
}
