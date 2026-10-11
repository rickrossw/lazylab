// Parses the subset of Slurm batch scripts the simulator understands: #SBATCH directives,
// `export` lines and a `train.py` command line.

import { MODELS, type ModelId } from "./hardware";
import { DEFAULT_TRAIN_CONFIG, type Precision, type TrainConfig } from "./perf";

export interface SbatchOptions {
  jobName?: string;
  partition?: string;
  nodes?: number;
  gpusPerNode?: number;
  exclude?: string[];
}

export interface ParsedScript {
  sbatch: SbatchOptions;
  env: Record<string, string>;
  config: TrainConfig;
  hasTrainCommand: boolean;
  warnings: string[];
  errors: string[];
}

const OPT_ALIASES: Record<string, keyof SbatchOptions> = {
  "--job-name": "jobName",
  "-J": "jobName",
  "--partition": "partition",
  "-p": "partition",
  "--nodes": "nodes",
  "-N": "nodes",
  "--gpus-per-node": "gpusPerNode",
  "--exclude": "exclude",
  "-x": "exclude",
};

/** Applies option tokens like ["--nodes=2", "-p", "gpu"] onto `out`. Returns unknown options. */
export function applySbatchTokens(tokens: string[], out: SbatchOptions, errors: string[]): string[] {
  const unknown: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (!tok.startsWith("-")) continue;
    let key = tok;
    let val: string | undefined;
    const eq = tok.indexOf("=");
    if (eq > 0) {
      key = tok.slice(0, eq);
      val = tok.slice(eq + 1);
    }
    // --gres=gpu:8 is the classic spelling of gpus-per-node.
    if (key === "--gres") {
      const v = val ?? tokens[++i];
      const m = /gpu(?::[\w-]+)?:(\d+)/.exec(v ?? "");
      if (m) out.gpusPerNode = Number(m[1]);
      continue;
    }
    if (["--time", "-t", "--ntasks-per-node", "--cpus-per-task", "--mem", "--output", "-o", "--account", "-A", "--exclusive", "--qos"].includes(key)) {
      if (val === undefined && key !== "--exclusive") i++;
      continue;
    }
    const field = OPT_ALIASES[key];
    if (!field) {
      unknown.push(key);
      continue;
    }
    if (val === undefined) val = tokens[++i];
    if (val === undefined) {
      errors.push(`option ${key} requires an argument`);
      continue;
    }
    val = val.replace(/^["']|["']$/g, "");
    if (field === "nodes" || field === "gpusPerNode") {
      const n = Number(val);
      if (!Number.isInteger(n) || n < 1) errors.push(`invalid value for ${key}: ${val}`);
      else out[field] = n;
    } else if (field === "exclude") {
      out.exclude = expandHostList(val);
    } else {
      out[field] = val;
    }
  }
  return unknown;
}

/** Expands "node-[1-3,5]" into ["node-1","node-2","node-3","node-5"]. Also accepts comma lists. */
export function expandHostList(spec: string): string[] {
  const out: string[] = [];
  const parts = spec.match(/[^,\[]+(\[[^\]]*\])?[^,]*/g) ?? [];
  for (const part of parts) {
    const m = /^(.*)\[([^\]]+)\](.*)$/.exec(part);
    if (!m) {
      if (part) out.push(part);
      continue;
    }
    for (const range of m[2].split(",")) {
      const [a, b] = range.split("-");
      const lo = Number(a);
      const hi = b === undefined ? lo : Number(b);
      for (let i = lo; i <= hi; i++) out.push(`${m[1]}${i}${m[3]}`);
    }
  }
  return out;
}

/** Compresses ["node-1","node-2","node-4"] into "node-[1-2,4]". */
export function compressHostList(hosts: string[]): string {
  if (hosts.length === 0) return "";
  if (hosts.length === 1) return hosts[0];
  const nums = hosts.map((h) => Number(/(\d+)$/.exec(h)?.[1])).sort((a, b) => a - b);
  const prefix = hosts[0].replace(/\d+$/, "");
  const ranges: string[] = [];
  let start = nums[0];
  let prev = nums[0];
  for (let i = 1; i <= nums.length; i++) {
    if (nums[i] === prev + 1) {
      prev = nums[i];
      continue;
    }
    ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
    start = prev = nums[i];
  }
  return `${prefix}[${ranges.join(",")}]`;
}

