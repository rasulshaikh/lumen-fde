"use client";

import { useEffect, useState } from "react";

/**
 * Counts-only card for the broad market feed. Reads /api/market/broad, which returns
 * aggregates only. Renders nothing when the flag is off, the feed is unavailable, or the
 * request fails: this is a second view of the market, not something the tab depends on.
 *
 * Deliberately imports nothing from lib/market/fetch.ts, so the feed reader and its config
 * never reach the client bundle.
 */
type Counts = {
  enabled: boolean;
  ok?: boolean;
  day?: string;
  rows?: number;
  sources?: number;
  sourcesOk?: number;
  companies?: number;
  byLane?: Record<string, number>;
  byRegion?: Record<string, number>;
};

const LANES: [string, string][] = [["fde", "Forward deployed"], ["applied_ai", "Applied AI"], ["gtm_engineer", "GTM engineer"], ["founding", "Founding"], ["revops", "RevOps"], ["other", "Other"]];
const REGIONS: [string, string][] = [["india", "India"], ["worldwide", "Worldwide or APAC"], ["unstated", "Remote, region unstated"], ["check", "Check"], ["no", "Elsewhere"]];

export function BroadMarketCard() {
  const [counts, setCounts] = useState<Counts | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/market/broad", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Counts | null) => setCounts(data))
      .catch(() => setCounts(null));
    return () => controller.abort();
  }, []);

  if (!counts?.enabled || !counts.ok || !counts.rows) return null;
  const total = counts.rows;
  const bars = (title: string, entries: [string, string][], values: Record<string, number> = {}) => <div className="mkt-zone">
    <div className="mkt-zone-head"><div><h3>{title}</h3></div></div>
    {entries.filter(([key]) => (values[key] ?? 0) > 0).map(([key, label]) => {
      const n = values[key] ?? 0;
      const pct = Math.round((n / total) * 100);
      return <div className="mkt-cols-row" key={key}>
        <span>{label}<span className="mkt-sub">{n} roles</span></span>
        <span className="mkt-meter"><span className="mkt-bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></span><b>{pct}%</b></span>
      </div>;
    })}
  </div>;

  return <section className="panel full-panel" aria-label="Broad market feed">
    <div className="panel-head">
      <div><p className="eyebrow">Broad market feed</p><h2>Across the wider board list</h2></div>
      <span className="panel-meta">{counts.day} · {counts.sourcesOk} of {counts.sources} boards read</span>
    </div>
    <p className="mkt-note">{total} matching roles at {counts.companies} companies. Counts only, kept separate from the benchmark above.</p>
    {bars("By lane", LANES, counts.byLane)}
    {bars("By region", REGIONS, counts.byRegion)}
  </section>;
}
