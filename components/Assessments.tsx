import { useState } from "react";
import { TestRunner, type Scope } from "./TestRunner";

const assessmentSets = [
  { title: "Weekly checkpoint", cadence: "Every week · 30 minutes", instruction: "Close your notes. Explain one topic, solve two small problems, then write one production lesson. Pass when you can explain the why, not only the command.", topics: "Current plan topics · shell · networking · systems", key: "Grade yourself against the topic's own outcomes in the recall strip: Fluent means closed-book and complete, Halting means gaps, Gone means start it again." },
  { title: "Monthly deep dive", cadence: "Every month · 90 minutes", instruction: "Part 1: explain three ideas simply. Part 2: design a small system. Part 3: debug a failure case. Part 4: show evidence from your build. Review mistakes the next day.", topics: "One month of plan work · one build artifact · one mock", key: "Rubric: correctness 40% · tradeoffs 25% · debugging 20% · communication 15%" },
  { title: "Quarterly capstone", cadence: "Every quarter · 3 hours", instruction: "Treat this like an MIT-style open-book systems examination. Start with assumptions, draw the design, implement a thin slice, test failure paths, and defend your choices aloud. Submit notes, code, tests, and a short retrospective.", topics: "End-to-end FDE case · architecture · delivery · customer impact", key: "Rubric: problem framing 20% · system design 25% · implementation 25% · reliability 15% · FDE communication 15%" },
];

/**
 * `scope` replaces what used to be a literal on each set, and the worst of them was
 * "Current plan topics · shell · networking · systems" - a string that says *current*, is frozen,
 * and would still have named shell and networking in month 20. That is the same defect as the
 * digest pinned to plan row 1 and the "9-month operating view" header: prose claiming to be
 * derived. This component read nothing at all before; it now takes what it asserts.
 *
 * Only the weekly and monthly scopes are derived, because only those two are about where you
 * currently are. The quarterly capstone is a standing description of an exam format and is not a
 * function of progress, so it stays written down rather than being dressed up as a computed value.
 *
 * ## The panel now has a verb
 *
 * It described three exam formats and offered nothing to do about them, while 1,710 written
 * prompts sat in `data/recall-bank.json` with no way through them but the one-question strip at
 * the top of the page. Each card now starts a real paper drawn from that bank, scoped to the same
 * topics the card claims to cover. See `TestRunner`.
 */
export function Assessments({ scopes, openRow }: { scopes: (Scope | null)[]; openRow?: (index: number) => void }) {
  const [open, setOpen] = useState<number | null>(0);
  const [sitting, setSitting] = useState<Scope | null>(null);

  if (sitting) {
    return <section className="panel full-panel assessment-panel">
      <TestRunner scope={sitting} onExit={() => setSitting(null)} />
    </section>;
  }

  return <section className="panel full-panel assessment-panel">
    <div className="panel-head"><div><p className="eyebrow">Serious practice</p><h2>Assessments that compound</h2></div><span className="panel-meta">Weekly · monthly · quarterly</span></div>
    <p className="assessment-lead">Use retrieval, not rereading. Write your answer before checking the key. Keep the result as interview evidence.</p>
    <div className="assessment-list">{assessmentSets.map((assessment, index) => {
      const scope = scopes[index];
      const isOpen = open === index;
      return <article className={`assessment-card ${isOpen ? "open" : ""}`} key={assessment.title}>
        <button className="assessment-toggle" onClick={() => setOpen(isOpen ? null : index)} aria-expanded={isOpen}>
          <span><strong>{assessment.title}</strong><small>{assessment.cadence}</small></span>
          <b aria-hidden="true">{isOpen ? "−" : "+"}</b>
        </button>
        {isOpen && <div className="assessment-body">
          <p>{assessment.instruction}</p>
          {/* The scope names plan rows, so it opens them. It was a green string that looked like a
              link, did nothing, and was the first thing anyone tried to click. */}
          {scope && openRow && scope.indices.length > 0
            ? <button className="assessment-topics assessment-topics-link" onClick={() => openRow(scope.indices[0])}>
                {scope.label} <span aria-hidden="true">→</span>
              </button>
            : <span className="assessment-topics">{scope?.label ?? assessment.topics}</span>}
          <div className="answer-key"><strong>Answer key and rubric</strong><span>{assessment.key}</span></div>
          <div className="assessment-start">
            {scope && scope.indices.length > 0
              ? <>
                  <button className="primary-button assessment-go" onClick={() => setSitting(scope)}>
                    <span>Sit the {assessment.title.toLowerCase()}</span>
                    <span>{scope.questions} questions →</span>
                  </button>
                  <p className="assessment-note">Drawn from your recall bank, balanced across the topics in scope. Nothing is saved: this does not touch your recall schedule or your progress.</p>
                </>
              : <p className="assessment-note">No topic is in scope yet. Start a topic in the plan and this becomes sittable.</p>}
          </div>
        </div>}
      </article>;
    })}</div>
  </section>;
}
