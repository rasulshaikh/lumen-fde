import { roadmapRows } from "./shared";

/**
 * A roadmap card, which is a card only when it has somewhere to go.
 *
 * The Roadmaps grid used a raw `<a href={String(r[1])}>`, and one workbook row carries a null
 * URL (the uploaded skills matrix, which is a file rather than a link). `String(null)` is the
 * literal "null", so that card resolved to /null - a 404 in dev, and behind the password gate a
 * 307 to the login screen in a fresh tab. `Link` above already refuses a non-http href for
 * exactly this reason; the grid needed the same refusal in card shape rather than a second
 * opinion about what a missing URL means.
 */
function ResourceCard({ href, index, title, note }: { href: string; index: number; title: string; note: string }) {
  const body = <><span className="resource-number">{String(index).padStart(2, "0")}</span><div><h3>{title}</h3><p>{note}</p></div><span className="arrow">{href.startsWith("http") ? "↗" : ""}</span></>;
  if (!href.startsWith("http")) return <div className="resource-card no-link" title="No resource assigned">{body}</div>;
  return <a className="resource-card" href={href} target="_blank" rel="noreferrer">{body}</a>;
}

export function Roadmaps() {
  return <section className="panel full-panel"><div className="panel-head"><div><p className="eyebrow">External scaffolding</p><h2>Roadmaps & guides</h2></div></div><div className="resource-grid">{roadmapRows.map((r, i) => <ResourceCard key={i} href={String(r[1] ?? "")} index={i + 1} title={String(r[0])} note={String(r[2])} />)}</div></section>;
}
