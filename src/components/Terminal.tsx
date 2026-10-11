"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { Simulation } from "@/sim/sim";
import { COMMAND_NAMES, prompt, type Line } from "@/sim/shell";

interface TermLine {
  text: string;
  kind: Line["kind"] | "cmd";
  prompt?: string;
}

const MAX_LINES = 3000;

export function Terminal({
  sim,
  welcome,
  quick,
  onRan,
  onEdit,
}: {
  sim: Simulation;
  welcome: string[];
  quick?: string[];
  onRan?: () => void;
  onEdit?: (path: string, content: string, readOnly: boolean) => void;
}) {
  const [lines, setLines] = useState<TermLine[]>(() => welcome.map((text) => ({ text, kind: "info" as const })));
  const [input, setInput] = useState("");
  const [histIdx, setHistIdx] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLines(welcome.map((text) => ({ text, kind: "info" as const })));
    // Reset only when a new simulation is mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sim]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const run = (cmd: string) => {
    const p = prompt(sim);
    const res = sim.exec(cmd);
    setLines((prev) => {
      if (res.clear) return [];
      const next = [...prev, { text: cmd, kind: "cmd" as const, prompt: p }, ...res.lines];
      return next.length > MAX_LINES ? next.slice(-MAX_LINES) : next;
    });
    if (res.openEditor) onEdit?.(res.openEditor.path, res.openEditor.content, !!res.openEditor.readOnly);
    setHistIdx(null);
    onRan?.();
  };

  const complete = () => {
    const parts = input.split(" ");
    const last = parts[parts.length - 1];
    const pool = parts.length === 1 ? COMMAND_NAMES : [...Object.keys(sim.state.files), ...sim.state.jobs.map((j) => `slurm-${j.id}.out`), ...sim.state.nodes.map((n) => n.name)];
    const matches = pool.filter((c) => c.startsWith(last));
    if (matches.length === 1) {
      parts[parts.length - 1] = matches[0] + (parts.length === 1 ? " " : "");
      setInput(parts.join(" "));
    } else if (matches.length > 1) {
      let common = matches[0];
      for (const m of matches) while (!m.startsWith(common)) common = common.slice(0, -1);
      if (common.length > last.length) {
        parts[parts.length - 1] = common;
        setInput(parts.join(" "));
      } else {
        setLines((prev) => [...prev, { text: input, kind: "cmd", prompt: prompt(sim) }, { text: matches.join("  "), kind: "out" }]);
      }
    }
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    const hist = sim.state.shell.history;
    if (e.key === "Enter") {
      e.preventDefault();
      const cmd = input;
      setInput("");
      if (!cmd.trim()) {
        setLines((prev) => [...prev, { text: "", kind: "cmd", prompt: prompt(sim) }]);
        return;
      }
      run(cmd);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!hist.length) return;
      const i = histIdx === null ? hist.length - 1 : Math.max(0, histIdx - 1);
      setHistIdx(i);
      setInput(hist[i]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (histIdx === null) return;
      const i = histIdx + 1;
      if (i >= hist.length) {
        setHistIdx(null);
        setInput("");
      } else {
        setHistIdx(i);
        setInput(hist[i]);
      }
    } else if (e.key === "Tab") {
      e.preventDefault();
      complete();
    } else if (e.key === "l" && e.ctrlKey) {
      e.preventDefault();
      setLines([]);
    } else if (e.key === "c" && e.ctrlKey) {
      e.preventDefault();
      setLines((prev) => [...prev, { text: input + "^C", kind: "cmd", prompt: prompt(sim) }]);
      setInput("");
    }
  };

  return (
    <div className="term" onClick={() => window.getSelection()?.toString() || inputRef.current?.focus()}>
      <div className="term-scroll" ref={scrollRef} role="log" aria-live="polite" aria-label="Terminal output">
        {lines.map((l, i) => (
          <div key={i} className={`term-line ${l.kind}`}>
            {l.kind === "cmd" ? (
              <>
                <span className="p">{l.prompt}</span> {l.text}
              </>
            ) : (
              l.text || " "
            )}
          </div>
        ))}
      </div>
      <div className="term-input">
        <span className="p">{prompt(sim)}</span>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          aria-label="Terminal command"
        />
      </div>
      {quick && quick.length > 0 && (
        <div className="term-chips">
          {quick.map((q) => (
            <button key={q} onClick={() => run(q)} title={`Run: ${q}`}>
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function EditorModal({
  path,
  content,
  readOnly,
  onSave,
  onClose,
}: {
  path: string;
  content: string;
  readOnly: boolean;
  onSave: (text: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(content);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const title = path.startsWith("crontab:") ? `crontab for ${path.slice(8)}` : path;
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label={`Editing ${title}`}>
        <div className="modal-head">
          <strong className="mono">{title}</strong>
          {readOnly && <span className="chip">read-only</span>}
          <span className="spacer" />
          <span className="muted" style={{ fontSize: 12 }}>
            {readOnly ? "Esc to close" : "Ctrl/⌘+S save · Esc cancel"}
          </span>
          {!readOnly && (
            <button className="btn small primary" onClick={() => onSave(text)}>
              Save
            </button>
          )}
          <button className="btn small" onClick={onClose}>
            Close
          </button>
        </div>
        <textarea
          ref={ref}
          className="editor"
          value={text}
          readOnly={readOnly}
          spellCheck={false}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "s") {
              e.preventDefault();
              if (!readOnly) onSave(text);
            } else if (e.key === "Escape") onClose();
          }}
        />
      </div>
    </div>
  );
}
