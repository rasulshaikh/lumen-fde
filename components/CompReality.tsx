import { compRows, verdictTier } from "./shared";

export function CompReality() {
  return <section className="panel full-panel"><div className="panel-head"><div><p className="eyebrow">Context, not promises</p><h2>Compensation reality</h2></div></div><div className="comp-list">{compRows.map((r, i) => <article className="comp-row" key={i}><div><span className="comp-market">{String(r[0])}</span><h3>{String(r[1])}</h3></div><p>{String(r[3])}</p><span className={`prob prob-${verdictTier(String(r[4])).tone}`}>{String(r[4])}</span></article>)}</div></section>;
}
