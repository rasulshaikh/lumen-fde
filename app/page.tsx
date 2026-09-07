"use client";

import { Fragment, useMemo, useState, useEffect } from "react";
import workbook from "@/data/workbook.json";
import library from "@/data/library-context.json";
import repositories from "@/data/repository-context.json";
import { LogoMark, AskMark } from "./brand";
import { RecallStrip } from "./recall";
import { Terminal } from "./terminal";
// Types only, so nothing from lib/market — which reads GITHUB_TOKEN and Buffer — is pulled
// into the client bundle. Restating these shapes here instead would let the tab drift from
// what the benchmark actually emits without the build noticing.
import type { Benchmark, CoverageEntry, PlanRowRef } from "@/lib/market/benchmark";
import type { Insight, MarginalEntry, SegmentEntry } from "@/lib/market/insight";
import type { TrendPoint } from "@/lib/market/store";

type Row = (string | number | null)[];
const planRows = workbook.Plan.slice(1) as Row[];
// The workbook sheets end with a "Total" summary row and a one-cell instruction
// note. Both are presentation, not data: rendering them produced "Mnull"/"Mundefined"
// rows, and counting the Total row doubled the mock target (57 became 114).
const isDataRow = (r: Row, width: number) => r.length >= width && String(r[0]).trim().toLowerCase() !== "total";
const mockRows = (workbook.Mocks.slice(1) as Row[]).filter((r) => isDataRow(r, 9));
const roadmapRows = (workbook.Roadmaps.slice(1) as Row[]).filter((r) => isDataRow(r, 3));
const compRows = (workbook.CompReality.slice(1) as Row[]).filter((r) => isDataRow(r, 5));
const tracks = Array.from(new Set(planRows.map((r) => String(r[0]))));
const months = Array.from(new Set(planRows.map((r) => Number(r[1])))).sort((a, b) => a - b);
const pct = (done: number, total: number) => total ? Math.round((done / total) * 100) : 0;
const topicKey = (r: Row) => `${String(r[0])}::${String(r[2])}`;

function Link({ href, children }: { href: string; children: React.ReactNode }) { if (!href.startsWith("http")) return <span className="resource-link no-link" title="No resource assigned">{children}</span>; return <a className="resource-link" href={href} target="_blank" rel="noreferrer">{children}<span>↗</span></a>; }
function Metric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: string }) { return <div className={`metric ${tone}`}><span className="metric-label">{label}</span><strong>{value}</strong><span className="metric-detail">{detail}</span></div>; }
const assessmentSets = [
  { title: "Weekly checkpoint", cadence: "Every week · 30 minutes", instruction: "Close your notes. Explain one topic, solve two small problems, then write one production lesson. Pass when you can explain the why, not only the command.", topics: "Current plan topics · shell · networking · systems", key: "Grade yourself against the topic's own outcomes in the recall strip: Fluent means closed-book and complete, Halting means gaps, Gone means start it again." },
  { title: "Monthly deep dive", cadence: "Every month · 90 minutes", instruction: "Part 1: explain three ideas simply. Part 2: design a small system. Part 3: debug a failure case. Part 4: show evidence from your build. Review mistakes the next day.", topics: "One month of plan work · one build artifact · one mock", key: "Rubric: correctness 40% · tradeoffs 25% · debugging 20% · communication 15%" },
  { title: "Quarterly capstone", cadence: "Every quarter · 3 hours", instruction: "Treat this like an MIT-style open-book systems examination. Start with assumptions, draw the design, implement a thin slice, test failure paths, and defend your choices aloud. Submit notes, code, tests, and a short retrospective.", topics: "End-to-end FDE case · architecture · delivery · customer impact", key: "Rubric: problem framing 20% · system design 25% · implementation 25% · reliability 15% · FDE communication 15%" },
];
function Assessments() {
  const [open, setOpen] = useState<number | null>(0);
  return <section className="panel full-panel assessment-panel"><div className="panel-head"><div><p className="eyebrow">Serious practice</p><h2>Assessments that compound</h2></div><span className="panel-meta">Weekly · monthly · quarterly</span></div><p className="assessment-lead">Use retrieval, not rereading. Write your answer before checking the key. Keep the result as interview evidence.</p><div className="assessment-list">{assessmentSets.map((assessment, index) => <article className={`assessment-card ${open === index ? "open" : ""}`} key={assessment.title}><button className="assessment-toggle" onClick={() => setOpen(open === index ? null : index)}><span><strong>{assessment.title}</strong><small>{assessment.cadence}</small></span><b>{open === index ? "−" : "+"}</b></button>{open === index && <div className="assessment-body"><p>{assessment.instruction}</p><span className="assessment-topics">{assessment.topics}</span><div className="answer-key"><strong>Answer key and rubric</strong><span>{assessment.key}</span></div><p className="assessment-note">Score your work through Quaere or the MCP <code>score_assessment</code> tool. Results are guidance, not a pass/fail gate.</p></div>}</article>)}</div></section>;
}

// Starter questions. The first one is deliberate: Quaere once answered "there is no ML
// topic in the visible plan" because the client sent it 8 of 119 rows. Asking it is now
// the fastest way to see that the whole plan is in context.
const FAQS = [
  "Does my plan cover machine learning, and where?",
  "What should I focus on this week, and why that over anything else?",
  "Which of my indexed books actually helps with the topic I have open?",
  // derived, not typed: this said "13 months" until the Hours column was re-baselined
  `Am I on pace to finish in ${months[months.length - 1]} months at 16 hours a week?`,
  "What will a senior FDE interview actually test that my plan does not cover?",
];

