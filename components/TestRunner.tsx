import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { drawPaper } from "@/lib/paper";

/**
 * Sit the test, here, instead of reading about sitting it.
 *
 * The Assessments panel described three exam formats and gave you nothing to do. Meanwhile
 * `data/recall-bank.json` has held **1,710 written prompts** across all 119 topics since it
 * shipped, and the only way to answer one was the single-question strip at the top of the page.
 * A question bank with no way through it is a file, not a feature.
 *
 * So this is the way through it. Pick a scope, get its questions, answer them one at a time,
 * reveal the topic's own outcomes as the key, and grade yourself.
 *
 * ## Why you grade yourself
 *
 * There is no automatic marking and there should not be. These are written answers to questions
 * like "give me three concrete cases where set -e will not stop the script"; nothing available
 * here can mark that honestly, and a score that looks objective while being a keyword match is
 * worse than no score. The grades are the three the recall strip already uses, for the same
 * reason it uses them: Fluent, Halting, Gone describe what happened when you tried to remember,
 * which is the thing spaced repetition actually needs.
 *
 * ## What this does not do
 *
 * It writes nothing. Not to the review schedule, not to progress, not to the repo. A test session
 * is you checking yourself, and quietly moving 20 cards in the spaced-repetition ladder because
 * you did a practice run is the kind of side effect that makes a schedule untrustworthy. The
 * summary is on screen, and the panel says so rather than implying a save happened.
 */

export type Scope = {
  id: string;
  /** What the reader is about to sit, in their own plan's terms. */
  label: string;
  /** Plan row indices, 0-based, the same keys the curriculum and recall bank use. */
  indices: number[];
  /** How many questions to draw. */
  questions: number;
  minutes: number;
};

type Prompt = { i: number; k: string; kind: string; p: string };
type Meta = { topic: string; track: string; outcomes: string[] };
type Bank = { meta: Record<string, Meta>; prompts: Prompt[] };
type Grade = "fluent" | "halting" | "gone";

const GRADES: { g: Grade; label: string; hint: string }[] = [
  { g: "gone", label: "Gone", hint: "Could not retrieve it" },
  { g: "halting", label: "Halting", hint: "Got there with gaps" },
  { g: "fluent", label: "Fluent", hint: "Closed-book and complete" },
];

