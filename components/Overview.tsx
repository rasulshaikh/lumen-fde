import type { Evidence, Streak } from "@/lib/motivation";
import { Link, mockRows, pct, planRows, tracks, type Row } from "./shared";
import { ShippedWall, type ArtifactsFeed } from "./ShippedWall";
import { BriefPanel } from "./Brief";
import type { Brief } from "@/lib/companion/brief";

/**
 * The homepage.
 *
 * This is where he lands every morning for 23 months, and on the morning it was designed the
 * honest reading was 0% of the plan, 0% readiness and nothing shipped. So it cannot be built on
 * achievement — there is none yet — and it may not compensate by flattering, because the whole
 * product's claim is that its numbers are worth trusting. What it does instead is answer four
 * questions in one screen, in the order they are worth asking:
 *
 *   1. EVIDENCE  — what the last finished row bought, priced by the market, and immediately
 *      beside it the next row and what it clears. Principle 2: the next action sits next to its
 *      evidence, so the marginal table's top row lives here rather than one navigation away.
 *   2. STANDING  — the study rhythm, as a rate and a longest run. Nothing here may read as a
 *      loss or a zero: a 40-day streak shown as broken in month 20 is a plausible reason to
 *      quit, and that is the outcome this whole layer exists to prevent.
 *   3. THE WALL  — shipped deliverables, empty today, teaching rather than apologising.
 *   4. WHAT IS TRUE TODAY — pace, hours, the calendar. The never-flatters half, unchanged.
 *
 * Every sentence in 1 and 2 is rendered by lib/motivation.ts or lib/market/*, never here. Four
 * consumers read those modules — this page, the weekly email, /api/ask and the MCP tools — and a
 * sentence assembled four times is a sentence that says four different things. What this file
 * composes is layout: a figure, a label, a rule, an order.
 */

/** Signed points, so a readiness move reads as a move rather than as a level. */
const signed = (n: number) => `${n > 0 ? "+" : ""}${n}`;

export type HomeFeed = {
  loading: boolean;
  /** A rate and a maximum. There is no current-streak field to render, by design. */
  streak: Streak | null;
  /**
   * What the top-ranked remaining row buys, priced by `computeEvidence`.
   *
   * The row is deliberately one that is NOT done, which is exactly the precondition
   * `computeEvidence` documents: the insight it is handed must be the one computed before the
   * row moved, and for an unfinished row the current insight is that insight. A finished row
   * cannot be priced this way after the fact — its marginal entry no longer exists — so the
   * "last finished" block below reads the coverage sentences instead and invents nothing.
   */
  next: Evidence | null;
  /** The named skill's coverage sentence, rendered by benchmark.ts. Lead line only. */
  nextShare: string | null;
  readiness: { pct: number; deltaPoints: number; evidenced: number; skillCount: number } | null;
  marketSynced: boolean;
  marketError: string | null;
  /** The newest progress event that marks a plan row done, with what that row covers. */
  last: { row: number; topic: string; day: string; shares: string[] } | null;
  artifacts: ArtifactsFeed;
};

function Metric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: string }) { return <div className={`metric ${tone}`}><span className="metric-label">{label}</span><strong>{value}</strong><span className="metric-detail">{detail}</span></div>; }

/**
 * Evidence: what the work bought, and what the next of it buys.
 *
 * Two blocks under one heading rather than two panels, because they are one argument — the
 * second is the first run forward. The market feed can be absent in four distinguishable ways
 * and each says so in its own words; "no data" would let a missing token and a cold start read
 * identically, and only one of those is worth waiting for.
 */
function EvidencePanel({ feed, openMarket }: { feed: HomeFeed; openMarket: () => void }) {
  const { loading, next, nextShare, readiness, marketSynced, marketError, last } = feed;

  const market = loading
    ? <p className="home-sub">Reading the market scan…</p>
    : !marketSynced
      ? <p className="home-sub">{marketError
          ? `The market feed did not answer: ${marketError}. What the next row clears is unknown rather than nothing.`
          : "Market sync is not configured, so no row can be priced from here. This is unknown, not zero."}</p>
      : !next
        ? <p className="home-sub">No market scan has completed a cycle yet. The first one prices every remaining row and ranks them by the share of core requisitions each clears.</p>
        : <>
            <p className="home-line">Row {next.row} · {next.topic}</p>
            <div className="home-stats">
              <span className="home-stat"><b>{next.fromPct}% → {next.toPct}%</b>readiness once evidenced</span>
              {next.gainPoints > 0 && <span className="home-stat"><b>{signed(next.gainPoints)}</b>points of the market</span>}
              <span className="home-stat"><b>{next.hours}h</b>month {next.month}</span>
            </div>
            {nextShare && <p className="home-sub">{nextShare}</p>}
          </>;

  return <div className="panel wide home-panel">
    <div className="panel-head">
      <div><p className="eyebrow">Evidence</p><h2>What the work buys</h2></div>
      <span className="panel-meta">{readiness
        ? `Readiness ${readiness.pct}% · ${readiness.evidenced} of ${readiness.skillCount} skills`
        : "Readiness pending"}</span>
    </div>

    <div className="home-block">
      <p className="eyebrow">Last row finished</p>
      {last
        ? <>
            <p className="home-line">Row {last.row} · {last.topic}{last.day ? ` · ${last.day}` : ""}</p>
            {last.shares.length
              ? last.shares.map((line) => <p className="home-sub" key={line}>{line}</p>)
              : <p className="home-sub">No skill the market asks for names this row as its primary row, so it cleared no market share. It may still be a support row for a skill evidenced elsewhere.</p>}
            {readiness && <p className="home-sub">Readiness stands at {readiness.pct}% of the market you can evidence today{readiness.deltaPoints !== 0 ? `, ${signed(readiness.deltaPoints)} points in the last seven days` : ""}.</p>}
          </>
        : <>
            <p className="home-line">Nothing is recorded as finished yet.</p>
            <p className="home-sub">The first row you finish is priced here the way the market prices it: the skill it clears and that skill&apos;s share of core FDE requisitions, with both denominators. Not a compliment — a number you can quote.</p>
          </>}
    </div>

    <div className="home-block">
      <p className="eyebrow">Next row, and what it clears</p>
      {market}
    </div>

    <button className="text-button" onClick={openMarket}>Rank every remaining row →</button>
  </div>;
}

