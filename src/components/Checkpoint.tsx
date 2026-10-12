"use client";

import { useState } from "react";
import { LEVEL_XP, LEVEL_XP_RETRY, checkNumber, type Question } from "@/content/levels";
import { challengesL } from "@/content/localized";
import { useLang } from "@/i18n/client";
import { recordLevel } from "@/lib/progress";
import { useProgress } from "./useProgress";

type State = { picked?: number; typed?: string; ok?: boolean };

function QuestionView({ q, state, onAnswer }: { q: Question; state: State; onAnswer: (s: State) => void }) {
  const { t } = useLang();
  const [typed, setTyped] = useState("");
  const answered = state.ok !== undefined;
  return (
    <div style={{ marginBottom: 16 }}>
      <div className="q">{q.prompt}</div>
      {q.code && <pre>{q.code}</pre>}
      {q.kind === "choice" ? (
        <div className="opts" role="group" aria-label={t("cp.options")}>
          {q.options.map((o, i) => {
            const cls = answered && i === q.answer ? " right" : answered && i === state.picked ? " wrong" : "";
            return (
              <button key={i} className={`opt${cls}`} disabled={answered && state.ok} onClick={() => onAnswer({ picked: i, ok: i === q.answer })}>
                {o}
              </button>
            );
          })}
        </div>
      ) : (
        <form
          className="num-row"
          onSubmit={(e) => {
            e.preventDefault();
            onAnswer({ typed, ok: checkNumber(q, typed) });
          }}
        >
          <input inputMode="decimal" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={t("cp.answer")} aria-label={t("cp.answer")} disabled={state.ok} />
          {q.unit && <span className="muted">{q.unit}</span>}
          <button className="btn small primary" type="submit" disabled={state.ok || !typed.trim()}>
            {t("cp.check")}
          </button>
        </form>
      )}
      {answered && (
        <div className={`feedback${state.ok ? "" : " bad"}`} role="status">
          <strong>{state.ok ? t("cp.correct") : q.kind === "number" ? t("cp.notQuiteNum", { a: `${q.answer}${q.unit ? " " + q.unit : ""}` }) : t("cp.notQuite")}</strong>
          {state.ok || q.kind === "number" ? q.explain : t("cp.tryAnother")}
        </div>
      )}
    </div>
  );
}

/** End-of-section challenge. Answering everything correctly masters the level and awards XP. */
export function Checkpoint({ slug }: { slug: string }) {
  const { lang, t } = useLang();
  const qs = challengesL(slug, lang);
  const p = useProgress();
  const mastered = p.levels[slug];
  const [states, setStates] = useState<State[]>(() => qs.map(() => ({})));
  const [missed, setMissed] = useState(false);
  const [replay, setReplay] = useState(false);
  const [earned, setEarned] = useState<number | null>(null);
  if (!qs.length) return null;

  if (mastered && !replay) {
    return (
      <div className="checkpoint">
        <div className="mastered">
          <span className="seal" aria-hidden>✓</span>
          <strong>{t("cp.mastered")}</strong>
          <span className="muted">+{earned ?? mastered.xp} XP{earned ? ` ${t("cp.earned")}` : ""}</span>
          <span className="spacer" />
          <button className="btn small" onClick={() => { setReplay(true); setStates(qs.map(() => ({}))); setMissed(false); }}>
            {t("cp.again")}
          </button>
        </div>
      </div>
    );
  }

  const answer = (i: number, s: State) => {
    const next = states.map((x, j) => (j === i ? s : x));
    setStates(next);
    const anyMiss = missed || !s.ok;
    if (!s.ok) setMissed(true);
    // Numeric misses reveal the answer, so they count as done (but cost the first-try bonus).
    const finished = next.every((x, j) => x.ok || (qs[j].kind === "number" && x.ok === false));
    if (finished) {
      const xp = anyMiss ? LEVEL_XP_RETRY : LEVEL_XP;
      if (!mastered) {
        recordLevel(slug, xp);
        setEarned(xp);
      }
      setReplay(false);
    }
  };

  return (
    <div className="checkpoint" aria-label={t("cp.tag")}>
      <div className="checkpoint-head">
        <span className="tag">{t("cp.tag")}</span>
        <span className="xp">+{LEVEL_XP} XP</span>
        <span className="muted" style={{ fontSize: 13 }}>
          {mastered ? t("cp.practice") : t("cp.retryXp", { xp: LEVEL_XP_RETRY })}
        </span>
      </div>
      {qs.map((q, i) => (
        <QuestionView key={`${slug}-${i}-${replay}`} q={q} state={states[i]} onAnswer={(s) => answer(i, s)} />
      ))}
    </div>
  );
}
