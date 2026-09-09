import { useState, useEffect } from "react";
// Types only, so nothing from lib/market - which reads GITHUB_TOKEN and Buffer - is pulled
// into the client bundle. Restating these shapes here instead would let the tab drift from
// what the benchmark actually emits without the build noticing.
import type { Benchmark, CoverageEntry, PlanRowRef } from "@/lib/market/benchmark";
import type { Insight, MarginalEntry, SegmentEntry } from "@/lib/market/insight";
import type { TrendPoint } from "@/lib/market/store";
import { planRows } from "./shared";

// `/api/market` degrades to `{ benchmark: null, synced: false }` when the files or the token
// are absent, so `benchmark: null` alone is not enough to explain the empty state: `synced`
// separates "no scan has run yet" from "we cannot see whether one has".
//
// `insight` is null on one state the other two never reach: a scan that ran before the insight
// computation shipped wrote benchmark.json and no insight.json. So it is optional as well as
// nullable, and every personal block below guards on it independently of `benchmark`.
type MarketFeed = { benchmark: Benchmark | null; trend: TrendPoint[] | null; insight?: Insight | null; synced: boolean };

/** Readiness moves and reachable-slice deltas are signed points; an unsigned "14" reads as a level. */
const signed = (n: number) => `${n > 0 ? "+" : ""}${n}`;

// benchmark.ts composes a headline and its detail into one string joined by "\n", so the
// plaintext weekly email can print it verbatim. Splitting on that newline is typography; no
// word is chosen here. Everything else on this tab renders `statement` untouched, because the
// email renders the same strings and a sentence must have exactly one place to be fixed.
function Statement({ text }: { text: string }) {
  return <>{text.split("\n").map((line, i) => <p className={i === 0 ? "mkt-head-line" : "mkt-body-line"} key={i}>{line}</p>)}</>;
}

/**
 * The trend line: distinct core requisitions, one point per completed scan cycle, 180 max.
 *
 * Inline SVG, no charting dependency. A single polyline over at most 180 points needs no axes,
 * no scales and no tooltips, and the smallest chart library in this space would outweigh
 * everything this page currently ships to the client.
 *
 * Fewer than two points draws nothing rather than a flat line. There is no way to recover a
 * board's state from before the first scan, so the honest rendering of day one is a sentence
 * saying the line starts here - a flat segment would read as a week of measured stability.
 */
function Sparkline({ points }: { points: TrendPoint[] }) {
  if (points.length < 2) return <p className="mkt-note">{points.length ? "One scan recorded. The line starts here, because there is no way to backfill board state from before the first scan." : "No scan cycles recorded yet."}</p>;
  const values = points.map((p) => p.core);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const x = (i: number) => (i / (points.length - 1)) * 240;
  // A flat series has zero range, and dividing by it puts every y at NaN, which renders an
  // empty polyline. Pin a flat series to the middle of the box instead.
  const y = (v: number) => (max === min ? 24 : 44 - ((v - min) / (max - min)) * 40);
  return <>
    {/* preserveAspectRatio="none" stretches the box to the panel width, which would also
        stretch the stroke; non-scaling-stroke is what keeps the line 1.5px at any width. */}
    <svg className="mkt-spark" viewBox="0 0 240 48" preserveAspectRatio="none" role="img" aria-label={`Core requisitions across ${points.length} scans, ${min} to ${max}`}>
      <polyline vectorEffect="non-scaling-stroke" points={points.map((p, i) => `${x(i).toFixed(2)},${y(p.core).toFixed(2)}`).join(" ")} />
    </svg>
    <div className="mkt-spark-labels"><span>{points[0].d} · {points[0].core}</span><span>{min}-{max} core reqs</span><span>{points[points.length - 1].d} · {points[points.length - 1].core}</span></div>
  </>;
}

