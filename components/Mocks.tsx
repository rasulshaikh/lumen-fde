import { useState } from "react";
import { mockRows, mockWindow, pct } from "./shared";

/**
 * The interview reps, and a way to actually run one.
 *
 * This panel was five lines and no interaction: nine rows of "0 / 3" with a progress bar, a pass
 * bar nobody could read without squinting, and nothing to press. It described a practice regime
 * and offered no way into it, which is the same defect the Assessments panel had before it became
 * sittable.
 *
 * Two things it can honestly offer. Each row opens to show where the rep happens and what counts
 * as passing, both of which are already in the workbook and were previously truncated into a
 * caption. And each row can hand the whole thing to Quaere as a prompt, which is the closest a
 * dashboard gets to running a mock: the companion has the plan, the market and the syllabus, so
 * "interview me for this" is a request it can actually meet.
 *
 * What it does NOT do is let you mark a rep complete. The counts come from `data/workbook.json`,
 * which is a committed input rather than a store, and adding a second writer to it here would put
 * the same number in two places. Recording a rep belongs with the artifacts and papers stores, and
 * it is not built yet, so this panel says nothing about it rather than implying a button exists.
 */
export function Mocks({ ask }: { ask?: (prompt: string) => void }) {
  const [open, setOpen] = useState<number | null>(null);

  return <section className="panel full-panel">
    <div className="panel-head">
      <div><p className="eyebrow">Interview proof</p><h2>Mocks and repetitions</h2></div>
      <span className="panel-meta">{mockRows.length} practice loops{mockWindow ? ` · ${mockWindow}` : ""}</span>
    </div>
    <div className="mock-grid">{mockRows.map((r, i) => {
      const target = Number(r[1] || 0);
      const done = Number(r[6] || 0);
      const isOpen = open === i;
      return <div className={`mock-row-wrap${isOpen ? " is-open" : ""}`} key={i}>
        <button className="mock-row" onClick={() => setOpen(isOpen ? null : i)} aria-expanded={isOpen}>
          <span className="mock-title"><strong>{String(r[0])}</strong><span>{String(r[2])}h each · month {String(r[3])}</span></span>
          <span className="mock-bar"><span style={{ width: `${pct(done, target)}%` }} /></span>
          <span className="mock-stats"><b>{done} / {target}</b><span className="mock-chev" aria-hidden="true">{isOpen ? "−" : "+"}</span></span>
        </button>
        {isOpen && <div className="mock-detail">
          <div><p className="mock-label">Where and how</p><p>{String(r[4])}</p></div>
          <div><p className="mock-label">Pass bar</p><p>{String(r[5])}</p></div>
          {ask && <button className="quiz-action mock-run" onClick={() => ask(
            `Run a ${String(r[0])} mock with me now. The pass bar is: ${String(r[5])}. Ask me one question at a time, wait for my answer, then tell me specifically where it fell short of that bar and what a stronger version sounds like. Use my plan and the market scan for the substance.`
          )}>Run this with Quaere →</button>}
        </div>}
      </div>;
    })}</div>
  </section>;
}
