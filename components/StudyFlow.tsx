"use client";
import Link from "next/link";

/** A map of the real study actions, never an invented progress indicator. */
export function StudyFlow({ row, status }: { row: number; status: string }) {
  return <aside className="study-flow" aria-label="Your study loop">
    <div className="study-flow-heading"><span className="eyebrow">From idea to evidence</span><span className="study-flow-status">Row {row} · {status || "Not started"}</span></div>
    <svg viewBox="0 0 520 150" fill="none" aria-hidden="true" className="study-flow-diagram">
      <path className="study-flow-rail" d="M64 65H456M456 65V125H64V98" />
      {[64, 194, 324, 454].map((x, i) => <g key={x} className={`study-flow-node node-${i}`}>
        <rect x={x - 32} y="33" width="64" height="64" rx="14" />
        {i === 0 ? <><path d={`M${x-14} 52h10q4 0 4 4v24q-4-4-14-4zM${x+14} 52h-10q-4 0-4 4v24q4-4 14-4z`} /></>
          : i === 1 ? <path d={`M${x-7} 54l-12 11 12 11m14-22 12 11-12 11m-9-25-4 30`} />
          : i === 2 ? <><path d={`M${x-14} 63l10 10 19-20`} /><path d={`M${x-18} 45v40h36V45`} /></>
          : <><path d={`M${x-17} 61l17-9 17 9-17 9zM${x-17} 61v18l17 9 17-9V61M${x} 70v18`} /></>}
        <text x={x} y="20" textAnchor="middle">0{i+1}</text>
      </g>)}
      <path className="study-flow-arrow" d="m451 120 5 5-5 5M59 104l5-6 5 6" />
    </svg>
    <div className="study-flow-links">
      <Link href={`/plan?row=${row}`}><strong>Learn</strong><span>Open the topic</span></Link>
      <Link href="/machines"><strong>Build</strong><span>Explore a system</span></Link>
      <Link href="/practice"><strong>Test</strong><span>Practise recall</span></Link>
      <button onClick={() => {
        const trigger = document.querySelector<HTMLButtonElement>('.artifact-recorder button');
        if (!trigger) return;
        if (trigger.getAttribute("aria-expanded") !== "true") trigger.click();
        requestAnimationFrame(() => { trigger.focus(); trigger.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); });
      }}><strong>Ship</strong><span>Record the proof</span></button>
    </div>
    <p className="study-flow-caption">One small outcome. Then make it explainable.</p>
  </aside>;
}