/**
 * The Market tab.
 *
 * Three zones, in this order, each with its own heading and its own rule above it:
 *
 *   1. Decide - readiness, then the ranked marginal table. It leads because it is the only
 *      zone that answers a question you act on today.
 *   2. Reach - which requisitions are takeable from Pune, named where the feed names them,
 *      then the five-tier distribution, then the caveat on how many tiers were derived.
 *   3. Market - coverage, trend, velocity, gaps, over-investment. Reference: scrolled to,
 *      not led with.
 *
 * Quaere's reading stays last and visually distinct, still labelled interpretation rather than
 * measurement: everything above it is measured, it alone is not, and that separation is the only
 * thing keeping a model's sentence from borrowing the authority of the audited ones.
 *
 * What this renders, and what it does not. Every finding arrives from the cron pre-rendered in a
 * `statement` string, and this tab used to print one per entry - 34 of them under Coverage alone,
 * every sentence carrying the phrase "of core FDE requisitions", eight of them describing a skill
 * under 5%. The structured fields (`pct`, `hits`, `reqs`, `companies`, `rows`, `primaryRow`) were
 * always on the same objects, so the per-entry blocks are built from those and the sentence moves
 * to the row's `title`. `statement` is still printed verbatim wherever a zone has one summary line
 * - those are a linear read, which is what a sentence is good at. Nothing here composes a finding
 * out of numbers: the Monday email renders the identical strings, and two renderers phrasing the
 * same finding independently is how an email and a dashboard end up disagreeing.
 *
 * Three rules govern what appears at all, and each is one expression rather than a special case
 * for today's data:
 *
 *   1. A 0% skill is never rendered. Two exist today. "No requisition asks for this" is an
 *      absence of demand, not coverage - but the count is printed, so nothing vanishes silently.
 *   2. A status renders only when it is not "not started". Today that hides all 133 chips; the
 *      day row 28 is marked done it becomes the most useful mark on the page.
 *   3. Only skills at ≥20% are expanded; the rest collapse behind a disclosure.
 *
 * The status merge is the reason rule 2 is worth having: `statement` carries the committed
 * baseline from workbook col 15, the client's `lumen-statuses` are newer, and the chip reads the
 * same source of truth as the Plan tab rather than a sentence composed a scan ago.
 */