const mmss = (ms: number) => {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

export function TestRunner({ scope, onExit }: { scope: Scope; onExit: () => void }) {
  const [bank, setBank] = useState<Bank | null>(null);
  const [failed, setFailed] = useState(false);
  const [at, setAt] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [grades, setGrades] = useState<Record<string, Grade>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [elapsed, setElapsed] = useState(0);
  const started = useRef<number | null>(null);
  const box = useRef<HTMLTextAreaElement | null>(null);

  // Only the topics in scope are requested. The bank is ~600KB and shipping it to the browser
  // would be absurd, which is the reason /api/recall takes a topic list at all.
  // Keyed on the joined string, not the array. `scope.indices` is a fresh array on every render
  // of the page that builds it, so an array dependency would refire this fetch forever the moment
  // the scope object stopped being held in state.
  const topics = scope.indices.join(",");
  useEffect(() => {
    if (!topics) { setBank({ meta: {}, prompts: [] }); return; }
    let live = true;
    fetch(`/api/recall?topics=${topics}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: Bank) => { if (live) setBank(data); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [topics]);

  // The clock starts on mount and is read in an effect, never during render. A duration derived
  // from the clock while rendering is the hydration mismatch this codebase keeps writing down.
  useEffect(() => {
    started.current = Date.now();
    const id = window.setInterval(() => {
      if (started.current) setElapsed(Date.now() - started.current);
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  // The paper. `drawPaper` balances across the topics in scope; see lib/paper.ts for why that
  // matters and what a plain shuffle does instead. The seed is drawn once on mount, so the paper
  // is stable while you sit it and different the next time.
  const seed = useMemo(() => Math.floor(Math.random() * 0xffffffff), []);
  const paper = useMemo(() => (bank ? drawPaper(bank.prompts, scope.questions, seed) : []), [bank, seed, scope.questions]);

  const current = paper[at];
  const answer = current ? answers[current.k] ?? "" : "";
  const graded = current ? grades[current.k] : undefined;
  const meta = current && bank ? bank.meta[String(current.i)] : null;
  const done = paper.length > 0 && at >= paper.length;

  const record = useCallback((g: Grade) => {
    if (!current) return;
    setGrades((prev) => ({ ...prev, [current.k]: g }));
    setAt((n) => n + 1);
  }, [current]);

  // Focus the box on each new question so answering does not need a click first.
  useEffect(() => { box.current?.focus(); }, [at]);

  if (failed) {
    return <div className="test-shell">
      <p className="test-quiet">The question bank could not be loaded, so there is no paper to sit. This is unknown, not empty.</p>
      <button className="quiz-option" onClick={onExit}>Back to the assessments</button>
    </div>;
  }
  if (!bank) return <div className="test-shell"><p className="test-quiet">Drawing your questions…</p></div>;
  if (!paper.length) {
    return <div className="test-shell">
      <p className="test-quiet">No topic is in scope for this one yet. Start a topic in the plan and it becomes examinable here.</p>
      <button className="quiz-option" onClick={onExit}>Back to the assessments</button>
    </div>;
  }

  if (done) {
    const counted = paper.map((p) => grades[p.k]).filter(Boolean) as Grade[];
    const tally = (g: Grade) => counted.filter((x) => x === g).length;
    const topics = [...new Set(paper.map((p) => bank.meta[String(p.i)]?.topic).filter(Boolean))];
    const weakest = paper.filter((p) => grades[p.k] === "gone" || grades[p.k] === "halting");
    return <div className="test-shell">
      <p className="eyebrow">Finished</p>
      <h3 className="test-title">{scope.label}</h3>
      <div className="test-tally">
        {GRADES.map(({ g, label }) => <div key={g} className={`test-tally-cell tally-${g}`}>
          <strong>{tally(g)}</strong><span>{label}</span>
        </div>)}
        <div className="test-tally-cell"><strong>{mmss(elapsed)}</strong><span>Elapsed</span></div>
      </div>
      <p className="test-note">
        {topics.length} topic{topics.length === 1 ? "" : "s"} covered: {topics.join(", ")}.
      </p>
      {weakest.length > 0 && <div className="test-weak">
        <strong>Worth another pass</strong>
        <ul>{weakest.map((p) => <li key={p.k}>
          <span className={`test-chip chip-${grades[p.k]}`}>{grades[p.k]}</span>
          {bank.meta[String(p.i)]?.topic ?? `Row ${p.i + 1}`}
        </li>)}</ul>
      </div>}
      <p className="test-note test-quiet">
        Nothing here was saved. This does not touch your recall schedule or your progress, because a
        practice run moving twenty scheduled cards is how a schedule stops being trustworthy.
      </p>
      <div className="test-actions">
        <button className="quiz-action" onClick={onExit}>Done</button>
      </div>
    </div>;
  }

  return <div className="test-shell">
    <div className="test-bar">
      <span className="test-count">Question {at + 1} of {paper.length}</span>
      <span className="test-clock">{mmss(elapsed)} of {scope.minutes} min</span>
    </div>
    <div className="test-progress" role="presentation">
      <span style={{ width: `${(at / paper.length) * 100}%` }} />
    </div>

    <p className="test-topic">{meta?.topic ?? `Row ${current.i + 1}`} · {current.kind}</p>
    <p className="test-prompt">{current.p}</p>

    <textarea
      ref={box}
      className="test-answer"
      value={answer}
      onChange={(e) => setAnswers((prev) => ({ ...prev, [current.k]: e.target.value }))}
      placeholder="Answer from memory. The key unlocks once you have written something."
      aria-label={`Your answer to question ${at + 1}`}
    />

    {/* Same gate the recall strip uses: the key does not open until something is written, because
        reading the answer first is the whole failure mode retrieval practice exists to avoid. */}
    {!revealed[current.k]
      ? <button
          className="quiz-option"
          disabled={answer.trim().length < 3}
          onClick={() => setRevealed((prev) => ({ ...prev, [current.k]: true }))}
        >{answer.trim().length < 3 ? "Write an answer to unlock the key" : "Reveal the key"}</button>
      : <div className="test-key">
          <strong>What a complete answer covers</strong>
          {meta?.outcomes?.length
            ? <ul>{meta.outcomes.map((o, i) => <li key={i}>{o}</li>)}</ul>
            : <p className="test-quiet">This topic records no outcomes, so grade against the plan row itself.</p>}
        </div>}

    {revealed[current.k] && <div className="test-grade">
      <p className="test-grade-ask">How did that go?</p>
      <div className="test-grade-row">
        {GRADES.map(({ g, label, hint }) => <button
          key={g}
          className={`quiz-option grade-${g}${graded === g ? " selected" : ""}`}
          onClick={() => record(g)}
          title={hint}
        >{label}</button>)}
      </div>
    </div>}

    <div className="test-actions">
      <button className="text-button" onClick={onExit}>Leave the test</button>
      {at > 0 && <button className="text-button" onClick={() => setAt((n) => n - 1)}>Previous</button>}
      {revealed[current.k] && <button className="text-button" onClick={() => setAt((n) => n + 1)}>Skip grading</button>}
    </div>
  </div>;
}
