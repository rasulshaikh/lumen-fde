/**
 * The benchmark computation: a stored requisition index plus the hand-authored skill map
 * plus the plan workbook, in — rendered statement strings out.
 *
 * Pure. No network, no filesystem, no `Date.now()`. `now` is a parameter, which is the whole
 * reason this file exists separately from the cron route: a market benchmark that can only be
 * exercised by running a 47 MB scan against 27 live job boards is a benchmark nobody ever
 * checks the arithmetic of. Everything here is a function of its arguments, so the fixtures in
 * benchmark.test.mts pin the guards that would otherwise silently inflate a percentage.
 *
 * The one rule that shapes every number below: the headline denominator is CORE only. If
 * ADJACENT entered it, "the market" would be measured by 169 Databricks Solutions Architects
 * and 39 Datadog Sales Engineers, and the answer would be about pre-sales, not FDE. ADJACENT
 * is counted and rendered separately — it is real signal about where the roles are — but it
 * never sets a headline.
 */
import { dedupeKey } from "./classify";
// Type-only: store.ts talks to GitHub, and importing it for values would put a network module
// in this file's import graph, which is exactly the coupling the purity above is protecting.
import type { MarketIndex, ReqRecord, TrendPoint } from "./store";

/**
 * The enabled board count in data/market-sources.json (32 configured, 27 enabled). It is a
 * constant here rather than a fourth argument because the only thing it feeds is the
 * "N of 27 boards" wording; the counting never depends on it. If the enabled set changes,
 * this changes with it — the test asserts the two agree.
 */
export const BOARD_COUNT = 27;

/**
 * Below this many successful boards, every delta is suppressed.
 *
 * Three or more dead boards is enough to move a percentage by more points than a real week of
 * hiring does, and a delta computed against a smaller corpus is not a smaller delta — it is a
 * wrong one. Suppressing is the honest failure: the reader sees "partial scan" instead of a
 * confident-looking movement line built on two thirds of the market.
 */
export const DELTA_MIN_BOARDS = 24;

/** A skill must move at least this many points, or cross a band, to be reported as movement. */
export const MOVE_MIN_POINTS = 3;
const BANDS = [25, 50, 75];

export type PlanRow = (string | number | null)[];
export type Workbook = { Plan: PlanRow[] };

/**
 * One declaration of market-skill-map.json's shape, owned by skills.ts.
 *
 * This module used to declare its own, and the two were mutually unassignable: skills.ts
 * required `exclude` and `minDistinctForms`, this one made both optional. Nothing caught it,
 * because no single caller passed one parsed map to both modules -- until the cron route did
 * exactly that, and it failed with "Type 'string[] | undefined' is not assignable". The map is
 * one file on disk, so it gets one type. Type-only, so no runtime coupling is added.
 *
 * skills.ts is the authority because it is the stricter and truer reading: `proximity` is
 * nullable there because `python` is genuinely the one skill in the map without a block.
 */
export type { SkillDef, SkillMap } from "./skills.ts";
export type { SkillGap as GapDef, OverInvestedTrack as OverInvestedDef } from "./skills.ts";
import type { SkillDef, SkillMap } from "./skills.ts";

/** A plan row resolved against the workbook, so the tab can link it and overlay live status. */
export type PlanRowRef = { row: number; track: string; topic: string; month: number; hours: number; status: string };

export type CoverageEntry = {
  id: string;
  label: string;
  pct: number;
  /** The denominator pair, always carried structurally as well as rendered. */
  hits: number;
  reqs: number;
  companies: number;
  totalCompanies: number;
  primaryRow: number | null;
  /** Primary row first, then support rows, in map order. */
  rows: PlanRowRef[];
  evidence: string;
  statement: string;
};

export type GapEntry = {
  id: string;
  label: string;
  nearestRow: number | null;
  rows: PlanRowRef[];
  statedFrequency: string;
  whyNotCovered: string;
  statement: string;
};