export function Market({ statuses, openPlanRow }: { statuses: Record<string, string>; openPlanRow: (row: number) => void }) {
  const [feed, setFeed] = useState<MarketFeed | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  // Fetched on mount, which means once per visit to the tab rather than once per session. The
  // scan cron rewrites benchmark.json daily, and a cached copy would render a stale computedAt
  // as current - the one thing the timestamp exists to prevent.
  useEffect(() => {
    fetch("/api/market")
      .then((res) => res.ok ? res.json() : Promise.reject(new Error(String(res.status))))
      .then((data: MarketFeed) => { setFeed(data); setState("ready"); })
      .catch(() => setState("error"));
  }, []);

  /**
   * Rule 2, in one place. The live status wins over the baseline the scan committed, and the
   * chip is emitted only when it says something - "not started" on 133 rows is 133 renderings of
   * zero bits, and the same expression surfaces the one row that matters the day it changes.
   */
  const liveStatus = (ref: PlanRowRef) => String(statuses[`${ref.track}::${ref.topic}`] || ref.status);
  const worthShowing = (status: string) => status.trim().toLowerCase() !== "not started";

  /**
   * A cited plan row: the number, its month, and its status when it has one. Supporting rows go
   * in the title rather than beside it - five chips per skill is what made the old list a wall,
   * and the rows that are not the primary one are context for a decision already made.
   */
  const rowLink = (ref: PlanRowRef, supporting: PlanRowRef[] = []) => {
    const status = liveStatus(ref);
    const title = [
      `${ref.topic}: ${ref.hours}h, month ${ref.month}`,
      supporting.length ? `Supporting rows: ${supporting.map((s) => `${s.row} · ${s.topic}`).join("; ")}` : "",
    ].filter(Boolean).join("\n");
    return <button className="mkt-rowlink" key={ref.row} title={title} onClick={() => openPlanRow(ref.row)}>
      row {ref.row}<span>M{ref.month}</span>{worthShowing(status) && <span className="status">{status.toLowerCase()}</span>}
    </button>;
  };
  const rowLinks = (rows: PlanRowRef[]) => rows.length > 0 && <div className="mkt-rows">{rows.map((ref) => rowLink(ref))}</div>;

  /**
   * A marginal entry names its plan row but not its track, and `statuses` is keyed
   * `${track}::${topic}` - the Plan tab's key. Resolving the track from the workbook here rather
   * than widening the computed type keeps every chip on this tab reading its status from one
   * place; a marginal row falling back to the committed baseline while the coverage row above it
   * shows the live status would be two answers to "is row 28 done" in one panel.
   *
   * `planRows` is `Plan.slice(1)`, so plan row N is `planRows[N - 1]` - the same off-by-one the
   * benchmark resolves in the other direction with `workbook.Plan[N]`.
   */
  const marginalRef = (entry: MarginalEntry): PlanRowRef[] => {
    const row = planRows[entry.row - 1];
    return row ? [{ row: entry.row, track: String(row[0]), topic: entry.topic, month: entry.month, hours: entry.hours, status: entry.status }] : [];
  };

  const panel = (meta: string, body: React.ReactNode) => <section className="panel full-panel">
    <div className="panel-head"><div><p className="eyebrow">Job market benchmark</p><h2>What the market is asking for</h2></div><span className="panel-meta">{meta}</span></div>
    {body}
  </section>;

  const zone = (index: number, name: string, title: string, meta: string, body: React.ReactNode) => <section className="mkt-zone" key={name}>
    <div className="mkt-zone-head"><div><p className="eyebrow">{index} · {name}</p><h3>{title}</h3></div><span className="panel-meta">{meta}</span></div>
    {body}
  </section>;

  if (state === "loading") return panel("Reading the last scan…", <p className="mkt-note">Loading the benchmark.</p>);
  if (state === "error") return panel("Unavailable", <p className="mkt-note">The benchmark could not be loaded. Everything on this tab is computed by the nightly scan, so refreshing is safe.</p>);

  const b = feed?.benchmark ?? null;
  const insight = feed?.insight ?? null;
  const reach = insight?.reachability ?? null;

  // Rules 1 and 3, as two filters over one list. `hidden` counts the 0% entries as well as the
  // sub-20% ones, so the disclosure's number and the number of skills the scan measured always
  // add up to the same total whatever today's data looks like.
  const measured = b?.coverage ?? [];
  const covered = measured.filter((entry) => entry.pct > 0);
  const zeroCount = measured.length - covered.length;
  const major = covered.filter((entry) => entry.pct >= 20);
  const minor = covered.filter((entry) => entry.pct < 20);
  const hiddenCount = measured.length - major.length;

  const reachableOf = (id: string) => reach?.skills.find((skill) => skill.id === id) ?? null;
  const tierCount = (segment: SegmentEntry, tier: string) => segment.reach.find((entry) => entry.tier === tier)?.count ?? 0;
  const inIndiaOf = (segment: SegmentEntry) => tierCount(segment, "india-remote") + tierCount(segment, "india-office") + tierCount(segment, "emea-apac-remote");

  /**
   * One coverage row. The skill's own sentence - the one the email prints - is the row's title,
   * so nothing is lost by not printing it; "Yours" is the same skill measured over the slice of
   * the market that does not require a move, which is the only one of the two numbers that is a
   * study decision. It is a dash rather than a zero when insight.json has not been written: an
   * unmeasured reachable share and a measured 0% are different facts.
   */
  const coverageRow = (entry: CoverageEntry) => {
    const primary = entry.rows.find((ref) => ref.row === entry.primaryRow) ?? entry.rows[0] ?? null;
    const supporting = entry.rows.filter((ref) => ref !== primary);
    const yours = reachableOf(entry.id);
    return <div className="mkt-cols-row" key={entry.id}>
      <span title={entry.statement}>{entry.label}<span className="mkt-sub">{entry.hits} of {entry.reqs} reqs · {entry.companies} of {entry.totalCompanies} companies</span></span>
      <span className="mkt-meter"><span className="mkt-bar" aria-hidden="true"><span style={{ width: `${entry.pct}%` }} /></span><b>{entry.pct}%</b></span>
      {yours
        ? <b className={`mkt-yours ${yours.reachablePct >= entry.pct ? "is-above" : "is-below"}`} title={yours.statement}>{yours.reachablePct}%</b>
        : <b className="mkt-yours" title="The reachable-market share is computed by the insight pass, which has not run since this benchmark was written.">-</b>}
      <span>{primary ? rowLink(primary, supporting) : <span className="mkt-sub">no plan row</span>}</span>
    </div>;
  };

  const coverageGrid = (entries: CoverageEntry[]) => <div className="mkt-cols mkt-cov">
    <div className="mkt-cols-head"><span>Skill</span><span>Market</span><span>Yours</span><span>Plan row</span></div>
    {entries.map(coverageRow)}
  </div>;

  const flags = insight?.flags ?? [];
  // A requisition you could take from Pune today is the only flag that is about a named role, so
  // it is read in the Reach zone beside the tiers it belongs to rather than in the event list.
  const indiaFlags = flags.filter((flag) => flag.kind === "new-india-remote");
  const otherFlags = flags.filter((flag) => flag.kind !== "new-india-remote");
  const indiaSegments = (insight?.segments ?? []).filter((segment) => inIndiaOf(segment) > 0);
  // The tier sentence is a headline and a caveat joined by a newline; the headline is a
  // percentage the bars below already draw, the caveat is the one part that is not drawable.
  const reachCaveat = reach ? reach.statement.split("\n").slice(1).join(" ") : "";

  const meta = b
    // Always rendered, never relative. Stale data that looks current is the failure mode this
    // tab is most exposed to, and "3 days ago" is a phrasing that hides how stale.
    ? `Computed ${b.computedAt.slice(0, 16).replace("T", " ")} UTC · ${b.boardsOk} of ${b.boardsTotal} boards`
    : "No scan yet";

  return panel(meta, <>
    <div className="mkt-summary">
      {b ? <>
        <p className="mkt-head-line">{b.coreStatement}</p>
        <p className="mkt-body-line">{b.adjacentStatement}</p>
        {b.baselineStatement && <p className="mkt-body-line">{b.baselineStatement}</p>}
        {b.movement.statement && <p className={b.movement.suppressed ? "mkt-body-line mkt-warn" : "mkt-head-line"}>{b.movement.statement}</p>}
      </> : <>
        <p className="mkt-head-line">No scan has completed a full cycle, so there is nothing to benchmark against yet.</p>
        <p className="mkt-body-line">The scan runs nightly and establishes a baseline on its first complete pass. The three zones below keep their headings so the shape of the tab is the same before and after that run; each one says what it is waiting for.</p>
        {feed?.synced === false && <p className="mkt-body-line mkt-warn">The benchmark store is unreachable, so this is “not known”, not “not scanned”. Check GITHUB_TOKEN.</p>}
      </>}
    </div>

    {/* 1 - Decide. What you act on today, so it is what you land on. */}
    {zone(1, "Decide", "What to study next", insight ? `${insight.readiness.marginal.length} incomplete rows ranked by readiness gain` : "arrives with the next scan", !insight
      ? <p className="mkt-note">Readiness is weighted by market share and computed from your progress events by the same nightly scan, one file after the benchmark. That file has not been written yet, so there is no ranking to act on. The Market zone below does not depend on it.</p>
      : <>
        {otherFlags.length > 0 && <div className="mkt-flags">{otherFlags.map((flag) => <p className="mkt-head-line" key={`${flag.kind}::${flag.id}`}>{flag.statement}</p>)}</div>}
        <div className="mkt-lead"><Statement text={insight.readiness.statement} /></div>
        {/* The absolute number is stated above and the ranked table is the deliverable: at month
            one readiness is ~0% and will stay low for months, so an unmoving headline is not a
            decision aid and "which row moves it most" is. */}
        {insight.readiness.marginal.length === 0
          ? <p className="mkt-note">No incomplete plan row carries a mapped skill, so there is no marginal move left to rank. Readiness moves from here only by the market changing what it asks for.</p>
          : <div className="mkt-cols mkt-marg">
            <div className="mkt-cols-head"><span>Plan row</span><span>Clears</span><span>Cost</span><span>Gain</span></div>
            {insight.readiness.marginal.filter((entry) => entry.skills.some((skill) => skill.pct > 0)).map((entry) => {
              const refs = marginalRef(entry);
              return <div className="mkt-cols-row" key={entry.row} title={entry.statement}>
                <span>{refs.length ? rowLink(refs[0]) : <span className="mkt-sub">row {entry.row}</span>}<span className="mkt-sub">{entry.topic}</span></span>
                {/* Rule 1 applies here too, and the filter above it. A skill at 0% is an absence
                    of demand, not a share of one, so it may not be listed as something a row
                    "clears" -- and a row whose ONLY skills are 0% is a row ranked at +0 gain for
                    work nobody asked for, which is worse than cosmetic. */}
                <span>{entry.skills.filter((skill) => skill.pct > 0).map((skill) => `${skill.label} (${skill.pct}%)`).join(" · ")}</span>
                <b>{entry.hours}h · M{entry.month}</b>
                <b className="mkt-gain">{signed(entry.gainPoints)}</b>
              </div>;
            })}
          </div>}
      </>)}

    {/* 2 - Reach. A named role you could take beats any share of a market you cannot work in. */}
    {zone(2, "Reach", "Where you can actually work", reach ? `${reach.inIndiaCount} of ${reach.coreCount} takeable without leaving India · ${reach.inIndiaCompanies} companies` : "arrives with the next scan", !reach
      ? <p className="mkt-note">Reachability tiers every core requisition by what it would cost you to take it: remote from India, an Indian office, an IST-overlapping region, a move plus a visa, or out of reach. It is computed by the insight pass, which has not run since the benchmark above was written.</p>
      : reach.coreCount === 0
        ? <p className="mkt-note">No core requisition survived the scan, so there is no distribution to tier.</p>
        : <>
          <section className="mkt-section">
            <div className="mkt-section-head"><h3>Takeable from Pune</h3><span className="panel-meta">named where the scan names them</span></div>
            {/* The arrival, above the roster it annotates. The roster below lists every in-India
                requisition on every scan; this fires only on the scan where one first appears,
                which is the difference between a list to browse and a reason to stop what you
                are doing. Rendered as a statement line rather than another .mkt-role card
                because a Flag carries no url - a card without a link is a card you cannot open,
                and the same role's real card is a few lines below. */}
            {indiaFlags.length > 0 && <div className="mkt-flags">{indiaFlags.map((flag) => <p className="mkt-head-line" key={`${flag.kind}::${flag.id}`}>{flag.statement}</p>)}</div>}
            {/* Every in-India requisition, named. This used to render only `new-india-remote`
                flags, which are empty except on the scan where a role first appears - so the
                zone whose whole point is "a named role beats a share" showed shares. */}
            {reach.roles && reach.roles.length > 0
              ? <div className="mkt-roles">{reach.roles.map((role) => (
                  <a className="mkt-role" key={`${role.company}-${role.title}-${role.location}`} href={role.url} target="_blank" rel="noreferrer" title={role.tierLabel}>
                    <strong>{role.company}</strong>
                    <span>{role.title}</span>
                    <span className="mkt-sub">{role.location || role.tierLabel}</span>
                  </a>))}</div>
              : <p className="mkt-note">No requisition in this scan is takeable without leaving India. The scan runs nightly, and this list fills the moment one appears.</p>}
            {/* Which part of the market they sit in. The segment is exact and so is the count;
                the roster is every company scanned in that segment, not the one holding the
                requisition, so it is the row's title rather than a claim in the row. */}
            {indiaSegments.length > 0 && <div className="mkt-cols mkt-reach">
              <div className="mkt-cols-head"><span>Segment</span><span>India remote</span><span>India office</span><span>EMEA/APAC</span></div>
              {indiaSegments.map((segment) => <div className="mkt-cols-row" key={segment.id} title={`Companies scanned in this segment: ${segment.companies.join(", ")}`}>
                <span>{segment.label}<span className="mkt-sub">{segment.companies.length} companies scanned · {segment.count} core reqs</span></span>
                <b>{tierCount(segment, "india-remote")}</b>
                <b>{tierCount(segment, "india-office")}</b>
                <b>{tierCount(segment, "emea-apac-remote")}</b>
              </div>)}
            </div>}
          </section>

          <section className="mkt-section">
            <div className="mkt-section-head"><h3>Distribution</h3><span className="panel-meta">five tiers over {reach.coreCount} core reqs</span></div>
            {/* The bars are aria-hidden: the count and the percentage sit beside each one, so a
                screen reader that read them would read the same number twice. */}
            <div className="mkt-tiers">{reach.tiers.map((tier) => <div className="mkt-tierline" key={tier.tier} title={tier.label}>
              <span>{tier.tier}</span>
              <span className="mkt-bar" aria-hidden="true"><span style={{ width: `${tier.pct}%` }} /></span>
              <b>{tier.count}</b>
              <b>{tier.pct}%</b>
            </div>)}</div>
            {reachCaveat && <p className="mkt-note mkt-caveat">{reachCaveat}</p>}
          </section>

          {insight && insight.segments.length > 0 && <section className="mkt-section">
            <div className="mkt-section-head"><h3>Segments</h3><span className="panel-meta">ranked by reachable requisitions, then by fit</span></div>
            {insight.segments.map((segment) => <article className="mkt-entry" key={segment.id}>
              <Statement text={segment.statement} />
              {/* The mix, which the sentence does not carry - it states the reachable count and
                  the top skills, not how the rest of the segment splits across the other tiers.
                  Empty tiers are dropped: a row of zeroes is not a distribution. */}
              <div className="mkt-mix">{segment.reach.filter((tier) => tier.count > 0).map((tier) => <span className="mkt-chip" key={tier.tier} title={tier.label}><b>{tier.count}</b>{tier.tier}</span>)}</div>
            </article>)}
          </section>}
        </>)}

    {/* 3 - Market. Impersonal, publishable, the same numbers for any reader. */}
    {zone(3, "Market", "What the market asks for", b ? `${major.length} of ${measured.length} skills expanded · highest share first` : "arrives with the first scan", !b
      ? <p className="mkt-note">Coverage, gaps and over-investment are all measured against a corpus of scanned requisitions, and no cycle has completed. The trend line starts empty and fills in one point per cycle; there is no way to recover what the boards held before the first scan, so it is not backfilled.</p>
      : <>
        <section className="mkt-section">
          <div className="mkt-section-head"><h3>Coverage</h3><span className="panel-meta">market share against your reachable share</span></div>
          {major.length === 0
            ? <p className="mkt-note">No skill reached 20% of core requisitions in this scan.</p>
            : coverageGrid(major)}
          {hiddenCount > 0 && <details className="mkt-more">
            <summary>{hiddenCount} more below 20%</summary>
            {minor.length > 0 && coverageGrid(minor)}
            {zeroCount > 0 && <p className="mkt-note mkt-more-foot">{zeroCount} of those {hiddenCount} sit at 0% and are not listed: no requisition in this scan asks for them.</p>}
          </details>}
        </section>

        <section className="mkt-section">
          <div className="mkt-section-head"><h3>Trend</h3><span className="panel-meta">core requisitions per scan cycle</span></div>
          <div className="mkt-trend"><Sparkline points={feed?.trend ?? []} /></div>
        </section>

        {insight && <section className="mkt-section">
          <div className="mkt-section-head"><h3>Velocity</h3><span className="panel-meta">{insight.velocity.available ? `${insight.velocity.spanDays} days · ${insight.velocity.from} to ${insight.velocity.to}` : "not yet measurable"}</span></div>
          {/* One statement covers both cases. With a single trend point it says so and emits
              nothing else - there is no way to recover board state from before the first scan, and
              an interpolated slope would be indistinguishable from a measured one. */}
          <div className="mkt-lead"><Statement text={insight.velocity.statement} /></div>
          {insight.velocity.skills.map((skill) => <article className="mkt-entry" key={skill.id}><p className="mkt-body-line">{skill.statement}</p></article>)}
        </section>}

        <section className="mkt-section">
          <div className="mkt-section-head"><h3>Gaps</h3><span className="panel-meta">{b.gaps.length} audited · no plan row covers these</span></div>
          {b.gaps.map((gap) => <article className="mkt-entry" key={gap.id}><Statement text={gap.statement} />{rowLinks(gap.rows)}</article>)}
        </section>

        <section className="mkt-section">
          <div className="mkt-section-head"><h3>Over-investment</h3><span className="panel-meta">scheduled hours against measured JD frequency</span></div>
          {b.overInvested.map((track) => <article className="mkt-entry" key={track.rowRange}><Statement text={track.statement} /></article>)}
          <p className="mkt-total">{b.overInvestedTotal.statement}</p>
        </section>
      </>)}

    {/* Quaere's reading. Absent entirely when the paragraph is null - the cron drops it on any
        failure and on any digit it contains, and an interpretation block that degrades to an
        apology would be worse than no block. Visually distinct and last, never interleaved with
        the numbers: everything above is measured, this alone is not, and the separation is the
        only thing keeping a model's sentence from borrowing the authority of the audited ones. */}
    {insight?.quaere && <section className="mkt-quaere">
      <p className="eyebrow">Quaere&rsquo;s reading: interpretation, not measurement</p>
      <p>{insight.quaere}</p>
      <p className="mkt-quaere-foot">Written by the nightly scan from the numbers above, then stored. It contains no figure of its own: any digit drops the paragraph.</p>
    </section>}
  </>);
}