/**
 * Standing: the rhythm, in the one shape that cannot report a forfeit.
 *
 * The rate is the headline while it is above zero, because pace is the thing worth knowing. The
 * moment the window is empty the headline becomes the longest run — a maximum over an
 * append-only history, which can only ever rise — and the elapsed days are still stated, once,
 * as a fact. What is never drawn is a 0 in the figure slot. The gap is disclosed; it is not
 * scored.
 */
function StandingPanel({ streak, loading, openPlan }: { streak: Streak | null; loading: boolean; openPlan: () => void }) {
  const rate = streak !== null && streak.activeDays > 0;
  const started = streak !== null && streak.totalActiveDays > 0;

  return <div className="panel home-panel">
    <div className="panel-head">
      <div><p className="eyebrow">Standing</p><h2>Study rhythm</h2></div>
      {started && <span className="panel-meta">{streak!.windowDays}-day window</span>}
    </div>

    {loading
      ? <p className="home-sub">Reading the progress history…</p>
      : streak === null
        ? <p className="home-sub">The progress history could not be read, so the rhythm is unknown rather than empty.</p>
        : !started
          ? <>
              <p className="home-line">No dated progress event yet.</p>
              <p className="home-sub">Rhythm here is two numbers and neither can be lost: how many of the last {streak.windowDays} days carried work, and the longest unbroken run ever recorded. There is no chain to break — a gap moves the rate and leaves the run standing.</p>
              <button className="primary-button" onClick={openPlan}>Mark a row in progress <span>→</span></button>
            </>
          : <>
              <div className="home-figure">
                <strong>{rate ? `${streak.activeDays}/${streak.windowDays}` : `${streak.longestRunDays}`}</strong>
                <span>{rate ? "days carried work" : "days, longest run"}</span>
              </div>
              <p className="home-line">{rate ? streak.rateStatement : streak.runStatement}</p>
              {rate && <p className="home-sub">{streak.runStatement}</p>}
              <p className="home-sub">{streak.recencyStatement}</p>
              <p className="home-note">{streak.totalActiveDays} day{streak.totalActiveDays === 1 ? "" : "s"} of recorded work in total. The run is a maximum over the whole history, so it never falls.</p>
            </>}
  </div>;
}