export type OverInvestedEntry = {
  rowRange: string;
  track: string;
  rowCount: number;
  hours: number;
  monthFrom: number;
  monthTo: number;
  sharePct: number;
  measuredJdFrequency: string;
  note: string;
  statement: string;
};

export type NewReqEntry = { id: string; company: string; title: string; location: string; url: string; statement: string };

export type MovementEntry = { id: string; label: string; from: number; to: number; delta: number; crossed: number | null; statement: string };

export type Movement = { suppressed: boolean; changes: MovementEntry[]; statement: string };

export type Benchmark = {
  computedAt: string;
  day: string;
  boardsOk: number;
  boardsTotal: number;
  /** True on the cold-start run: every req is "new", so no new-roles list may be emitted. */
  baseline: boolean;
  baselineStatement: string | null;
  /** The CORE denominator, after dedupe and after dropping null-skill reqs. */
  coreCount: number;
  companyCount: number;
  coreStatement: string;
  adjacentCount: number;
  adjacentCompanyCount: number;
  leadershipCount: number;
  adjacentStatement: string;
  /** Fractions, not points — the shape trend.json stores, so the caller can append directly. */
  skillShares: Record<string, number>;
  coverage: CoverageEntry[];
  gaps: GapEntry[];
  overInvested: OverInvestedEntry[];
  overInvestedTotal: { tracks: number; rowCount: number; hours: number; activeHours: number; pct: number; statement: string };
  newSinceLastRun: NewReqEntry[];
  movement: Movement;
};