/** Shell-style word splitting: quotes group words and can appear mid-word (Reason="gpu 5 hot"). */
export function tokenize(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote: string | null = null;
  let pending = false;
  for (const ch of line) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      pending = true;
    } else if (/\s/.test(ch)) {
      if (cur || pending) out.push(cur);
      cur = "";
      pending = false;
    } else cur += ch;
  }
  if (cur || pending) out.push(cur);
  return out;
}

/** Splits a command line on pipes that are not inside quotes. */
export function splitPipes(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote: string | null = null;
  for (const ch of line) {
    if (quote) {
      if (ch === quote) quote = null;
      cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
    } else if (ch === "|") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function parseJobScript(text: string): ParsedScript {
  const warnings: string[] = [];
  const errors: string[] = [];
  const sbatch: SbatchOptions = {};
  const env: Record<string, string> = {};
  const config: TrainConfig = { ...DEFAULT_TRAIN_CONFIG };
  let hasTrainCommand = false;

  const lines = text.replace(/\\\r?\n/g, " ").split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("#SBATCH")) {
      const unknown = applySbatchTokens(tokenize(line.slice(7)), sbatch, errors);
      for (const u of unknown) warnings.push(`sbatch: ignoring unrecognized directive ${u}`);
      continue;
    }
    if (!line || line.startsWith("#")) continue;
    const exp = /^export\s+([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (exp) {
      env[exp[1]] = exp[2].replace(/^["']|["']$/g, "");
      continue;
    }
    if (/train\.py/.test(line)) {
      hasTrainCommand = true;
      parseTrainFlags(tokenize(line.slice(line.indexOf("train.py") + 8)), config, warnings, errors);
    }
  }
  return { sbatch, env, config, hasTrainCommand, warnings, errors };
}

function parseTrainFlags(tokens: string[], cfg: TrainConfig, warnings: string[], errors: string[]) {
  const num = (flag: string, v: string | undefined, min = 1): number | undefined => {
    const n = Number(v);
    if (v === undefined || !Number.isFinite(n) || n < min || !Number.isInteger(n)) {
      errors.push(`train.py: error: argument ${flag}: invalid int value: '${v ?? ""}'`);
      return undefined;
    }
    return n;
  };
  for (let i = 0; i < tokens.length; i++) {
    let flag = tokens[i];
    let val: string | undefined;
    const eq = flag.indexOf("=");
    if (eq > 0) {
      val = flag.slice(eq + 1);
      flag = flag.slice(0, eq);
    }
    const take = () => (val !== undefined ? val : tokens[++i]);
    switch (flag) {
      case "--model": {
        const v = take()?.toLowerCase() as ModelId;
        if (v in MODELS) cfg.model = v;
        else errors.push(`train.py: error: argument --model: invalid choice: '${v}' (choose from 7b, 13b, 70b)`);
        break;
      }
      case "--precision": {
        const v = take()?.toLowerCase();
        if (v === "fp32" || v === "bf16" || v === "fp8") cfg.precision = v as Precision;
        else errors.push(`train.py: error: argument --precision: invalid choice: '${v}' (choose from fp32, bf16, fp8)`);
        break;
      }
      case "--micro-batch":
      case "--micro-batch-size": {
        const n = num(flag, take());
        if (n) cfg.microBatch = n;
        break;
      }
      case "--seq-len": {
        const n = num(flag, take(), 128);
        if (n) cfg.seqLen = n;
        break;
      }
      case "--grad-accum": {
        const n = num(flag, take());
        if (n) cfg.gradAccum = n;
        break;
      }
      case "--tp":
      case "--tensor-parallel": {
        const n = num(flag, take());
        if (n) cfg.tp = n;
        break;
      }
      case "--pp":
      case "--pipeline-parallel": {
        const n = num(flag, take());
        if (n) cfg.pp = n;
        break;
      }
      case "--zero":
      case "--zero-stage": {
        const n = Number(take());
        if ([0, 1, 2, 3].includes(n)) cfg.zero = n as 0 | 1 | 2 | 3;
        else errors.push(`train.py: error: argument --zero: invalid choice (choose from 0, 1, 2, 3)`);
        break;
      }
      case "--workers":
      case "--num-workers": {
        const n = num(flag, take(), 0);
        if (n !== undefined) cfg.workers = n;
        break;
      }
      case "--overlap":
        cfg.overlap = true;
        break;
      case "--no-overlap":
        cfg.overlap = false;
        break;
      case "--ckpt":
      case "--activation-checkpointing":
        cfg.ckpt = true;
        break;
      case "--no-ckpt":
        cfg.ckpt = false;
        break;
      default:
        if (flag.startsWith("-")) warnings.push(`train.py: warning: ignoring unknown argument ${flag}`);
    }
  }
}
