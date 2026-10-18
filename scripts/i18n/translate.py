#!/usr/bin/env python3
"""Machine-translate i18n/en.json into many languages with open-source models.

Engine: Argos Translate model packages (OPUS-MT / Marian models converted to CTranslate2,
MIT / CC-BY licensed). Runs fully offline on CPU.

  python scripts/i18n/translate.py --models <dir-with-one-folder-per-language> fr de ja ...

Writes public/i18n/<code>.json (what the site loads) and i18n/cache/<code>.json (segment cache so
re-runs only translate new or changed text). Markdown structure, inline code, cross-links,
{placeholders} and a glossary of technical terms are protected from translation; any sentence
whose protected pieces don't survive falls back to English rather than shipping something broken.
"""

import argparse
import json
import os
import re
import sys

import ctranslate2
import sentencepiece as spm

# Site language code -> Argos model folder.
MODEL_FOR = {"pt-BR": "pb", "zh-Hans": "zh", "zh-Hant": "zt"}

# Terms engineers keep in English in every language; protecting them avoids literal mistranslation
# ("drain the node" -> "drain the water", "clocks" -> "wristwatches").
GLOSSARY = [
    "tensor parallelism", "pipeline parallelism", "data parallelism", "3D parallelism", "mixed precision",
    "bosses", "boss", "scheduler", "nvidia-smi", "all-reduce", "all-gather", "reduce-scatter", "send/recv", "micro-batches", "micro-batch",
    "tensor cores", "tensor core", "checkpointing", "checkpoints", "checkpoint", "stragglers", "straggler",
    "requeue", "drained", "draining", "drain", "warps", "warp", "roofline", "dataloader", "throttling", "throttled",
    "GPUDirect RDMA", "GPUDirect", "InfiniBand", "NVSwitch", "NVLink", "RoCE", "PCIe", "NCCL", "Slurm", "Kubernetes",
    "CUDA", "DCGM", "MIG", "MPS", "MFU", "HFU", "ZeRO", "FSDP", "DDP", "GEMMs", "GEMM", "HBM", "SMs", "SM", "Xid",
    "ECC", "H100", "A100", "L40S", "BF16", "FP16", "FP8", "FP32", "TF32", "TFLOP/s", "FLOP/s", "FLOPs", "TFLOPs",
    "kWh", "MWh", "PUE", "CO₂e", "Jupyter", "JupyterHub", "cron", "systemd", "sudo", "sbatch", "scontrol", "squeue",
    "sinfo", "sacct", "dmesg", "LazyLab", "Megatron-LM", "FlashAttention", "safetensors", "pickle", "GPUs", "GPU",
    "CPUs", "CPU", "XP", "SRE", "HPC", "ML", "LLM", "OOM", "Adam", "TP", "PP", "DP",
]
GLOSSARY_RE = re.compile(r"(?<![\w/-])(" + "|".join(re.escape(g) for g in sorted(GLOSSARY, key=len, reverse=True)) + r")(?![\w/-])")
PH_RE = re.compile(r"X\s?Q\s?(\d{1,3})\s?X", re.IGNORECASE)
SENT_SPLIT = re.compile(r"(?<=[.!?])\s+(?=[A-Z¿¡\"“*`\[(])")


class Engine:
    """Wraps one model package. Packages ship either a SentencePiece model or BPE codes (+ Moses)."""

    def __init__(self, model_dir, cache, target):
        self.tr = ctranslate2.Translator(os.path.join(model_dir, "model"), device="cpu", compute_type="int8")
        self.cache = cache
        sp_path = os.path.join(model_dir, "sentencepiece.model")
        if os.path.exists(sp_path):
            self.sp = spm.SentencePieceProcessor(model_file=sp_path)
            self.encode = lambda t: self.sp.encode(t, out_type=str)
            self.decode = lambda toks: "".join(toks).replace("▁", " ").strip()
        else:
            from sacremoses import MosesDetokenizer, MosesTokenizer
            from subword_nmt.apply_bpe import BPE

            with open(os.path.join(model_dir, "bpe.model"), encoding="utf-8") as f:
                bpe = BPE(f)
            mt, md = MosesTokenizer(lang="en"), MosesDetokenizer(lang=target.split("-")[0])
            self.encode = lambda t: bpe.process_line(mt.tokenize(t, return_str=True, escape=False)).split()
            self.decode = lambda toks: md.detokenize(" ".join(toks).replace("@@ ", "").split())

    def run(self, texts, beam=2):
        todo = [t for t in dict.fromkeys(texts) if t not in self.cache and t.strip()]
        for i in range(0, len(todo), 48):
            batch = todo[i : i + 48]
            res = self.tr.translate_batch([self.encode(t) for t in batch], beam_size=beam, max_decoding_length=400)
            for src, r in zip(batch, res):
                self.cache[src] = self.decode(r.hypotheses[0])


def split_row(row):
    cells, cur, depth, i = [], "", 0, 0
    while i < len(row):
        ch = row[i]
        if ch == "\\" and row[i + 1 : i + 2] == "|":
            cur += "\\|"; i += 2; continue
        if row[i : i + 2] == "[[":
            depth += 1; cur += "[["; i += 2; continue
        if row[i : i + 2] == "]]":
            depth = max(0, depth - 1); cur += "]]"; i += 2; continue
        if ch == "|" and depth == 0:
            cells.append(cur); cur = ""
        else:
            cur += ch
        i += 1
    cells.append(cur)
    return cells


