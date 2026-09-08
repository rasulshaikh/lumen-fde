import { mockRows, mockWindow, pct } from "./shared";

export function Mocks() {
  return <section className="panel full-panel"><div className="panel-head"><div><p className="eyebrow">Interview proof</p><h2>Mocks & repetitions</h2></div><span className="panel-meta">{mockRows.length} practice loops{mockWindow ? ` · ${mockWindow}` : ""}</span></div><div className="mock-grid">{mockRows.map((r, i) => <div className="mock-row" key={i}><div className="mock-title"><strong>{String(r[0])}</strong><span>{String(r[2])}h each</span></div><div className="mock-bar"><span style={{ width: `${pct(Number(r[6] || 0), Number(r[1] || 0))}%` }} /></div><div className="mock-stats"><b>{String(r[6] || 0)} / {String(r[1])}</b><span>{String(r[5])}</span></div></div>)}</div></section>;
}