export function Overview({ done, activeRows, skipped, hours, doneHours, skippedHours, weeklyHours, setWeekly, monthHours, maxMonthHours, peakMonth, nextRow, nextIndex, setView, trackTotals, setTrack, marketTiers, feed, brief, readingUrl }: {
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
  feed: HomeFeed;
  /**
   * Null until the first client effect has run. The brief is a function of `new Date()` and the
   * fetched feed, and neither exists during the server render — so the panel is simply absent for
   * that first paint rather than rendered with a guessed day, which is the hydration mismatch
   * this page already avoids for the streak's sentences.
   */
  brief: Brief | null;
  /** The focus row's Read link, passed through so the brief does not reach into the workbook. */
  readingUrl: string | null;
}) {
  return <>
      {/* 1 + 2. Evidence, and the next action beside it. The old "Start here" panel moves up
          from under the pace map to sit here: it is the row he actually opens this morning,
          and the panel to its left is why that row is worth opening. */}
      <section className="content-grid">
        {/* Start here leads, and takes the wide column.
            This page is opened every morning for roughly two years, so the first thing on it
            should be what to do today rather than what has not happened yet. At month 1 three of
            the first four panels are honest zeros, and the widest of them — the slot the eye
            lands on — was one of those. Evidence keeps everything it says, one column over.

            The description is no longer cut at 118 characters. That cap existed only because this
            was the narrow panel: 38 of the 119 rows are longer than it, up to 662 characters, so
            a third of the plan showed its instruction with the end sliced off, in the panel whose
            whole job is saying what the work actually is. */}
        {/* The brief supersedes the old "Start here" panel rather than sitting next to it. It
            carries everything that panel did — the row, its description, both actions — and adds
            what the reader actually needs first: how long it has been, what the topic is made of,
            whether recall is waiting, and what finishing it buys. Two panels saying the same
            thing differently is how a page stops being read.

            Until the first effect runs there is no brief, and the old panel renders in its place
            so the page is never headless. */}
        {brief
          ? <BriefPanel brief={brief} readingUrl={readingUrl} onOpenPlan={() => setView("Plan")} />
          : <div className="panel wide"><div className="panel-head"><div><p className="eyebrow">Next action</p><h2>Start here</h2></div><span className="priority">P1</span></div><div className="next-action"><div className="action-index">{nextRow ? String(nextIndex + 1).padStart(2, "0") : "—"}</div><div><h3>{nextRow ? String(nextRow[2]) : "Plan complete"}</h3><p>{nextRow ? String(nextRow[3]) : "Every topic is done or skipped."}</p>{nextRow && <Link href={String(nextRow[5])}>Open reading</Link>}</div></div><button className="primary-button" onClick={() => setView("Plan")}>Open the plan <span>→</span></button></div>}
        <EvidencePanel feed={feed} openMarket={() => setView("Market")} />
      </section>

      {/* 3. The wall, with the rhythm beside it: the two records of accumulation, one of what
          was built and one of how often the building happens. */}
      <section className="content-grid">
        <ShippedWall feed={feed.artifacts} planCount={planRows.length} nextRow={nextRow} nextIndex={nextIndex} openPlan={() => setView("Plan")} />
        <StandingPanel streak={feed.streak} loading={feed.loading} openPlan={() => setView("Plan")} />
      </section>

      {/* 4. What is true today. Unchanged, and it stays above the fold of the lower half: the
          honest reading of a 1,588-hour plan is the half of this page that never flatters. */}
      <section className="metric-grid"><Metric label="Plan progress" value={`${pct(done, activeRows.length)}%`} detail={`${done} of ${activeRows.length} active${skipped ? ` · ${skipped} of ${planRows.length} skipped` : ""}`} tone="rose" /><Metric label="Hours remaining" value={`${Math.max(hours - doneHours, 0)}`} detail={`of ${hours} active hours${skippedHours ? ` · ${skippedHours}h skipped` : ""}`} tone="teal" /><div className="metric brass"><span className="metric-label">Weekly commitment</span><strong><input className="weekly-input" type="number" min={1} max={80} value={weeklyHours} aria-label="Hours you study each week" onChange={(e) => setWeekly(Number(e.target.value))} />h</strong><span className="metric-detail">{(hours / weeklyHours).toFixed(1)} weeks · {(hours / weeklyHours / 4.333).toFixed(1)} months</span></div><Metric label="Mocks" value={`${mockRows.reduce((n, r) => n + Number(r[6] || 0), 0)} / ${mockRows.reduce((n, r) => n + Number(r[1] || 0), 0)}`} detail="completed / target" tone="ink" /></section>
      <section className="content-grid"><div className="panel wide"><div className="panel-head"><div><p className="eyebrow">Pace map</p><h2>Where the hours go</h2></div><span className="panel-meta">{hours}h · {tracks.length} tracks</span></div><div className="bar-chart">{monthHours.map((item) => <div className="bar-item" key={item.month}><div className="bar-value">{item.hours}h</div><div className="bar-track"><div className="bar-fill" style={{ height: `${Math.max(12, item.hours / maxMonthHours * 100)}%` }} /></div><div className="bar-label">M{item.month}</div></div>)}</div><div className="chart-foot"><span><i className="legend-dot rose" /> planned hours</span><span>Peak: Month {peakMonth.month} · {peakMonth.hours}h</span></div></div><div className="panel reality"><p className="eyebrow">Reality check</p><h2>Target calibration</h2><p>“$250K” is a 2–3 year target from Pune, not something this plan promises on its own. The nearer proof point is a strong global-remote India role.</p><ul className="market-list">{marketTiers.map((m) => <li key={m.market}><span className={`market-tier ${m.tone}`}>{m.label}</span><span className="market-name">{m.market}</span><span className="market-window">{m.window}</span></li>)}</ul><button className="text-button" onClick={() => setView("Comp reality")}>Read the assumptions →</button></div></section>
      {/* Reality check moved up beside the pace map, so this row carries one panel and must
          not keep the two-column template — a .65fr of empty canvas beside it. */}
      <section className="content-grid single"><div className="panel wide"><div className="panel-head"><div><p className="eyebrow">By track</p><h2>Coverage at a glance</h2></div><button className="text-button" onClick={() => setView("Plan")}>View all →</button></div><div className="track-list">{trackTotals.map(({ name, count, hours: h, done: trackDone }) => <button className="track-row" key={name} onClick={() => { setTrack(name); setView("Plan"); }}><span className="track-name">{name}</span><span className="track-count">{count} topics</span><span className="track-progress"><span style={{ width: `${pct(trackDone, count)}%` }} /></span><span className="track-hours">{h}h</span></button>)}</div></div></section>
    </>;
}
