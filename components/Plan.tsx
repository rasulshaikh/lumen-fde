import { Fragment } from "react";
import { Link, months, planRows, topicKey, tracks, type Row } from "./shared";

export function Plan({ filtered, query, setQuery, track, setTrack, month, setMonth, progress, setProgress, expanded, setExpanded, statuses, progressSync, retryProgress, setStatus, setAskTopic, setAskOpen, setAskText, renderSyllabus }: {
  filtered: Row[];
  query: string;
  setQuery: (value: string) => void;
  track: string;
  setTrack: (value: string) => void;
  month: string;
  setMonth: (value: string) => void;
  progress: string;
  setProgress: (value: string) => void;
  expanded: number | null;
  setExpanded: (index: number | null) => void;
  statuses: Record<string, string>;
  progressSync: "loading" | "ready" | "failed";
  retryProgress: () => void;
  setStatus: (r: Row, status: string) => void;
  setAskTopic: (index: number | null) => void;
  setAskOpen: (open: boolean) => void;
  setAskText: (text: string) => void;
  renderSyllabus: (index: number) => React.ReactNode;
}) {
  return <section className="panel full-panel"><div className="panel-head plan-head"><div><p className="eyebrow">{filtered.length === planRows.length ? `${planRows.length} topics · three resources each` : `${filtered.length} of ${planRows.length} topics`}</p><h2>Plan explorer</h2></div><div className="filters"><input aria-label="Search topics" placeholder="Search topics…" value={query} onChange={(e) => setQuery(e.target.value)} /><select value={track} onChange={(e) => setTrack(e.target.value)}><option>All tracks</option>{tracks.map((t) => <option key={t}>{t}</option>)}</select><select value={month} onChange={(e) => setMonth(e.target.value)}><option>All months</option>{months.map((m) => <option key={m}>{m}</option>)}</select><select aria-label="Filter by progress" value={progress} onChange={(e) => setProgress(e.target.value)}><option>All progress</option><option>Not started</option><option>In progress</option><option>Done</option><option>Skipped</option></select></div></div>{progressSync === "failed" && <p className="plan-sync"><span>Your recorded progress could not be loaded, so every row below shows the workbook&rsquo;s default rather than your real status. Updates stay off until it loads, so a change now cannot overwrite something real.</span><button type="button" className="plan-sync-retry" onClick={retryProgress}>Try loading it again</button></p>}<div className="table-wrap"><table><thead><tr><th>Topic</th><th>Track</th><th>Month</th><th>Hours</th><th>Depth target</th><th>Resources</th><th>Progress</th></tr></thead><tbody>{filtered.map((r) => { const idx = planRows.indexOf(r); const open = expanded === idx; return <Fragment key={`${r[0]}-${r[2]}`}><tr><td><button className="topic-toggle" aria-expanded={open} aria-controls={`syllabus-${idx}`} onClick={() => setExpanded(open ? null : idx)}><strong>{String(r[2])}</strong><span className="chev" aria-hidden="true">{open ? "−" : "+"}</span></button><span className="status">{statuses[topicKey(r)] || r[15] || "Not started"}</span></td><td>{String(r[0]).replace(/^[A-Z]\. /, "")}</td><td>M{String(r[1])}</td><td>{String(r[13])}h</td><td className="depth">{String(r[3])}</td><td className="resource-stack"><Link href={String(r[5])}>Read</Link><Link href={String(r[8])}>Watch</Link><Link href={String(r[11])}>Do</Link></td><td><select className="status-select" aria-label={`Update ${String(r[2])}`} disabled={progressSync !== "ready"} title={progressSync === "loading" ? "Loading your recorded progress. The value shown is the workbook default until it arrives, so changing it now could overwrite real progress." : progressSync === "failed" ? "Recorded progress could not be loaded, so this shows the workbook default instead of your real status. Use the retry above the table. Updates stay disabled until it loads." : undefined} value={statuses[topicKey(r)] || String(r[15] || "Not started")} onChange={(e) => setStatus(r, e.target.value)}><option>Not started</option><option>In progress</option><option>Done</option><option>Skipped</option></select><button className="ask-row" onClick={() => { setAskTopic(idx); setAskOpen(true); setAskText(`Explain ${String(r[2])} with a practical example and a 20-minute exercise.`); }}>Ask</button></td></tr>{open && <tr className="syllabus-row" id={`syllabus-${idx}`}><td colSpan={7}>{renderSyllabus(idx)}</td></tr>}</Fragment>; })}</tbody></table></div></section>;
}
