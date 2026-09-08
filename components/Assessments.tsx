import { useState } from "react";

const assessmentSets = [
  { title: "Weekly checkpoint", cadence: "Every week · 30 minutes", instruction: "Close your notes. Explain one topic, solve two small problems, then write one production lesson. Pass when you can explain the why, not only the command.", topics: "Current plan topics · shell · networking · systems", key: "Grade yourself against the topic's own outcomes in the recall strip: Fluent means closed-book and complete, Halting means gaps, Gone means start it again." },
  { title: "Monthly deep dive", cadence: "Every month · 90 minutes", instruction: "Part 1: explain three ideas simply. Part 2: design a small system. Part 3: debug a failure case. Part 4: show evidence from your build. Review mistakes the next day.", topics: "One month of plan work · one build artifact · one mock", key: "Rubric: correctness 40% · tradeoffs 25% · debugging 20% · communication 15%" },
  { title: "Quarterly capstone", cadence: "Every quarter · 3 hours", instruction: "Treat this like an MIT-style open-book systems examination. Start with assumptions, draw the design, implement a thin slice, test failure paths, and defend your choices aloud. Submit notes, code, tests, and a short retrospective.", topics: "End-to-end FDE case · architecture · delivery · customer impact", key: "Rubric: problem framing 20% · system design 25% · implementation 25% · reliability 15% · FDE communication 15%" },
];
/**
 * `scope` replaces what used to be a literal on each set, and the worst of them was
 * "Current plan topics · shell · networking · systems" — a string that says *current*, is frozen,
 * and would still have named shell and networking in month 20. That is the same defect as the
 * digest pinned to plan row 1 and the "9-month operating view" header: prose claiming to be
 * derived. This component read nothing at all before; it now takes what it asserts.
 *
 * Only the weekly and monthly scopes are derived, because only those two are about where you
 * currently are. The quarterly capstone is a standing description of an exam format and is not a
 * function of progress, so it stays written down rather than being dressed up as a computed value.
 */
export function Assessments({ scopes }: { scopes: (string | null)[] }) {
  const [open, setOpen] = useState<number | null>(0);
  return <section className="panel full-panel assessment-panel"><div className="panel-head"><div><p className="eyebrow">Serious practice</p><h2>Assessments that compound</h2></div><span className="panel-meta">Weekly · monthly · quarterly</span></div><p className="assessment-lead">Use retrieval, not rereading. Write your answer before checking the key. Keep the result as interview evidence.</p><div className="assessment-list">{assessmentSets.map((assessment, index) => <article className={`assessment-card ${open === index ? "open" : ""}`} key={assessment.title}><button className="assessment-toggle" onClick={() => setOpen(open === index ? null : index)}><span><strong>{assessment.title}</strong><small>{assessment.cadence}</small></span><b>{open === index ? "−" : "+"}</b></button>{open === index && <div className="assessment-body"><p>{assessment.instruction}</p><span className="assessment-topics">{scopes[index] ?? assessment.topics}</span><div className="answer-key"><strong>Answer key and rubric</strong><span>{assessment.key}</span></div><p className="assessment-note">Score your work through Quaere or the MCP <code>score_assessment</code> tool. Results are guidance, not a pass/fail gate.</p></div>}</article>)}</div></section>;
}
