import { Fragment, useRef, useState } from "react";
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
  const [page, setPage] = useState(() => expanded === null ? 0 : Math.max(0, Math.floor(filtered.indexOf(planRows[expanded]) / 12)));
  const head = useRef<HTMLHeadingElement>(null);
  const key = `${query}|${track}|${month}|${progress}`;
  const [filterKey, setFilterKey] = useState(key);
  if (filterKey !== key) { setFilterKey(key); setPage(0); }
  const pageSize = 12;
  const expandedRow = expanded === null ? null : planRows[expanded];
  const expandedPosition = expandedRow ? filtered.indexOf(expandedRow) : -1;
  const [lastExpanded, setLastExpanded] = useState(expanded);
  if (lastExpanded !== expanded) {
    setLastExpanded(expanded);
    if (expandedPosition >= 0) setPage(Math.floor(expandedPosition / pageSize));
  }
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages - 1);
  const visible = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const changePage = (value: number) => { setPage(value); head.current?.focus(); head.current?.scrollIntoView({ block: "start" }); };
  const resetFilters = () => { setQuery(""); setTrack("All tracks"); setMonth("All months"); setProgress("All progress"); };
  const currentTopic = planRows.find((row) => (statuses[topicKey(row)] || row[15]) === "In progress") ?? planRows.find((row) => !["Done", "Skipped"].includes(String(statuses[topicKey(row)] || row[15])));
  const quickActions = <div className="plan-quick-actions">{currentTopic && <button className="ghost-button" onClick={() => { resetFilters(); setQuery(String(currentTopic[2])); setExpanded(planRows.indexOf(currentTopic)); }}>Go to current topic</button>}{(query || track !== "All tracks" || month !== "All months" || progress !== "All progress") && <button className="text-button" onClick={resetFilters}>Show all topics</button>}</div>;
  const pagination = pages > 1 && <nav className="plan-pagination" aria-label="Plan pages"><button className="ghost-button" disabled={currentPage === 0} onClick={() => changePage(currentPage - 1)}>Previous</button><span role="status">Page {currentPage + 1} of {pages} · {filtered.length} topics</span><button className="ghost-button" disabled={currentPage + 1 === pages} onClick={() => changePage(currentPage + 1)}>Next</button></nav>;
  return <section className="panel full-panel plan-explorer"><div className="panel-head plan-head"><div><p className="eyebrow">{filtered.length === planRows.length ? `${planRows.length} topics · three resources each` : `${filtered.length} of ${planRows.length} topics`}</p><h2 ref={head} tabIndex={-1}>Plan explorer</h2></div><div className="filters"><input aria-label="Search topics" placeholder="Search topics…" value={query} onChange={(e) => setQuery(e.target.value)} /><select aria-label="Filter by track" value={track} onChange={(e) => setTrack(e.target.value)}><option>All tracks</option>{tracks.map((t) => <option key={t}>{t}</option>)}</select><select aria-label="Filter by month" value={month} onChange={(e) => setMonth(e.target.value)}><option>All months</option>{months.map((m) => <option key={m}>{m}</option>)}</select><select aria-label="Filter by progress" value={progress} onChange={(e) => setProgress(e.target.value)}><option>All progress</option><option>Not started</option><option>In progress</option><option>Done</option><option>Skipped</option></select></div></div>{progressSync === "failed" && <p className="plan-sync"><span>Progress could not be loaded. Workbook defaults are shown rather than your real status; updates are paused until it reloads.</span><button type="button" className="plan-sync-retry" onClick={retryProgress}>Try loading it again</button></p>}{filtered.length === 0 && <div className="plan-empty"><h3>No topics match these filters</h3><p>Try a broader search, or return to the full plan.</p><button className="text-button" onClick={() => { setQuery(""); setTrack("All tracks"); setMonth("All months"); setProgress("All progress"); }}>Clear filters</button></div>}{quickActions}{pagination}<div className="table-wrap"><table role="table"><thead><tr><th>Topic</th><th>Track</th><th>Month</th><th>Hours</th><th>Depth target</th><th>Resources</th><th>Progress</th></tr></thead><tbody>{visible.map((r) => { const idx = planRows.indexOf(r); const open = expanded === idx; return <Fragment key={`${r[0]}-${r[2]}`}><tr><td><button className="topic-toggle" aria-expanded={open} aria-controls={`syllabus-${idx}`} onClick={() => setExpanded(open ? null : idx)}><strong>{String(r[2])}</strong><span className="chev" aria-hidden="true">{open ? "−" : "+"}</span></button><span className="status">{statuses[topicKey(r)] || r[15] || "Not started"}</span></td><td data-label="Track">{String(r[0]).replace(/^[A-Z]\. /, "")}</td><td data-label="Month">M{String(r[1])}</td><td data-label="Hours">{String(r[13])}h</td><td data-label="Goal" className="depth">{String(r[3])}</td><td data-label="Resources" className="resource-stack"><Link href={String(r[5])}>Read</Link><Link href={String(r[8])}>Watch</Link><Link href={String(r[11])}>Do</Link></td><td data-label="Progress"><select className="status-select" aria-label={`Update ${String(r[2])}`} disabled={progressSync !== "ready"} title={progressSync === "loading" ? "Loading your recorded progress. The value shown is the workbook default until it arrives, so changing it now could overwrite real progress." : progressSync === "failed" ? "Recorded progress could not be loaded, so this shows the workbook default instead of your real status. Use the retry above the table. Updates stay disabled until it loads." : undefined} value={statuses[topicKey(r)] || String(r[15] || "Not started")} onChange={(e) => setStatus(r, e.target.value)}><option>Not started</option><option>In progress</option><option>Done</option><option>Skipped</option></select><button className="ask-row" onClick={() => { setAskTopic(idx); setAskOpen(true); setAskText(`Explain ${String(r[2])} with a practical example and a 20-minute exercise.`); }}>Ask</button></td></tr>{open && <tr className="syllabus-row" id={`syllabus-${idx}`}><td colSpan={7}>{renderSyllabus(idx)}</td></tr>}</Fragment>; })}</tbody></table></div>{pagination}</section>;
}
