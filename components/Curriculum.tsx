import type { Dispatch, SetStateAction } from "react";
import { planRows, tracks } from "./shared";

export function Curriculum({ curSummary, curOpen, setCurOpen, toggleCur, renderSyllabus }: {
  curSummary: Record<string, { parts: number; minutes: number }> | null;
  curOpen: Set<number>;
  setCurOpen: Dispatch<SetStateAction<Set<number>>>;
  toggleCur: (index: number) => void;
  renderSyllabus: (index: number) => React.ReactNode;
}) {
  return <section className="panel full-panel"><div className="panel-head"><div><p className="eyebrow">Deep syllabus</p><h2>Everything to learn, topic by topic</h2></div><span className="panel-meta">{curSummary ? `${Object.keys(curSummary).length} of ${planRows.length} topics detailed · ${Object.values(curSummary).reduce((n, x) => n + x.parts, 0)} parts` : "Loading…"}</span></div><p className="library-note">Each topic opens into what to know first, 12-20 parts with exactly what to learn and one public resource for each, measurable outcomes, the ways it fails in production, interview questions at senior-FDE level, and a proof-of-work artifact. Open a topic below, or expand a whole track.</p>{tracks.map((t) => { const rows = planRows.map((r, idx) => ({ r, idx })).filter(({ r }) => r[0] === t); const allOpen = rows.every(({ idx }) => curOpen.has(idx)); return <div className="cur-track" key={t}><div className="cur-track-head"><h3>{t}</h3><button className="text-button" onClick={() => setCurOpen((s) => { const n = new Set(s); rows.forEach(({ idx }) => allOpen ? n.delete(idx) : n.add(idx)); return n; })}>{allOpen ? "Collapse track" : "Expand track"}</button></div>{rows.map(({ r, idx }) => { const open = curOpen.has(idx); return <article className="cur-topic" key={idx}><button className="topic-toggle" aria-expanded={open} onClick={() => toggleCur(idx)}><strong>{String(r[2])}</strong><span>M{String(r[1])} · {String(r[13])}h{curSummary?.[String(idx)] ? ` · ${curSummary[String(idx)].parts} parts` : ""}</span><span className="chev" aria-hidden="true">{open ? "−" : "+"}</span></button>{open && renderSyllabus(idx)}</article>; })}</div>; })}</section>;
}