const iso = (now: Date) => now.toISOString().slice(0, 10);
const pct = (hits: number, total: number) => (total > 0 ? Math.round((hits / total) * 100) : 0);
/** 18 stays "18h", 121.5 stays "121.5h" — never "18.0h", which reads like false precision. */
const hrs = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)}h`;

/**
 * The denominator, always as a pair.
 *
 * A skill at 100% of one company's 26 cloned reqs and a skill at 40% across 12 companies are
 * different findings, and a bare percentage renders them identically. Every count in this file
 * goes through here so that can never happen by omission.
 */
const pair = (hits: number, reqs: number, companies: number, totalCompanies: number) =>
  `${hits} of ${reqs} reqs, across ${companies} of ${totalCompanies} companies`;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const statusOf = (row: PlanRow) => String(row[15] ?? "").trim().toLowerCase();

/**
 * Resolve a plan row number against the workbook.
 *
 * `workbook.Plan[N]` is plan row N with the header at index 0 — verified against
 * data/curriculum/50.json, which carries `"i": 50` for the topic at plan row 51. Getting this
 * off by one would cite the wrong topic in every sentence the benchmark renders.
 *
 * Status comes from col 15, the committed baseline. The Market tab merges the client's
 * `lumen-statuses` from localStorage on top of `rows[]`, which is why the structured ref is
 * carried alongside the rendered string rather than only baked into it.
 */
function planRow(workbook: Workbook, row: number | null): PlanRowRef | null {
  if (row === null || !Number.isInteger(row) || row < 1 || row >= workbook.Plan.length) return null;
  const r = workbook.Plan[row];
  if (!r) return null;
  return {
    row,
    track: String(r[0] ?? ""),
    topic: String(r[2] ?? ""),
    month: Number(r[1] || 0),
    hours: Number(r[13] || 0),
    status: statusOf(r) || "not started",
  };
}

const citeRow = (ref: PlanRowRef) => `row ${ref.row}, "${ref.topic}" - ${hrs(ref.hours)}, month ${ref.month}`;

/**
 * The live corpus: one entry per distinct requisition, ready to count.
 *
 * Three exclusions, each of which corrupts a percentage if skipped:
 *
 *  - `skills === null` is a failed Greenhouse per-job fetch. It is retried next run. Dropping
 *    it understates a count by one; keeping it would put a req with an empty fingerprint into
 *    every denominator and silently deflate every skill.
 *  - `missingSince !== null` is a req that has closed but is still inside its 14-day decay
 *    window before deletion. Counting it keeps closed roles in "the market" for a fortnight.
 *  - duplicates by `dedupeKey`. LangChain ships 15 `Deployed Engineer (City)` clones and
 *    Samsara 6 region-cloned SEs; without this, those two boards set every percentage.
 *
 * The key is recomputed from company+title rather than read from the stored `key`, so a fix to
 * the location vocabulary in classify.ts takes effect on the next recompute with no re-scan —
 * which is the property that storing only a skill fingerprint bought in the first place.
 *
 * The representative of a clone group is chosen deterministically (oldest `firstSeen`, then id)
 * because it supplies the fingerprint that gets counted. A non-deterministic choice would make
 * week-over-week movement uninterpretable: a percentage could move because the clone ordering
 * changed, not because the market did.
 */
function distinct(index: MarketIndex, want: ReqRecord["class"]): ReqRecord[] {
  const ids = Object.keys(index.reqs).sort();
  const byKey = new Map<string, ReqRecord>();
  for (const id of ids) {
    const req = index.reqs[id];
    if (!req || req.class !== want) continue;
    if (req.skills === null || req.missingSince !== null) continue;
    const key = dedupeKey(req.company, req.title);
    const held = byKey.get(key);
    if (!held || req.firstSeen < held.firstSeen) byKey.set(key, req);
  }
  return [...byKey.values()];
}

const companiesOf = (reqs: ReqRecord[]) => new Set(reqs.map((r) => r.company)).size;

/**
 * Compute the whole benchmark.
 *
 * `now` is explicit so "new since last run" and `computedAt` are testable; `previous` is the
 * last trend point and is optional, because on the first run there is nothing to move against.
 */
export function computeBenchmark(
  index: MarketIndex,
  skillMap: SkillMap,
  workbook: Workbook,
  now: Date,
  previous?: TrendPoint | null,
): Benchmark {
  const day = iso(now);
  const boardsTotal = Math.max(BOARD_COUNT, Object.keys(index.boards).length);
  const deltasSuppressed = index.boardsOk < DELTA_MIN_BOARDS;

  const core = distinct(index, "core");
  const adjacent = distinct(index, "adjacent");
  const leadership = distinct(index, "leadership");
  const coreCount = core.length;
  const companyCount = companiesOf(core);

  // Cold start. store.ts treats an empty `reqs` as the baseline signal, but by the time the
  // benchmark runs the index is already full, so the condition is re-derived from the data:
  // if every core req was first seen today, this is day one and there is no "new" to report.
  // Without this the first digest announces 400 new roles and trains you to ignore the section.
  const baseline = coreCount > 0 && core.every((r) => r.firstSeen === day);

  const skillShares: Record<string, number> = {};
  const coverage: CoverageEntry[] = [];
  for (const skill of skillMap.skills) {
    const hitReqs = core.filter((r) => r.skills !== null && r.skills.includes(skill.id));
    const hits = hitReqs.length;
    const companies = companiesOf(hitReqs);
    const p = pct(hits, coreCount);
    skillShares[skill.id] = coreCount > 0 ? hits / coreCount : 0;

    const primary = planRow(workbook, skill.primaryRow);
    const supports = (skill.supportRows ?? []).map((n) => planRow(workbook, n)).filter((x): x is PlanRowRef => x !== null);
    const covered = primary
      ? `Covered: ${citeRow(primary)}. Status: ${primary.status}.${supports.length ? ` Supporting rows ${supports.map((s) => s.row).join(", ")}.` : ""}`
      : "No plan row is mapped to this skill.";

    coverage.push({
      id: skill.id,
      label: skill.label,
      pct: p,
      hits,
      reqs: coreCount,
      companies,
      totalCompanies: companyCount,
      primaryRow: skill.primaryRow,
      rows: primary ? [primary, ...supports] : supports,
      evidence: skill.evidence,
      statement: `${skill.label} - ${p}% of core FDE requisitions: ${pair(hits, coreCount, companies, companyCount)}.\n${covered}`,
    });
  }
  // Descending by percentage, then by absolute hits, then by id — a total order, so two runs
  // over the same index always render the block in the same sequence.
  coverage.sort((a, b) => b.pct - a.pct || b.hits - a.hits || (a.id < b.id ? -1 : 1));

  /**
   * Gaps are reported, never discovered.
   *
   * Every entry carries `statedFrequency` verbatim from the taxonomy a human audited against
   * all 2,236 subtopics. There is no live count here on purpose: a gap is the claim that no
   * plan row covers a thing, and that claim cannot be derived from a keyword match. File order
   * is preserved because the file is ordered by audited importance.
   */
  const gaps: GapEntry[] = skillMap.gaps.map((gap) => {
    const nearest = planRow(workbook, gap.nearestRow);
    const nearestText = nearest ? `Nearest: ${citeRow(nearest)}.` : "No nearest row identified.";
    return {
      id: gap.id,
      label: gap.label,
      nearestRow: gap.nearestRow,
      rows: nearest ? [nearest] : [],
      statedFrequency: gap.statedFrequency,
      whyNotCovered: gap.whyNotCovered,
      statement: `GAP - ${gap.label}. ${gap.statedFrequency}.\nNo plan row covers this. ${nearestText} ${gap.whyNotCovered} 0h scheduled.`,
    };
  });

  /**
   * Over-investment: scheduled hours against measured JD frequency.
   *
   * "Active" excludes `skipped` rows, matching the daily digest's definition — hours you have
   * already struck off the plan are not hours you are over-investing. On the current workbook
   * that gives 117 active rows and 1,588 active hours, and tracks M+N+O sum to 335h, 21%.
   */
  const activeHours = workbook.Plan.slice(1)
    .filter((r) => statusOf(r) !== "skipped")
    .reduce((n, r) => n + Number(r[13] || 0), 0);

  const overInvested: OverInvestedEntry[] = [];
  for (const track of skillMap.overInvested) {
    const [from, to] = track.rowRange.split("-").map((n) => Number(n.trim()));
    if (!Number.isInteger(from) || !Number.isInteger(to)) continue;
    const refs: PlanRowRef[] = [];
    for (let n = from; n <= to; n++) {
      const ref = planRow(workbook, n);
      if (ref && ref.status !== "skipped") refs.push(ref);
    }
    if (!refs.length) continue;
    const hours = refs.reduce((n, r) => n + r.hours, 0);
    const months = refs.map((r) => r.month);
    const monthFrom = Math.min(...months);
    const monthTo = Math.max(...months);
    const sharePct = pct(hours, activeHours);
    overInvested.push({
      rowRange: track.rowRange,
      track: refs[0].track,
      rowCount: refs.length,
      hours,
      monthFrom,
      monthTo,
      sharePct,
      measuredJdFrequency: track.measuredJdFrequency,
      note: track.note,
      statement:
        `OVER-INVESTED - ${refs[0].track}: rows ${track.rowRange}, ${refs.length} rows, ${hrs(hours)}, months ${monthFrom}-${monthTo}` +
        ` - ${sharePct}% of your ${activeHours} active hours.\nSurface-language match in the current corpus: ${track.measuredJdFrequency}\n${track.note}`,
    });
  }
  const oiHours = overInvested.reduce((n, t) => n + t.hours, 0);
  const oiRows = overInvested.reduce((n, t) => n + t.rowCount, 0);
  const overInvestedTotal = {
    tracks: overInvested.length,
    rowCount: oiRows,
    hours: oiHours,
    activeHours,
    pct: pct(oiHours, activeHours),
    statement: `Combined: ${hrs(oiHours)} across ${overInvested.length} tracks and ${oiRows} rows - ${pct(oiHours, activeHours)}% of your ${activeHours} active hours, against the measured JD frequencies above.`,
  };

  /**
   * New core reqs.
   *
   * Deduped like everything else, so 15 city clones posted at once are one new role rather
   * than three digest lines about the same job. Unlike the denominators this does NOT drop
   * `skills === null`: a req whose JD fetch failed still appeared on the board today, and that
   * is a fact about the market, not a percentage that a missing fingerprint could corrupt.
   *
   * Suppressed on a baseline run and on a partial scan, for the same reason the deltas are —
   * on an incomplete corpus "new" is indistinguishable from "not fetched yet".
   */
  let newSinceLastRun: NewReqEntry[] = [];
  if (!baseline && !deltasSuppressed) {
    const seen = new Set<string>();
    newSinceLastRun = Object.keys(index.reqs)
      .sort()
      .map((id) => ({ id, req: index.reqs[id] }))
      .filter(({ req }) => req && req.class === "core" && req.firstSeen === day && req.missingSince === null)
      .filter(({ req }) => {
        const key = dedupeKey(req.company, req.title);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map(({ id, req }) => ({
        id,
        company: req.company,
        title: req.title,
        location: req.location,
        url: req.url,
        statement: [req.company, req.title, req.location].filter(Boolean).join(", "),
      }));
  }

  /**
   * Movement, week over week.
   *
   * Compared in whole points against the rounded previous share, not in raw fractions: the
   * rendered sentence says "28% to 33%", and a delta computed on unrounded values can print
   * "+3" beside two numbers four apart. A skill absent from the previous point is skipped
   * rather than treated as having been at 0% — a newly added skill is not a market movement.
   */
  const movement = ((): Movement => {
    if (deltasSuppressed) {
      return { suppressed: true, changes: [], statement: `partial scan, ${index.boardsOk} of ${boardsTotal} boards, deltas suppressed` };
    }
    if (!previous) return { suppressed: false, changes: [], statement: "" };

    const changes: MovementEntry[] = [];
    let maxOther = 0;
    for (const entry of coverage) {
      const before = previous.s[entry.id];
      if (typeof before !== "number") continue;
      const fromPct = Math.round(before * 100);
      const delta = entry.pct - fromPct;
      const crossed = BANDS.find((b) => (fromPct < b && entry.pct >= b) || (fromPct >= b && entry.pct < b)) ?? null;
      if (Math.abs(delta) >= MOVE_MIN_POINTS || crossed !== null) {
        changes.push({
          id: entry.id,
          label: entry.label,
          from: fromPct,
          to: entry.pct,
          delta,
          crossed,
          statement: `${entry.label} ${fromPct}% to ${entry.pct}% (${delta > 0 ? "+" : ""}${delta})`,
        });
      } else {
        maxOther = Math.max(maxOther, Math.abs(delta));
      }
    }
    if (!changes.length) return { suppressed: false, changes: [], statement: "" };
    changes.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || (a.id < b.id ? -1 : 1));
    const tail = maxOther > 0 ? ` No other skill moved more than ${maxOther} point${maxOther === 1 ? "" : "s"}.` : " No other skill moved.";
    return { suppressed: false, changes, statement: `MOVED THIS WEEK - ${changes.map((c) => c.statement).join(". ")}.${tail}` };
  })();

  return {
    computedAt: now.toISOString(),
    day,
    boardsOk: index.boardsOk,
    boardsTotal,
    baseline,
    baselineStatement: baseline ? `Market baseline established, ${coreCount} core requisitions across ${companyCount} companies.` : null,
    coreCount,
    companyCount,
    coreStatement: `Core FDE market: ${plural(coreCount, "distinct requisition", "distinct requisitions")} across ${plural(companyCount, "company", "companies")}, from ${index.boardsOk} of ${boardsTotal} boards.`,
    adjacentCount: adjacent.length,
    adjacentCompanyCount: companiesOf(adjacent),
    leadershipCount: leadership.length,
    // Reported, never added to the denominator above. classify.ts splits leadership out of the
    // spec's ADJACENT bucket, so both are printed rather than silently merged or dropped.
    adjacentStatement: `Adjacent (pre-sales SE/SA, implementation, engagement): ${plural(adjacent.length, "distinct requisition", "distinct requisitions")} across ${plural(companiesOf(adjacent), "company", "companies")}, plus ${leadership.length} leadership. Counted separately and excluded from every percentage above.`,
    skillShares,
    coverage,
    gaps,
    overInvested,
    overInvestedTotal,
    newSinceLastRun,
    movement,
  };
}
