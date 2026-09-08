import { Link, type Row, type Syllabus } from "./shared";

export function SyllabusView({ s, row }: { s: Syllabus; row?: Row }) {
  const minutes = s.subtopics.reduce((n, x) => n + (Number(x.minutes) || 0), 0);
  // The row carries the topic's three vetted resources. The syllabus parts below link to
  // docs only, so without this strip the video is unreachable from the Curriculum tab.
  const primary = row ? ([["Read", 4, 5], ["Watch", 7, 8], ["Do", 10, 11]] as const).map(([kind, labelCol, urlCol]) => ({ kind, label: String(row[labelCol] ?? ""), url: String(row[urlCol] ?? "") })) : [];
  return <div className="syllabus">
    {primary.length > 0 && <section className="syllabus-primary"><h4>Start with these three</h4><ul>{primary.map((p) => <li key={p.kind}><span className={`res-kind res-${p.kind.toLowerCase()}`}>{p.kind}</span><Link href={p.url}>{p.label || p.kind}</Link></li>)}</ul></section>}
    <p className="syllabus-why">{s.why}</p>
    <div className="syllabus-grid"><section><h4>Before you start</h4><ul>{s.prerequisites.map((p, i) => <li key={i}>{p}</li>)}</ul></section><section><h4>Afterwards, you can</h4><ul>{s.outcomes.map((o, i) => <li key={i}>{o}</li>)}</ul></section></div>
    <section className="syllabus-subtopics"><h4>What to learn <span>{s.subtopics.length} parts · {s.hours}h planned{Math.abs(minutes / 60 - s.hours) >= 1 ? ` (${(minutes / 60).toFixed(1)}h of material)` : ""}</span></h4><ol>{s.subtopics.map((x, i) => <li key={i}><div className="sub-head"><strong>{x.name}</strong><span>{x.minutes} min</span></div><p>{x.learn}</p><Link href={x.resource?.url || ""}>{x.resource?.label || "Resource"}</Link></li>)}</ol></section>
    <div className="syllabus-grid"><section><h4>How it breaks in production</h4><ul>{s.failureModes.map((f, i) => <li key={i}>{f}</li>)}</ul></section><section><h4>Interview questions</h4><ol>{s.interviewQuestions.map((q, i) => <li key={i}>{q}</li>)}</ol></section></div>
    <section className="syllabus-proof"><h4>Proof of work</h4>{row && String(row[14] ?? "").trim() && <p className="syllabus-deliverable"><strong>Ship this:</strong> {String(row[14])}</p>}<p>{s.proofOfWork}</p></section>
  </div>;
}