const TABS = ["Overview", "Plan", "Curriculum", "Sandbox", "Mocks", "Roadmaps", "Library", "Assessments", "Comp reality", "Market"];
type Subtopic = { name: string; learn: string; minutes: number; resource: { label: string; url: string } };
type Syllabus = { i: number; topic: string; hours: number; why: string; prerequisites: string[]; subtopics: Subtopic[]; outcomes: string[]; failureModes: string[]; interviewQuestions: string[]; proofOfWork: string };
function SyllabusView({ s, row }: { s: Syllabus; row?: Row }) {
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
 * saying the line starts here — a flat segment would read as a week of measured stability.
 */
function Sparkline({ points }: { points: TrendPoint[] }) {
  if (points.length < 2) return <p className="mkt-note">{points.length ? "One scan recorded. The line starts here — there is no way to backfill board state from before the first scan." : "No scan cycles recorded yet."}</p>;
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
    <div className="mkt-spark-labels"><span>{points[0].d} · {points[0].core}</span><span>{min}–{max} core reqs</span><span>{points[points.length - 1].d} · {points[points.length - 1].core}</span></div>
  </>;
}

/**
 * The Market tab.
 *
 * Three zones, in this order, each with its own heading and its own rule above it:
 *
 *   1. Decide — readiness, then the ranked marginal table. It leads because it is the only
 *      zone that answers a question you act on today.
 *   2. Reach — which requisitions are takeable from Pune, named where the feed names them,
 *      then the five-tier distribution, then the caveat on how many tiers were derived.
 *   3. Market — coverage, trend, velocity, gaps, over-investment. Reference: scrolled to,
 *      not led with.
 *
 * Quaere's reading stays last and visually distinct, still labelled interpretation rather than
 * measurement: everything above it is measured, it alone is not, and that separation is the only
 * thing keeping a model's sentence from borrowing the authority of the audited ones.
 *
 * What this renders, and what it does not. Every finding arrives from the cron pre-rendered in a
 * `statement` string, and this tab used to print one per entry — 34 of them under Coverage alone,
 * every sentence carrying the phrase "of core FDE requisitions", eight of them describing a skill
 * under 5%. The structured fields (`pct`, `hits`, `reqs`, `companies`, `rows`, `primaryRow`) were
 * always on the same objects, so the per-entry blocks are built from those and the sentence moves
 * to the row's `title`. `statement` is still printed verbatim wherever a zone has one summary line
 * — those are a linear read, which is what a sentence is good at. Nothing here composes a finding
 * out of numbers: the Monday email renders the identical strings, and two renderers phrasing the
 * same finding independently is how an email and a dashboard end up disagreeing.
 *
 * Three rules govern what appears at all, and each is one expression rather than a special case
 * for today's data:
 *
 *   1. A 0% skill is never rendered. Two exist today. "No requisition asks for this" is an
 *      absence of demand, not coverage — but the count is printed, so nothing vanishes silently.
 *   2. A status renders only when it is not "not started". Today that hides all 133 chips; the
 *      day row 28 is marked done it becomes the most useful mark on the page.
 *   3. Only skills at ≥20% are expanded; the rest collapse behind a disclosure.
 *
 * The status merge is the reason rule 2 is worth having: `statement` carries the committed
 * baseline from workbook col 15, the client's `lumen-statuses` are newer, and the chip reads the
 * same source of truth as the Plan tab rather than a sentence composed a scan ago.
 */
function Market({ statuses, openPlanRow }: { statuses: Record<string, string>; openPlanRow: (row: number) => void }) {
  const [feed, setFeed] = useState<MarketFeed | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  // Fetched on mount, which means once per visit to the tab rather than once per session. The
  // scan cron rewrites benchmark.json daily, and a cached copy would render a stale computedAt
  // as current — the one thing the timestamp exists to prevent.
  useEffect(() => {
    fetch("/api/market")
      .then((res) => res.ok ? res.json() : Promise.reject(new Error(String(res.status))))
      .then((data: MarketFeed) => { setFeed(data); setState("ready"); })
      .catch(() => setState("error"));
  }, []);

  /**
   * Rule 2, in one place. The live status wins over the baseline the scan committed, and the
   * chip is emitted only when it says something — "not started" on 133 rows is 133 renderings of
   * zero bits, and the same expression surfaces the one row that matters the day it changes.
   */
  const liveStatus = (ref: PlanRowRef) => String(statuses[`${ref.track}::${ref.topic}`] || ref.status);
  const worthShowing = (status: string) => status.trim().toLowerCase() !== "not started";

  /**
   * A cited plan row: the number, its month, and its status when it has one. Supporting rows go
   * in the title rather than beside it — five chips per skill is what made the old list a wall,
   * and the rows that are not the primary one are context for a decision already made.
   */
  const rowLink = (ref: PlanRowRef, supporting: PlanRowRef[] = []) => {
    const status = liveStatus(ref);
    const title = [
      `${ref.topic} — ${ref.hours}h, month ${ref.month}`,
      supporting.length ? `Supporting rows: ${supporting.map((s) => `${s.row} · ${s.topic}`).join("; ")}` : "",
    ].filter(Boolean).join("\n");
    return <button className="mkt-rowlink" key={ref.row} title={title} onClick={() => openPlanRow(ref.row)}>
      row {ref.row}<span>M{ref.month}</span>{worthShowing(status) && <span className="status">{status.toLowerCase()}</span>}
    </button>;
  };
  const rowLinks = (rows: PlanRowRef[]) => rows.length > 0 && <div className="mkt-rows">{rows.map((ref) => rowLink(ref))}</div>;

  /**
   * A marginal entry names its plan row but not its track, and `statuses` is keyed
   * `${track}::${topic}` — the Plan tab's key. Resolving the track from the workbook here rather
   * than widening the computed type keeps every chip on this tab reading its status from one
   * place; a marginal row falling back to the committed baseline while the coverage row above it
   * shows the live status would be two answers to "is row 28 done" in one panel.
   *
   * `planRows` is `Plan.slice(1)`, so plan row N is `planRows[N - 1]` — the same off-by-one the
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
  if (state === "error") return panel("Unavailable", <p className="mkt-note">The benchmark could not be loaded. Everything on this tab is computed by the nightly scan, so refreshing is safe — nothing here is lost by failing to load.</p>);

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
   * One coverage row. The skill's own sentence — the one the email prints — is the row's title,
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
        : <b className="mkt-yours" title="The reachable-market share is computed by the insight pass, which has not run since this benchmark was written.">—</b>}
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

    {/* 1 — Decide. What you act on today, so it is what you land on. */}
    {zone(1, "Decide", "What to study next", insight ? `${insight.readiness.marginal.length} incomplete rows ranked by readiness gain` : "arrives with the next scan", !insight
      ? <p className="mkt-note">Readiness is weighted by market share and computed from your progress events by the same nightly scan, one file after the benchmark. That file has not been written yet, so there is no ranking to act on — and nothing in the Market zone below depends on it.</p>
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

    {/* 2 — Reach. A named role you could take beats any share of a market you cannot work in. */}
    {zone(2, "Reach", "Where you can actually work", reach ? `${reach.inIndiaCount} of ${reach.coreCount} takeable without leaving India · ${reach.inIndiaCompanies} companies` : "arrives with the next scan", !reach
      ? <p className="mkt-note">Reachability tiers every core requisition by what it would cost you to take it — remote from India, an Indian office, an IST-overlapping region, a move plus a visa, or out of reach. It is computed by the insight pass, which has not run since the benchmark above was written.</p>
      : reach.coreCount === 0
        ? <p className="mkt-note">No core requisition survived the scan, so there is no distribution to tier.</p>
        : <>
          <section className="mkt-section">
            <div className="mkt-section-head"><h3>Takeable from Pune</h3><span className="panel-meta">named where the scan names them</span></div>
            {/* Every in-India requisition, named. This used to render only `new-india-remote`
                flags, which are empty except on the scan where a role first appears — so the
                zone whose whole point is "a named role beats a share" showed shares. */}
            {reach.roles && reach.roles.length > 0
              ? <div className="mkt-roles">{reach.roles.map((role) => (
                  <a className="mkt-role" key={`${role.company}-${role.title}-${role.location}`} href={role.url} target="_blank" rel="noreferrer" title={role.tierLabel}>
                    <strong>{role.company}</strong>
                    <span>{role.title}</span>
                    <span className="mkt-sub">{role.location || role.tierLabel}</span>
                  </a>))}</div>
              : <p className="mkt-note">No requisition in this scan is takeable without leaving India. That is a fact about this cycle, not a permanent one — the scan runs nightly and this list fills the moment one appears.</p>}
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
              {/* The mix, which the sentence does not carry — it states the reachable count and
                  the top skills, not how the rest of the segment splits across the other tiers.
                  Empty tiers are dropped: a row of zeroes is not a distribution. */}
              <div className="mkt-mix">{segment.reach.filter((tier) => tier.count > 0).map((tier) => <span className="mkt-chip" key={tier.tier} title={tier.label}><b>{tier.count}</b>{tier.tier}</span>)}</div>
            </article>)}
          </section>}
        </>)}

    {/* 3 — Market. Impersonal, publishable, the same numbers for any reader. */}
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
            {zeroCount > 0 && <p className="mkt-note mkt-more-foot">{zeroCount} of those {hiddenCount} sit at 0% and are not listed: no requisition in this scan asks for them, which is an absence of demand rather than a share of one.</p>}
          </details>}
        </section>

        <section className="mkt-section">
          <div className="mkt-section-head"><h3>Trend</h3><span className="panel-meta">core requisitions per scan cycle</span></div>
          <div className="mkt-trend"><Sparkline points={feed?.trend ?? []} /></div>
        </section>

        {insight && <section className="mkt-section">
          <div className="mkt-section-head"><h3>Velocity</h3><span className="panel-meta">{insight.velocity.available ? `${insight.velocity.spanDays} days · ${insight.velocity.from} to ${insight.velocity.to}` : "not yet measurable"}</span></div>
          {/* One statement covers both cases. With a single trend point it says so and emits
              nothing else — there is no way to recover board state from before the first scan, and
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

    {/* Quaere's reading. Absent entirely when the paragraph is null — the cron drops it on any
        failure and on any digit it contains, and an interpretation block that degrades to an
        apology would be worse than no block. Visually distinct and last, never interleaved with
        the numbers: everything above is measured, this alone is not, and the separation is the
        only thing keeping a model's sentence from borrowing the authority of the audited ones. */}
    {insight?.quaere && <section className="mkt-quaere">
      <p className="eyebrow">Quaere&rsquo;s reading — interpretation, not measurement</p>
      <p>{insight.quaere}</p>
      <p className="mkt-quaere-foot">Written by the nightly scan from the numbers above, then stored. It contains no figure of its own: any digit drops the paragraph.</p>
    </section>}
  </>);
}

