"use client";

import { useEffect, useMemo, useState } from "react";
import { grade, nextDue, retention, eligible, type Grade, type ReviewState } from "@/lib/review";

type Prompt = { i: number; k: string; kind: string; p: string };
type Meta = { topic: string; track: string; outcomes: string[] };

const LOCAL = "lumen-review";

/**
 * The recall strip: spaced retrieval in the slot the four-question static quiz used to
 * occupy. It sits above the tabs, so it is on every view without adding navigation.
 *
 * Three deliberate choices, all of which are the difference between this working and this
 * being abandoned in month three:
 *
 * 1. You write before you reveal. The reveal button stays disabled until the textarea has
 *    content. Recognition ("ah yes, I know this") is the illusion that makes rereading feel
 *    productive; committing an answer first is what makes it retrieval.
 * 2. The backlog count is never rendered. Five cards, most-overdue first, and whatever does
 *    not fit is simply due tomorrow. Seeing "37 due" is what kills these systems.
 * 3. Grades are Fluent / Halting / Gone, not a score. Nothing is gamified, nothing is
 *    congratulated, and a lapse costs two rungs rather than resetting to zero.
 */
export function RecallStrip({ startedTopics }: { startedTopics: number[] }) {
  const [bank, setBank] = useState<{ meta: Record<string, Meta>; prompts: Prompt[] } | null>(null);
  const [state, setState] = useState<ReviewState>({});
  const [sha, setSha] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [doneToday, setDoneToday] = useState(0);

  const key = startedTopics.join(",");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LOCAL);
      if (raw) setState(JSON.parse(raw));
    } catch { /* a corrupt local copy should not take the strip down */ }
    fetch("/api/review")
      .then((r) => r.json())
      .then((d) => {
        setSha(d.sha ?? null);
        // GitHub is the durable copy across devices; merge rather than overwrite so an
        // offline session is not silently discarded.
        if (d.state && Object.keys(d.state).length) {
          setState((local) => {
            const merged: ReviewState = { ...d.state, ...local };
            for (const k of Object.keys(merged)) {
              const a = local[k];
              const b = d.state[k];
              if (a && b) merged[k] = (a.seen ?? 0) >= (b.seen ?? 0) ? a : b;
            }
            return merged;
          });
        }
      })
      .catch(() => { /* local-only is a valid mode */ });
  }, []);

  useEffect(() => {
    if (!key) return;
    fetch(`/api/recall?topics=${key}`).then((r) => r.json()).then(setBank).catch(() => setBank(null));
  }, [key]);

  const now = useMemo(() => new Date(), []);
  const queue = useMemo(() => (bank ? nextDue(bank.prompts, state, now) : []), [bank, state, now]);
  const card = queue[0];
  const meta = card && bank ? bank.meta[String(card.i)] : null;
  const stats = useMemo(() => (bank ? retention(eligible(bank.prompts), state) : { seen: 0, total: 0, matured: 0 }), [bank, state]);

  const record = (g: Grade) => {
    if (!card) return;
    const next = { ...state, [card.k]: grade(state[card.k], g, now) };
    setState(next);
    setAnswer("");
    setRevealed(false);
    setDoneToday((n) => n + 1);
    try { localStorage.setItem(LOCAL, JSON.stringify(next)); } catch { /* quota */ }
    fetch("/api/review", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state: next, sha }) })
      .then((r) => r.json())
      .then((d) => { if (d.sha) setSha(d.sha); })
      .catch(() => { /* stays local */ });
  };

  if (!startedTopics.length) {
    return (
      <section className="quiz-strip recall-strip" aria-label="Recall">
        <div className="quiz-copy">
          <span className="quiz-label">Recall</span>
          <strong>Nothing to review yet</strong>
          <span>Set a topic to In progress or Done and its questions enter the review schedule.</span>
        </div>
      </section>
    );
  }

  if (!card) {
    return (
      <section className="quiz-strip recall-strip" aria-label="Recall">
        <div className="quiz-copy">
          <span className="quiz-label">Recall</span>
          <strong>{doneToday ? `${doneToday} reviewed — done for today` : "Nothing due today"}</strong>
          <span>{stats.seen} of {stats.total} prompts in the schedule · {stats.matured} held at 60 days or longer</span>
        </div>
      </section>
    );
  }

  return (
    <section className="quiz-strip recall-strip" aria-label="Recall">
      <div className="recall-head">
        <span className="quiz-label">{card.kind === "drill" ? "Failure drill" : "Recall"}</span>
        <span className="recall-topic">{meta?.topic}</span>
      </div>
      <p className="recall-prompt">{card.kind === "drill" ? `What goes wrong, and how would you catch it? — ${card.p}` : card.p}</p>

      {!revealed ? (
        <>
          <textarea
            className="recall-answer"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Answer from memory first — the reveal unlocks once you have written something."
            aria-label="Your answer"
            rows={3}
          />
          <div className="recall-actions">
            <button className="quiz-action" disabled={!answer.trim()} onClick={() => setRevealed(true)}>
              Reveal reference →
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="recall-reference">
            <span className="quiz-label">You should be able to</span>
            <ul>{(meta?.outcomes ?? []).map((o) => <li key={o}>{o}</li>)}</ul>
          </div>
          <div className="recall-actions">
            <span className="recall-ask">How did that go?</span>
            <button className="quiz-option" onClick={() => record("gone")}>Gone</button>
            <button className="quiz-option" onClick={() => record("halting")}>Halting</button>
            <button className="quiz-action" onClick={() => record("fluent")}>Fluent</button>
          </div>
        </>
      )}
    </section>
  );
}
