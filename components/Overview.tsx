import { Link, mockRows, pct, planRows, tracks, type Row } from "./shared";

function Metric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: string }) { return <div className={`metric ${tone}`}><span className="metric-label">{label}</span><strong>{value}</strong><span className="metric-detail">{detail}</span></div>; }

export function Overview({ done, activeRows, skipped, hours, doneHours, skippedHours, weeklyHours, setWeekly, monthHours, maxMonthHours, peakMonth, nextRow, nextIndex, setView, trackTotals, setTrack, marketTiers }: {
  done: number;
  activeRows: Row[];
  skipped: number;
  hours: number;
  doneHours: number;
  skippedHours: number;
  weeklyHours: number;
  setWeekly: (value: number) => void;
  monthHours: { month: number; hours: number }[];
  maxMonthHours: number;
  peakMonth: { month: number; hours: number };
  nextRow: Row | null;
  nextIndex: number;
  setView: (name: string) => void;
  trackTotals: { name: string; count: number; hours: number; done: number }[];
  setTrack: (name: string) => void;
  marketTiers: { market: string; window: string; rank: number; label: string; tone: string }[];
}) {
  return <>
      <section className="metric-grid"><Metric label="Plan progress" value={`${pct(done, activeRows.length)}%`} detail={`${done} of ${activeRows.length} active${skipped ? ` · ${skipped} of ${planRows.length} skipped` : ""}`} tone="rose" /><Metric label="Hours remaining" value={`${Math.max(hours - doneHours, 0)}`} detail={`of ${hours} active hours${skippedHours ? ` · ${skippedHours}h skipped` : ""}`} tone="teal" /><div className="metric brass"><span className="metric-label">Weekly commitment</span><strong><input className="weekly-input" type="number" min={1} max={80} value={weeklyHours} aria-label="Hours you study each week" onChange={(e) => setWeekly(Number(e.target.value))} />h</strong><span className="metric-detail">{(hours / weeklyHours).toFixed(1)} weeks · {(hours / weeklyHours / 4.333).toFixed(1)} months</span></div><Metric label="Mocks" value={`${mockRows.reduce((n, r) => n + Number(r[6] || 0), 0)} / ${mockRows.reduce((n, r) => n + Number(r[1] || 0), 0)}`} detail="completed / target" tone="ink" /></section>
      <section className="content-grid"><div className="panel wide"><div className="panel-head"><div><p className="eyebrow">Pace map</p><h2>Where the hours go</h2></div><span className="panel-meta">{hours}h · {tracks.length} tracks</span></div><div className="bar-chart">{monthHours.map((item) => <div className="bar-item" key={item.month}><div className="bar-value">{item.hours}h</div><div className="bar-track"><div className="bar-fill" style={{ height: `${Math.max(12, item.hours / maxMonthHours * 100)}%` }} /></div><div className="bar-label">M{item.month}</div></div>)}</div><div className="chart-foot"><span><i className="legend-dot rose" /> planned hours</span><span>Peak: Month {peakMonth.month} · {peakMonth.hours}h</span></div></div><div className="panel"><div className="panel-head"><div><p className="eyebrow">Next action</p><h2>Start here</h2></div><span className="priority">P1</span></div><div className="next-action"><div className="action-index">{nextRow ? String(nextIndex + 1).padStart(2, "0") : "—"}</div><div><h3>{nextRow ? String(nextRow[2]) : "Plan complete"}</h3><p>{nextRow ? (String(nextRow[3]).length > 118 ? `${String(nextRow[3]).slice(0, 118)}…` : String(nextRow[3])) : "Every topic is done or skipped."}</p>{nextRow && <Link href={String(nextRow[5])}>Open reading</Link>}</div></div><button className="primary-button" onClick={() => setView("Plan")}>Open the plan <span>→</span></button></div></section>
      <section className="content-grid lower"><div className="panel wide"><div className="panel-head"><div><p className="eyebrow">By track</p><h2>Coverage at a glance</h2></div><button className="text-button" onClick={() => setView("Plan")}>View all →</button></div><div className="track-list">{trackTotals.map(({ name, count, hours: h, done: trackDone }) => <button className="track-row" key={name} onClick={() => { setTrack(name); setView("Plan"); }}><span className="track-name">{name}</span><span className="track-count">{count} topics</span><span className="track-progress"><span style={{ width: `${pct(trackDone, count)}%` }} /></span><span className="track-hours">{h}h</span></button>)}</div></div><div className="panel reality"><p className="eyebrow">Reality check</p><h2>Target calibration</h2><p>“$250K” is a 2–3 year target from Pune, not something this plan promises on its own. The nearer proof point is a strong global-remote India role.</p><ul className="market-list">{marketTiers.map((m) => <li key={m.market}><span className={`market-tier ${m.tone}`}>{m.label}</span><span className="market-name">{m.market}</span><span className="market-window">{m.window}</span></li>)}</ul><button className="text-button" onClick={() => setView("Comp reality")}>Read the assumptions →</button></div></section>
    </>;
}