export default function Home() {
  const [tab, setTab] = useState("Overview");
  const [track, setTrack] = useState("All tracks");
  const [month, setMonth] = useState("All months");
  const [query, setQuery] = useState("");
  const [progress, setProgress] = useState("All progress");
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [askOpen, setAskOpen] = useState(false);
  const [askText, setAskText] = useState("");
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string; reportUrl?: string }[]>([]);
  const [asking, setAsking] = useState(false);
  const [shared, setShared] = useState(false);
  // Was hardcoded "16h" next to a separate hours/16, so the two could disagree and
  // neither tracked reality. One source of truth, editable, persisted like statuses.
  const [weeklyHours, setWeeklyHours] = useState(16);
  useEffect(() => { const v = Number(localStorage.getItem("lumen-weekly-hours")); if (v >= 1 && v <= 80) setWeeklyHours(v); }, []);
  const setWeekly = (value: number) => { const v = Math.min(80, Math.max(1, Math.round(value) || 1)); setWeeklyHours(v); localStorage.setItem("lumen-weekly-hours", String(v)); };
  // The applied theme is set by an inline script in layout.tsx before first paint, so this
  // only mirrors it into React state for the button label — reading it here rather than
  // recomputing avoids a flash of the wrong icon on hydration.
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => { setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light"); }, []);
  const toggleTheme = () => setTheme((current) => {
    const next = current === "dark" ? "light" : "dark";
    const root = document.documentElement;
    root.classList.add("theme-switching");
    root.dataset.theme = next;
    localStorage.setItem("lumen-theme", next);
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("theme-switching")));
    return next;
  });
  const [curriculum, setCurriculum] = useState<Record<string, Syllabus>>({});
  const [curSummary, setCurSummary] = useState<Record<string, { parts: number; minutes: number }> | null>(null);
  const [curriculumState, setCurriculumState] = useState<"idle" | "loading" | "error">("idle");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [curOpen, setCurOpen] = useState<Set<number>>(new Set());
  const [askTopic, setAskTopic] = useState<number | null>(null);
  const toggleCur = (idx: number) => setCurOpen((s) => { const n = new Set(s); if (n.has(idx)) n.delete(idx); else n.add(idx); return n; });
  const syllabusFor = (idx: number) => curriculum[String(idx)];
  const renderSyllabus = (idx: number) => { const s = syllabusFor(idx); if (s) return <SyllabusView s={s} row={planRows[idx]} />; if (curriculumState === "loading") return <p className="syllabus-empty">Loading the syllabus…</p>; if (curriculumState === "error") return <p className="syllabus-empty">The syllabus could not be loaded. Refresh and try again.</p>; return <p className="syllabus-empty">No deep syllabus for this topic yet.</p>; };
  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) { await navigator.share({ title: "Lumen · Senior FDE plan", url }); return; }
      await navigator.clipboard.writeText(url);
      setShared(true); window.setTimeout(() => setShared(false), 2000);
    } catch { /* cancelled, or clipboard blocked without a secure context */ }
  };
  useEffect(() => { try { setStatuses(JSON.parse(localStorage.getItem("lumen-statuses") || "{}")); } catch {} fetch("/api/progress").then((res) => res.ok ? res.json() : null).then((data) => { if (!data?.events?.length) return; const synced: Record<string, string> = {}; for (const event of data.events) { const row = planRows.find((item) => String(item[2]).trim().toLowerCase() === String(event.topic).trim().toLowerCase()); if (row && !synced[topicKey(row)]) synced[topicKey(row)] = String(event.status).replace("_", " ").replace(/^\w/, (letter) => letter.toUpperCase()); } if (Object.keys(synced).length) { setStatuses((current) => { const merged = { ...current, ...synced }; localStorage.setItem("lumen-statuses", JSON.stringify(merged)); return merged; }); } }).catch(() => {}); }, []);
  useEffect(() => {
    // The merged syllabus is ~2.5MB, so never fetch it whole: pull a tiny summary to label
    // collapsed rows, then one topic at a time as it is opened.
    if (curSummary || tab !== "Curriculum") return;
    fetch("/api/curriculum?summary=1").then((res) => res.ok ? res.json() : Promise.reject(new Error(String(res.status))))
      .then((data) => setCurSummary(Object.fromEntries((data.summary || []).map((x: { i: number; parts: number; minutes: number }) => [String(x.i), { parts: x.parts, minutes: x.minutes }]))))
      .catch(() => {});
  }, [tab, curSummary]);
  const wanted = tab === "Curriculum" ? Array.from(curOpen) : expanded === null ? [] : [expanded];
  const wantedKey = wanted.join(",");
  useEffect(() => {
    const need = wanted.filter((i) => !curriculum[String(i)]);
    if (!need.length) return;
    setCurriculumState("loading");
    Promise.all(need.map((i) => fetch(`/api/curriculum?i=${i}`).then((res) => res.ok ? res.json() : null).then((d) => [i, d] as const).catch(() => [i, null] as const)))
      .then((pairs) => {
        const add: Record<string, Syllabus> = {};
        let failed = false;
        for (const [i, d] of pairs) { if (d) add[String(i)] = d as Syllabus; else failed = true; }
        if (Object.keys(add).length) setCurriculum((c) => ({ ...c, ...add }));
        setCurriculumState(failed ? "error" : "idle");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedKey]);
  useEffect(() => {
    if (!askOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setAskOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [askOpen]);
  const setStatus = (r: Row, status: string) => { const next = { ...statuses, [topicKey(r)]: status }; setStatuses(next); localStorage.setItem("lumen-statuses", JSON.stringify(next)); fetch("/api/progress", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic: String(r[2]), status: status.toLowerCase().replace(" ", "_") }) }).catch(() => {}); };
  // The Target calibration panel sat as one paragraph beside a 15-row track list, leaving
  // most of its column empty. The CompReality sheet already answers the question the panel
  // asks — which markets are actually reachable, and when — so it carries a ranked digest
  // instead of blank space. Tier is read off the probability prose, so it stays in sync
  // with the sheet rather than being a second hardcoded opinion.
  const marketTiers = useMemo(() => {
    const tier = (verdict: string) => {
      const v = verdict.toLowerCase();
      if (v.startsWith("high")) return { rank: 0, label: "High", tone: "go" };
      if (v.startsWith("realistic")) return { rank: 1, label: "Realistic", tone: "go" };
      if (v.startsWith("moderate")) return { rank: 2, label: "Moderate", tone: "hold" };
      if (v.startsWith("very low")) return { rank: 4, label: "Very low", tone: "stop" };
      if (v.startsWith("low")) return { rank: 3, label: "Low", tone: "stop" };
      return { rank: 5, label: "Long game", tone: "stop" };
    };
    return compRows
      .map((r) => ({ market: String(r[0]), window: String(r[4]), ...tier(String(r[4])) }))
      .sort((a, b) => a.rank - b.rank);
  }, []);

  // Footer provenance. The old line credited "Senior FDE Plan.xlsx", but data/source.xlsx
  // was frozen once the plan grew past it — workbook.json is the source of truth, so the
  // credit was pointing at a file the dashboard no longer reads. Scale is derived rather
  // than written down, for the same reason every other count on this page is.
  const curParts = useMemo(() => (curSummary ? Object.values(curSummary).reduce((n, x) => n + x.parts, 0) : 0), [curSummary]);

  const filtered = useMemo(() => planRows.filter((r) => (track === "All tracks" || r[0] === track) && (month === "All months" || String(r[1]) === month) && (progress === "All progress" || String(statuses[topicKey(r)] || r[15] || "Not started") === progress) && String(r[2]).toLowerCase().includes(query.toLowerCase())), [track, month, progress, query, statuses]);
  const statusOf = (r: Row) => String(statuses[topicKey(r)] || r[15] || "Not started");

  // Only topics actually in play enter the review schedule — drilling something never
  // opened is noise. Indices are curriculum keys, which are plan-row indices.
  const startedTopics = useMemo(() => planRows
    .map((r, i) => [i, statusOf(r)] as const)
    .filter(([, s]) => s === "In progress" || s === "Done")
    .map(([i]) => i), [statuses]);

  const done = planRows.filter((r) => statusOf(r) === "Done").length;
  const skipped = planRows.filter((r) => statusOf(r) === "Skipped").length;
  // Progress counted non-skipped topics (117 of 119) while every hours figure counted all
  // 119, so the plan advertised 916h that included 26h you had already decided to skip —
  // and inflated the timeline by 1.6 weeks. Scope is now one definition: active = not
  // skipped. The skipped amount is disclosed rather than silently dropped.
  const activeRows = planRows.filter((r) => statusOf(r) !== "Skipped");
  const planHours = planRows.reduce((n, r) => n + Number(r[13] || 0), 0);
  const hours = activeRows.reduce((n, r) => n + Number(r[13] || 0), 0);
  const skippedHours = planHours - hours;
  const doneHours = planRows.filter((r) => statusOf(r) === "Done").reduce((n, r) => n + Number(r[13] || 0), 0);
  const monthHours = months.map((m) => ({ month: m, hours: activeRows.filter((r) => Number(r[1]) === m).reduce((n, r) => n + Number(r[13] || 0), 0) }));
  const maxMonthHours = Math.max(...monthHours.map((x) => x.hours));
  const peakMonth = monthHours.find((x) => x.hours === maxMonthHours)!;
  // First topic that is neither done nor skipped, in plan order — the real "you are here".
  // The first topic that is neither done nor skipped. The hero note already used this;
  // the "Next action" panel did not — it read planRows[0] literally, so it kept saying
  // "Start here" about topic 1 long after you had finished topic 1.
  const nextIndex = useMemo(() => planRows.findIndex((x) => { const st = String(statuses[topicKey(x)] || x[15]); return st !== "Done" && st !== "Skipped"; }), [statuses]);
  const nextRow = nextIndex >= 0 ? planRows[nextIndex] : null;
  const focus = nextRow ? { month: Number(nextRow[1]), track: String(nextRow[0]).replace(/^[A-Z]\. /, "") } : null;
  const setView = (name: string) => { setTab(name); window.scrollTo({ top: 0, behavior: "smooth" }); };
  // A plan row cited by the benchmark is 1-based against workbook.Plan, whose header sits at
  // index 0 — so planRows[row - 1] is that topic. The filters are cleared first because a cited
  // row is usually outside whatever filter the Plan tab was left on, and expanding a row the
  // current filter hides looks exactly like a link that did nothing.
  const openPlanRow = (row: number) => {
    const index = row - 1;
    if (index < 0 || index >= planRows.length) return;
    setTrack("All tracks"); setMonth("All months"); setProgress("All progress"); setQuery("");
    setExpanded(index);
    setView("Plan");
  };
  const askLumen = async (prompt = askText) => {
    if (!prompt.trim() || asking) return;
    const context = filtered.slice(0, 8).map((r) => `${r[0]} | ${r[2]} | ${r[3]} | resources: ${r[4]}, ${r[7]}, ${r[10]}`).join("\n");
    setMessages((m) => [...m, { role: "user", content: prompt }]); setAskText(""); setAsking(true);
    const topicIndex = askTopic ?? expanded ?? undefined;
    try { const res = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, context, topicIndex, history: messages }) }); const data = await res.json(); setMessages((m) => [...m, { role: "assistant", content: data.answer || data.error || "Lumen could not answer right now.", reportUrl: data.reportUrl || undefined }]); } catch { setMessages((m) => [...m, { role: "assistant", content: "Lumen is unavailable. Add MINIMAX_API_KEY in Vercel project settings and try again." }]); } finally { setAsking(false); }
  };

  return <main className={askOpen ? "shell ask-open" : "shell"}>
    <header className="topbar"><a className="brand brand-link" href="/" aria-label="Return to Lumen home"><LogoMark className="brand-mark" /><div><div className="brand-name">Lumen</div><div className="brand-sub">by Rasul</div></div></a><div className="top-actions"><button className="ask-trigger" onClick={() => { setAskTopic(null); setAskOpen(true); }}><AskMark size={14} /> Quaere</button><button className="ghost-button" onClick={share} aria-live="polite">{shared ? "✓ Link copied" : "↗ Share"}</button><button className="theme-toggle" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>{theme === "dark" ? "☀" : "☾"}</button></div></header>
    <section className="hero"><div><p className="kicker">Preparation command center</p><h1>Build proof, not just knowledge.</h1><p className="hero-copy">Your {hours}-hour Senior FDE plan, reduced to the pace, practice, and proof that matter this week.</p></div><div className="hero-note"><span className="note-pin">●</span><div><strong>Current focus</strong><p>{focus ? `Month ${focus.month} · ${focus.track}` : "Plan complete"}</p></div></div></section>
    <nav className="tabs" aria-label="Workbook views">{TABS.map((item) => <button key={item} className={tab === item ? "tab active" : "tab"} onClick={() => setView(item)}>{item}</button>)}</nav><RecallStrip startedTopics={startedTopics} />
    {tab === "Assessments" && <Assessments />}
    {tab === "Sandbox" && <Terminal />}
    {tab === "Market" && <Market statuses={statuses} openPlanRow={openPlanRow} />}
    {tab === "Overview" && <>
      <section className="metric-grid"><Metric label="Plan progress" value={`${pct(done, activeRows.length)}%`} detail={`${done} of ${activeRows.length} active${skipped ? ` · ${skipped} of ${planRows.length} skipped` : ""}`} tone="rose" /><Metric label="Hours remaining" value={`${Math.max(hours - doneHours, 0)}`} detail={`of ${hours} active hours${skippedHours ? ` · ${skippedHours}h skipped` : ""}`} tone="teal" /><div className="metric brass"><span className="metric-label">Weekly commitment</span><strong><input className="weekly-input" type="number" min={1} max={80} value={weeklyHours} aria-label="Hours you study each week" onChange={(e) => setWeekly(Number(e.target.value))} />h</strong><span className="metric-detail">{(hours / weeklyHours).toFixed(1)} weeks · {(hours / weeklyHours / 4.333).toFixed(1)} months</span></div><Metric label="Mocks" value={`${mockRows.reduce((n, r) => n + Number(r[6] || 0), 0)} / ${mockRows.reduce((n, r) => n + Number(r[1] || 0), 0)}`} detail="completed / target" tone="ink" /></section>
      <section className="content-grid"><div className="panel wide"><div className="panel-head"><div><p className="eyebrow">Pace map</p><h2>Where the hours go</h2></div><span className="panel-meta">{hours}h · {tracks.length} tracks</span></div><div className="bar-chart">{monthHours.map((item) => <div className="bar-item" key={item.month}><div className="bar-value">{item.hours}h</div><div className="bar-track"><div className="bar-fill" style={{ height: `${Math.max(12, item.hours / maxMonthHours * 100)}%` }} /></div><div className="bar-label">M{item.month}</div></div>)}</div><div className="chart-foot"><span><i className="legend-dot rose" /> planned hours</span><span>Peak: Month {peakMonth.month} · {peakMonth.hours}h</span></div></div><div className="panel"><div className="panel-head"><div><p className="eyebrow">Next action</p><h2>Start here</h2></div><span className="priority">P1</span></div><div className="next-action"><div className="action-index">{nextRow ? String(nextIndex + 1).padStart(2, "0") : "—"}</div><div><h3>{nextRow ? String(nextRow[2]) : "Plan complete"}</h3><p>{nextRow ? (String(nextRow[3]).length > 118 ? `${String(nextRow[3]).slice(0, 118)}…` : String(nextRow[3])) : "Every topic is done or skipped."}</p>{nextRow && <Link href={String(nextRow[5])}>Open reading</Link>}</div></div><button className="primary-button" onClick={() => setView("Plan")}>Open the plan <span>→</span></button></div></section>
      <section className="content-grid lower"><div className="panel wide"><div className="panel-head"><div><p className="eyebrow">By track</p><h2>Coverage at a glance</h2></div><button className="text-button" onClick={() => setView("Plan")}>View all →</button></div><div className="track-list">{tracks.map((name) => { const rows = planRows.filter((r) => r[0] === name); const h = rows.reduce((n, r) => n + Number(r[13] || 0), 0); return <button className="track-row" key={name} onClick={() => { setTrack(name); setView("Plan"); }}><span className="track-name">{name}</span><span className="track-count">{rows.length} topics</span><span className="track-progress"><span style={{ width: `${pct(rows.filter((r) => (statuses[topicKey(r)] || r[15]) === "Done").length, rows.length)}%` }} /></span><span className="track-hours">{h}h</span></button>; })}</div></div><div className="panel reality"><p className="eyebrow">Reality check</p><h2>Target calibration</h2><p>“$250K” is a 2–3 year target from Pune, not something this plan promises on its own. The nearer proof point is a strong global-remote India role.</p><ul className="market-list">{marketTiers.map((m) => <li key={m.market}><span className={`market-tier ${m.tone}`}>{m.label}</span><span className="market-name">{m.market}</span><span className="market-window">{m.window}</span></li>)}</ul><button className="text-button" onClick={() => setView("Comp reality")}>Read the assumptions →</button></div></section>
    </>}
    {tab === "Plan" && <section className="panel full-panel"><div className="panel-head plan-head"><div><p className="eyebrow">{filtered.length === planRows.length ? `${planRows.length} topics · three resources each` : `${filtered.length} of ${planRows.length} topics`}</p><h2>Plan explorer</h2></div><div className="filters"><input aria-label="Search topics" placeholder="Search topics…" value={query} onChange={(e) => setQuery(e.target.value)} /><select value={track} onChange={(e) => setTrack(e.target.value)}><option>All tracks</option>{tracks.map((t) => <option key={t}>{t}</option>)}</select><select value={month} onChange={(e) => setMonth(e.target.value)}><option>All months</option>{months.map((m) => <option key={m}>{m}</option>)}</select><select aria-label="Filter by progress" value={progress} onChange={(e) => setProgress(e.target.value)}><option>All progress</option><option>Not started</option><option>In progress</option><option>Done</option><option>Skipped</option></select></div></div><div className="table-wrap"><table><thead><tr><th>Topic</th><th>Track</th><th>Month</th><th>Hours</th><th>Depth target</th><th>Resources</th><th>Progress</th></tr></thead><tbody>{filtered.map((r) => { const idx = planRows.indexOf(r); const open = expanded === idx; return <Fragment key={`${r[0]}-${r[2]}`}><tr><td><button className="topic-toggle" aria-expanded={open} aria-controls={`syllabus-${idx}`} onClick={() => setExpanded(open ? null : idx)}><strong>{String(r[2])}</strong><span className="chev" aria-hidden="true">{open ? "−" : "+"}</span></button><span className="status">{statuses[topicKey(r)] || r[15] || "Not started"}</span></td><td>{String(r[0]).replace(/^[A-Z]\. /, "")}</td><td>M{String(r[1])}</td><td>{String(r[13])}h</td><td className="depth">{String(r[3])}</td><td className="resource-stack"><Link href={String(r[5])}>Read</Link><Link href={String(r[8])}>Watch</Link><Link href={String(r[11])}>Do</Link></td><td><select className="status-select" aria-label={`Update ${String(r[2])}`} value={statuses[topicKey(r)] || String(r[15] || "Not started")} onChange={(e) => setStatus(r, e.target.value)}><option>Not started</option><option>In progress</option><option>Done</option><option>Skipped</option></select><button className="ask-row" onClick={() => { setAskTopic(idx); setAskOpen(true); setAskText(`Explain ${String(r[2])} with a practical example and a 20-minute exercise.`); }}>Ask</button></td></tr>{open && <tr className="syllabus-row" id={`syllabus-${idx}`}><td colSpan={7}>{renderSyllabus(idx)}</td></tr>}</Fragment>; })}</tbody></table></div></section>}
    {tab === "Curriculum" && <section className="panel full-panel"><div className="panel-head"><div><p className="eyebrow">Deep syllabus</p><h2>Everything to learn, topic by topic</h2></div><span className="panel-meta">{curSummary ? `${Object.keys(curSummary).length} of ${planRows.length} topics detailed · ${Object.values(curSummary).reduce((n, x) => n + x.parts, 0)} parts` : "Loading…"}</span></div><p className="library-note">Each topic opens into what to know first, 12–20 parts with exactly what to learn and one public resource for each, measurable outcomes, the ways it fails in production, interview questions at senior-FDE level, and a proof-of-work artifact. Open a topic below, or expand a whole track.</p>{tracks.map((t) => { const rows = planRows.map((r, idx) => ({ r, idx })).filter(({ r }) => r[0] === t); const allOpen = rows.every(({ idx }) => curOpen.has(idx)); return <div className="cur-track" key={t}><div className="cur-track-head"><h3>{t}</h3><button className="text-button" onClick={() => setCurOpen((s) => { const n = new Set(s); rows.forEach(({ idx }) => allOpen ? n.delete(idx) : n.add(idx)); return n; })}>{allOpen ? "Collapse track" : "Expand track"}</button></div>{rows.map(({ r, idx }) => { const open = curOpen.has(idx); return <article className="cur-topic" key={idx}><button className="topic-toggle" aria-expanded={open} onClick={() => toggleCur(idx)}><strong>{String(r[2])}</strong><span>M{String(r[1])} · {String(r[13])}h{curSummary?.[String(idx)] ? ` · ${curSummary[String(idx)].parts} parts` : ""}</span><span className="chev" aria-hidden="true">{open ? "−" : "+"}</span></button>{open && renderSyllabus(idx)}</article>; })}</div>; })}</section>}
    {tab === "Mocks" && <section className="panel full-panel"><div className="panel-head"><div><p className="eyebrow">Interview proof</p><h2>Mocks & repetitions</h2></div><span className="panel-meta">{mockRows.length} practice loops</span></div><div className="mock-grid">{mockRows.map((r, i) => <div className="mock-row" key={i}><div className="mock-title"><strong>{String(r[0])}</strong><span>M{String(r[3])}</span></div><div className="mock-bar"><span style={{ width: `${pct(Number(r[6] || 0), Number(r[1] || 0))}%` }} /></div><div className="mock-stats"><b>{String(r[6] || 0)} / {String(r[1])}</b><span>{String(r[5])}</span></div></div>)}</div></section>}
    {tab === "Roadmaps" && <section className="panel full-panel"><div className="panel-head"><div><p className="eyebrow">External scaffolding</p><h2>Roadmaps & guides</h2></div></div><div className="resource-grid">{roadmapRows.map((r, i) => <a className="resource-card" href={String(r[1])} target="_blank" rel="noreferrer" key={i}><span className="resource-number">{String(i + 1).padStart(2, "0")}</span><div><h3>{String(r[0])}</h3><p>{String(r[2])}</p></div><span className="arrow">↗</span></a>)}</div></section>}
    {tab === "Library" && <section className="panel full-panel"><div className="panel-head"><div><p className="eyebrow">Private study context</p><h2>{library.length} books and {repositories.length} build references</h2></div><span className="panel-meta">{library.reduce((n, b) => n + b.pages, 0).toLocaleString()} pages indexed</span></div><p className="library-note">Lumen uses the book and repository maps to connect first principles, production systems, agent governance, and build evidence. Source PDFs stay private and repository context is summarized, not cloned.</p><div className="book-list">{library.map((book, i) => <article className="book-row" key={book.id}><div className="book-number">{String(i + 1).padStart(2, "0")}</div><div><h3>{book.title}</h3><p>{book.author} · {book.pages} pages · {book.role}</p><div className="topic-chips">{book.topics.map((topic) => <span key={topic}>{topic}</span>)}</div></div><button className="ask-row" onClick={() => { setAskOpen(true); setAskTopic(null); setAskText(`Build a practical study sequence connecting ${book.title} to my Senior FDE plan.`); }}>Quaere</button></article>)}</div><div className="repo-list">{repositories.map((repo) => <article className="repo-row" key={repo.id}><div><p className="eyebrow">Build reference</p><h3>{repo.name}</h3><p>{repo.summary}</p><div className="topic-chips">{repo.topics.map((topic) => <span key={topic}>{topic}</span>)}</div></div><a className="resource-link" href={repo.url} target="_blank" rel="noreferrer">Open repo ↗</a></article>)}</div></section>}
    {tab === "Comp reality" && <section className="panel full-panel"><div className="panel-head"><div><p className="eyebrow">Context, not promises</p><h2>Compensation reality</h2></div></div><div className="comp-list">{compRows.map((r, i) => <article className="comp-row" key={i}><div><span className="comp-market">{String(r[0])}</span><h3>{String(r[1])}</h3></div><p>{String(r[3])}</p><span className={`prob prob-${i}`}>{String(r[4])}</span></article>)}</div></section>}
    {!askOpen && <button className="ask-fab" onClick={() => { setAskTopic(null); setAskOpen(true); }} aria-label="Open Quaere"><AskMark size={16} /> Quaere</button>}
    {askOpen && <aside className="ask-panel" aria-label="Quaere"><div className="ask-head"><div className="ask-title"><AskMark size={20} className="ask-head-mark" /><div><p className="eyebrow">Lumen study guide</p><h2>Quaere</h2></div></div><button className="close-button" onClick={() => setAskOpen(false)}>×</button></div><p className="ask-intro">Latin for “seek”. Ask for a plain-English explanation, a session recap, or the next hands-on step. Quaere sees your whole plan and the indexed study library.</p><div className="context-status"><span className="sync-dot" /><span>Plan snapshot · {library.length} books · {repositories.length} repos</span></div><div className="suggestions"><button onClick={() => askLumen("Explain the current topic like I am preparing for a senior FDE interview.")}>Explain this</button><button onClick={() => askLumen("Turn the current topic into a 20-minute hands-on exercise.")}>Give me a lab</button><button onClick={() => askLumen("What should I be able to say or build after this session?")}>Check grasp</button></div><div className="messages">{messages.length === 0 && <div className="empty-chat"><AskMark size={22} className="empty-chat-mark" /><strong>Nothing asked yet</strong><span>Quaere reads your whole plan — all {planRows.length} topics across {tracks.length} tracks — plus the {library.length} indexed books. Not the open web.</span><ul className="faq-list">{FAQS.map((q) => <li key={q}><button onClick={() => askLumen(q)}>{q}</button></li>)}</ul></div>}{messages.map((m, i) => <div className={`message ${m.role}`} key={i}><span>{m.role === "user" ? "You" : "Lumen"}</span><p>{m.content}</p>{m.reportUrl && <a className="report-link" href={m.reportUrl} target="_blank" rel="noreferrer">Open saved report ↗</a>}</div>)}{asking && <div className="message assistant"><span>Lumen</span><p>Working through the plan context…</p></div>}</div><form className="ask-form" onSubmit={(e) => { e.preventDefault(); askLumen(); }}><input value={askText} onChange={(e) => setAskText(e.target.value)} placeholder="Ask about what you are learning…" /><button aria-label="Send question" disabled={asking || !askText.trim()}>→</button></form><div className="ask-foot">Study guide · private context</div></aside>}
    <footer><span>Built from Rasul&apos;s Senior FDE plan · {planRows.length} topics · {hours} active hours{curParts ? ` · ${curParts.toLocaleString()} syllabus parts` : ""}</span><span>{TABS.length} views · dashboard and MCP read the same plan</span></footer>
  </main>;
}