class Translator:
    """Two-pass translator: pass 1 collects segments, the engine translates them in batches, pass 2 assembles."""

    def __init__(self, engine):
        self.engine = engine
        self.collect = True
        self.segments = []

    def seg(self, text):
        if self.collect:
            self.segments.append(text)
            return text
        return self.engine.cache.get(text, text)

    def phrase(self, text):
        """A short span (link label, bold phrase) translated on its own."""
        if not re.search(r"[A-Za-z]{2}", text) or GLOSSARY_RE.fullmatch(text.strip()):
            return text
        return self.sentence(text)

    def sentence(self, s):
        toks = []

        def keep(value):
            toks.append(value)
            return f"XQ{len(toks) - 1}X"

        def raw(x):
            # Nested spans (bold text containing a link or code) are translated from their original
            # markdown, so the inner call protects those pieces itself.
            return PH_RE.sub(lambda m: toks[int(m.group(1))], x)

        p = s
        p = re.sub(r"`[^`]+`", lambda m: keep(m.group(0)), p)
        p = re.sub(r"\[\[([^\]|]+)\|([^\]]+)\]\]", lambda m: keep(f"[[{m.group(1)}|{self.phrase(raw(m.group(2)))}]]"), p)
        p = re.sub(r"\[\[[^\]]+\]\]", lambda m: keep(m.group(0)), p)
        p = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", lambda m: keep(f"[{self.phrase(raw(m.group(1)))}]({m.group(2)})"), p)
        p = re.sub(r"\*\*([^*]+)\*\*", lambda m: keep(f"**{self.phrase(raw(m.group(1)))}**"), p)
        p = re.sub(r"(?<!\*)\*([^*\s][^*]*)\*(?!\*)", lambda m: keep(f"*{self.phrase(raw(m.group(1)))}*"), p)
        p = re.sub(r"\{\w+\}", lambda m: keep(m.group(0)), p)
        p = re.sub(r"https?://\S+", lambda m: keep(m.group(0)), p)
        p = GLOSSARY_RE.sub(lambda m: keep(m.group(0)), p)
        if not re.search(r"[A-Za-z]{2}", PH_RE.sub("", p)):
            # Nothing left to translate (only code, numbers, glossary terms or already-translated phrases).
            return PH_RE.sub(lambda m: toks[int(m.group(1))], p)
        out = self.seg(p)
        if self.collect:
            return s
        found = [int(n) for n in PH_RE.findall(out)]
        if sorted(found) != list(range(len(toks))):
            return s  # a protected piece got lost or duplicated: keep the English sentence
        return PH_RE.sub(lambda m: toks[int(m.group(1))], out)

    def inline(self, text):
        parts = SENT_SPLIT.split(text)
        return " ".join(self.sentence(p) for p in parts)

    def value(self, text):
        out, in_code = [], False
        for line in text.split("\n"):
            stripped = line.strip()
            if stripped.startswith("```"):
                in_code = not in_code
                out.append(line)
                continue
            if in_code or not stripped:
                out.append(line)
                continue
            if stripped.startswith("|"):
                cells = split_row(stripped.strip("|"))
                if all(re.fullmatch(r"\s*:?-+:?\s*", c) for c in cells):
                    out.append(line)
                else:
                    out.append("| " + " | ".join(self.inline(c.strip()) for c in cells) + " |")
                continue
            m = re.match(r"^(\s*(?:#{1,4}\s+|[-*]\s+|\d+\.\s+|>\s?)?)(.*)$", line)
            out.append(m.group(1) + self.inline(m.group(2)))
        return "\n".join(out)


def translate_lang(code, source, models_dir, root):
    folder = os.path.join(models_dir, MODEL_FOR.get(code, code))
    cache_path = os.path.join(root, "i18n", "cache", f"{code}.json")
    cache = json.load(open(cache_path)) if os.path.exists(cache_path) else {}
    engine = Engine(folder, cache, code)
    t = Translator(engine)
    for v in source.values():
        t.value(v)
    engine.run(t.segments)
    t.collect = False
    out = {k: t.value(v) for k, v in source.items()}
    os.makedirs(os.path.dirname(cache_path), exist_ok=True)
    used = {s: cache[s] for s in dict.fromkeys(t.segments) if s in cache}
    json.dump(used, open(cache_path, "w"), ensure_ascii=False, indent=0, sort_keys=True)
    json.dump(out, open(os.path.join(root, "public", "i18n", f"{code}.json"), "w"), ensure_ascii=False, separators=(",", ":"))
    return len(t.segments)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", required=True)
    ap.add_argument("langs", nargs="+")
    a = ap.parse_args()
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    source = json.load(open(os.path.join(root, "i18n", "en.json")))
    for code in a.langs:
        n = translate_lang(code, source, a.models, root)
        print(f"{code}: {n} segments", flush=True)


if __name__ == "__main__":
    sys.exit(main())
