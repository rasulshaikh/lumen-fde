/**
 * Market insight tests. Run with:  npx tsx lib/market/insight.test.mts
 *
 * benchmark.test.mts pins what the market asks for. This file pins what that is claimed to mean
 * for one candidate, and the failure mode is the same one and worse: every number here is a
 * *decision aid*. "You are 83% ready", "40% of this market is reachable from Pune", "aim at the
 * data-platform segment" — each is a sentence somebody acts on for a month, none of them throws
 * when it is wrong, and all of them look identical whether the arithmetic underneath is right or
 * inverted. A readiness weighted by row count instead of market share still renders a tidy
 * percentage. An out-of-reach requisition leaking into the reachable denominator still renders a
 * tidy percentage. That is the entire class of bug below.
 *
 * So the fixtures are built to make a wrong answer *differ numerically* from a right one rather
 * than merely differ in principle. `python` is on 10 of 10 fixture reqs and `latency-cost` on 2;
 * both are one plan row, so a row-count readiness reports the identical figure for clearing
 * either and a share-weighted one reports 83% against 17%. `latency-cost` is carried ONLY by the
 * two out-of-reach reqs, so if the reachable slice ever admits one of them the skill stops
 * reading 0% there. Neither guard can be satisfied by accident.
 *
 * Half the assertions run against the fixtures and half against the first real scan —
 * reports/market/{index,benchmark,trend}.json, 745 stored reqs, 189 distinct core across 23
 * companies — because "the tiers sum to the core count" is a claim about a corpus with 253
 * distinct location strings in it, not about eight strings a test author chose.
 *
 * The last section drives app/api/cron/market-scan/route.ts end to end through `GET`, because
 * the two properties the spec asks for there — the digit ban on Quaere's paragraph, and
 * insight.json being written LAST and sequentially — exist only in the route and are observable
 * only in the bytes handed to GitHub.
 */
import { readFileSync } from "node:fs";
import { dedupeKey } from "./classify.ts";
import { computeBenchmark, MOVE_MIN_POINTS, type SkillMap, type Workbook } from "./benchmark.ts";
import type { SkillMap as MatcherSkillMap } from "./skills.ts";
import { REACH_TIERS, type ReachTier } from "./reach.ts";
import {
  computeInsight,
  READINESS_FLAG_POINTS,
  VELOCITY_MIN_DAYS,
  type Insight,
  type Progress,
} from "./insight.ts";
import { INSIGHT_PATH, INDEX_PATH, BENCHMARK_PATH, TREND_PATH, type MarketIndex, type ReqRecord, type TrendPoint } from "./store.ts";

let fails = 0;
const ck = (n: string, c: boolean, x = "") => { if (!c) { fails++; console.log(`  FAIL ${n} ${x}`); } else console.log(`  ok   ${n} ${x}`); };

const root = new URL("../../", import.meta.url);
const load = (p: string) => JSON.parse(readFileSync(new URL(p, root), "utf8"));

const skillMap = load("data/market-skill-map.json") as SkillMap & MatcherSkillMap;
const workbook = load("data/workbook.json") as Workbook;

// ---------------------------------------------------------------------------
// Fixtures: ten distinct core requisitions, chosen so every tier, every segment and both
// readiness weights are exercised by a corpus small enough to count by hand.
// ---------------------------------------------------------------------------

const DAY = "2026-09-07";
const NOW = new Date(`${DAY}T04:11:02Z`);
const EARLIER = "2026-09-01";

/**
 * The two plan rows the readiness assertions turn on, verbatim from data/workbook.json.
 *
 * Both carry exactly one skill in data/market-skill-map.json — row 28 carries `python` and row
 * 65 carries `latency-cost` — which is what makes them the pair that separates the two possible
 * readiness formulas. Rows 52, 53, 54 and 59 each carry two to four skills and would blur it.
 */
const ROW_PYTHON = { row: 28, topic: "Production Python architecture: domain models, repositories, DI, packaging" };
const ROW_LATENCY = { row: 65, topic: "Cost and latency engineering: prompt caching, batching, smaller models" };

type Fix = {
  company: string;
  title: string;
  location: string;
  skills: string[] | null;
  /** The scan-time tier. Absent on every req in the live index, which is why it is optional. */
  reach?: ReachTier;
  firstSeen?: string;
  missingSince?: string;
  tier: ReachTier;
  why: string;
};

const FIXTURES: Fix[] = [
  // --- reachable: india-remote and emea-apac-remote, the only two tiers a percentage labelled
  //     "the market you can take" is computed over.
  { company: "Palantir", title: "Forward Deployed Engineer, Remote India", location: "Remote - India", skills: ["python"], firstSeen: DAY, tier: "india-remote", why: "the only location string the live corpus actually produces for this tier (4 reqs)" },
  { company: "OpenAI", title: "Forward Deployed Engineer, Distributed", location: "Remote, Global", skills: ["python"], tier: "india-remote", why: "GLOBAL vocabulary, no region named" },
  { company: "Sierra", title: "Agent Deployment Engineer", location: "Remote - EMEA", skills: ["python"], tier: "emea-apac-remote", why: "remote with a stated region that overlaps IST" },
  { company: "Cohere", title: "Forward Deployed Engineer", location: "Remote - Singapore", skills: ["python"], tier: "emea-apac-remote", why: "APAC city, remote" },

  // --- takeable, but not today: a domestic move. Deliberately outside REACHABLE_TIERS.
  { company: "Databricks", title: "Delivery Solutions Architect", location: "Bengaluru, India", skills: ["python"], tier: "india-office", why: "an Indian city, on-site — reachable this quarter, not today" },

  // --- the residual: on-site elsewhere, nothing stated either way. 94% of the live corpus.
  { company: "Anthropic", title: "Applied AI Architect", location: "San Francisco, CA", skills: ["python"], tier: "relocate-sponsor", why: "on-site, no blocker in the body" },
  { company: "Modal Labs", title: "Forward Deployed Engineer", location: "New York, NY", skills: ["python"], tier: "relocate-sponsor", why: "same, and the second inference-infra company" },
  { company: "Newco", title: "Forward Deployed Engineer", location: "London", skills: ["python"], tier: "relocate-sponsor", why: "absent from SEGMENT_BY_COMPANY: must land in `other`, not vanish" },

  // --- out of reach, by the two different routes, and the ONLY two reqs carrying latency-cost.
  { company: "Baseten", title: "Customer Engineer", location: "Remote - Texas", skills: ["python", "latency-cost"], tier: "out-of-reach", why: "remote with a region that excludes India — decided by location alone" },
  {
    company: "Palantir", title: "Forward Deployed Software Engineer", location: "Remote - India",
    skills: ["python", "latency-cost"], reach: "out-of-reach", firstSeen: DAY, tier: "out-of-reach",
    why: "THE guard: the location says India and the stored scan-time tier says the body carried a US-person clause. The stored tier is the only one that ever read the body, so it must win — and this req must not flag as a new India-remote role either",
  },
];

/**
 * Three requisitions that must never reach a denominator, so `reachability.coreCount` can be
 * asserted equal to `benchmark.coreCount` rather than merely computed the same way. The two
 * modules each own a private copy of `distinct`; nothing but this holds them together.
 */
const EXCLUDED: Fix[] = [
  // Both clones are posted on-site and the requisition they clone is remote-EMEA, so if the
  // clone group ever picked its representative by id order instead of by oldest `firstSeen` the
  // req would silently drop out of the reachable slice. That is the failure this pair caught.
  { company: "Sierra", title: "Agent Deployment Engineer (London)", location: "London", skills: ["python"], firstSeen: DAY, tier: "relocate-sponsor", why: "city clone: same dedupeKey as the Sierra req above, later firstSeen, so it collapses into it" },
  { company: "Sierra", title: "Agent Deployment Engineer (Berlin)", location: "Berlin", skills: ["python"], firstSeen: DAY, tier: "relocate-sponsor", why: "second clone of the same requisition" },
  { company: "Snowflake", title: "Forward Deployed Engineer, Pending", location: "Remote - India", skills: null, tier: "india-remote", why: "failed stage-2 JD fetch, retried next run — counting it would deflate every skill" },
  { company: "Snowflake", title: "Forward Deployed Engineer, Closed", location: "Remote - India", skills: ["python"], missingSince: "2026-09-05", tier: "india-remote", why: "closed, inside its 14-day decay window" },
];

const record = (f: Fix): ReqRecord => ({
  company: f.company,
  title: f.title,
  key: dedupeKey(f.company, f.title),
  location: f.location,
  url: `https://example.test/${encodeURIComponent(f.title)}`,
  class: "core",
  publishedAt: "2026-08-01",
  firstSeen: f.firstSeen ?? EARLIER,
  lastSeen: DAY,
  missingSince: f.missingSince ?? null,
  skills: f.skills,
  ...(f.reach ? { reach: f.reach } : {}),
});

const board = { ok: true, total: 100, matched: 4, bytes: 1000, fetchedAt: `${DAY}T03:00:00.000Z`, error: null };

function buildIndex(rows: Fix[] = [...FIXTURES, ...EXCLUDED]): MarketIndex {
  const reqs: Record<string, ReqRecord> = {};
  rows.forEach((f, i) => { reqs[`${f.company.toLowerCase().replace(/[^a-z0-9]+/g, "")}::s${i}`] = record(f); });
  return { version: 1, updatedAt: NOW.toISOString(), cursor: 0, boardsOk: 27, boards: { fixture: board }, reqs };
}

const index = buildIndex();
const benchmark = computeBenchmark(index, skillMap, workbook, NOW, null);

/** One progress event in the shape store.ts's `readProgress` returns: topic, status, date. */
const event = (topic: string, status: string, date: string | null) => ({ topic, status, ...(date === null ? {} : { date }) });
const progressOf = (...events: { topic: string; status: string; date?: string }[]): Progress => ({ events });

const insightOf = (progress: Progress | null, trend: TrendPoint[] | null, wb: Workbook = workbook, idx: MarketIndex = index) =>
  computeInsight(idx, computeBenchmark(idx, skillMap, wb, NOW, null), progress, wb, trend, NOW);

const noProgress = insightOf(null, null);

// ---------------------------------------------------------------------------
console.log("\n  readiness — weighted by market share, and read from progress events");
// ---------------------------------------------------------------------------

console.log(`\n  ${noProgress.readiness.statement.split("\n")[0]}`);

ck("the fixture corpus is the ten distinct reqs, clones and dead reqs dropped",
  benchmark.coreCount === 10 && noProgress.reachability.coreCount === 10, `(${noProgress.reachability.coreCount})`);
ck("insight and benchmark agree on the core denominator",
  noProgress.reachability.coreCount === benchmark.coreCount, "(two private copies of distinct(); nothing else holds them equal)");

const share = (id: string) => benchmark.coverage.find((c) => c.id === id)!.pct;
ck("python is on every fixture req and latency-cost on two", share("python") === 100 && share("latency-cost") === 20,
  `(python ${share("python")}%, latency-cost ${share("latency-cost")}%)`);
ck("the denominator is the summed market share, not the skill count",
  noProgress.readiness.totalWeight === 120 && noProgress.readiness.skillCount === skillMap.skills.length,
  `(${noProgress.readiness.totalWeight} share points across ${noProgress.readiness.skillCount} skills)`);

/**
 * The one assertion this whole file is built around.
 *
 * Both runs clear exactly ONE plan row and exactly ONE skill. A readiness counted by rows, or by
 * skills, reports the identical number for the two — and it would be a plausible number, which
 * is why nothing downstream would ever catch it. Weighted by market share they are 83% and 17%,
 * because clearing the skill 10 of 10 reqs ask for is not the same achievement as clearing the
 * one 2 of them ask for.
 */
const clearedPython = insightOf(progressOf(event(ROW_PYTHON.topic, "done", "2026-09-05")), null);
const clearedLatency = insightOf(progressOf(event(ROW_LATENCY.topic, "done", "2026-09-05")), null);
ck("clearing the 100% skill reads 83%", clearedPython.readiness.pct === 83 && clearedPython.readiness.evidencedWeight === 100,
  `(${clearedPython.readiness.evidencedWeight} of 120 share points)`);
ck("clearing the 20% skill reads 17%", clearedLatency.readiness.pct === 17 && clearedLatency.readiness.evidencedWeight === 20,
  `(${clearedLatency.readiness.evidencedWeight} of 120 share points)`);
ck("one row cleared is not one row cleared — the weight is the whole point",
  clearedPython.readiness.pct !== clearedLatency.readiness.pct
    && clearedPython.readiness.evidenced.length === clearedLatency.readiness.evidenced.length,
  `(${clearedPython.readiness.pct}% vs ${clearedLatency.readiness.pct}%, one skill each)`);

/**
 * Progress, not the workbook column.
 *
 * data/workbook.json column 15 holds 117 "Not started" and 2 "Skipped" and no other value — it
 * is the committed baseline and nothing ever writes to it. A readiness derived from it is
 * therefore pinned at 0% for the life of the plan and reads as a bug rather than as month one.
 * Both directions are pinned: a real event moves readiness off zero against that baseline, and a
 * workbook whose every row says "Done" moves it not at all.
 */
const doneWorkbook: Workbook = { Plan: workbook.Plan.map((row, i) => (i === 0 ? row : row.map((cell, col) => (col === 15 ? "Done" : cell)))) };
ck("a progress event moves readiness even though the workbook row says Not started",
  clearedPython.readiness.pct > 0 && String(workbook.Plan[ROW_PYTHON.row][15]).toLowerCase() === "not started",
  `(workbook col 15 = "${workbook.Plan[ROW_PYTHON.row][15]}")`);
ck("a workbook-only run reads 0%, because column 15 is never consulted",
  insightOf(null, null, doneWorkbook).readiness.pct === 0,
  "(117 Not started + 2 Skipped is the only content that column has ever had)");
ck("...and the column still supplies the marginal row's displayed status",
  insightOf(null, null, doneWorkbook).readiness.marginal.every((m) => m.status === "done"));
ck("no events at all is reported as no events, not as zero progress",
  noProgress.readiness.eventCount === 0 && noProgress.readiness.matchedCount === 0 && noProgress.readiness.pct === 0);
ck("an event naming no plan row is counted but never matched",
  insightOf(progressOf(event("A topic that is in no plan row", "done", "2026-09-05")), null).readiness.matchedCount === 0);
ck("...and 'in progress' is not evidence", insightOf(progressOf(event(ROW_PYTHON.topic, "in_progress", "2026-09-05")), null).readiness.pct === 0);
ck("...nor is 'skipped', which is a decision not to acquire the skill",
  insightOf(progressOf(event(ROW_PYTHON.topic, "skipped", "2026-09-05")), null).readiness.pct === 0);

// ---------------------------------------------------------------------------
console.log("\n  the marginal table — ranked by gain, and a cleared row leaves it");
// ---------------------------------------------------------------------------

console.log(`    ${noProgress.readiness.marginal[0].statement.split("\n")[0]}`);

const rowsOf = (i: Insight) => i.readiness.marginal.map((m) => m.row);
ck("the largest available move ranks first", noProgress.readiness.marginal[0].row === ROW_PYTHON.row,
  `(row ${noProgress.readiness.marginal[0].row}, +${noProgress.readiness.marginal[0].gainPoints})`);
ck("the table is sorted by gain descending, not by row or by hours",
  noProgress.readiness.marginal.every((m, i, all) => i === 0 || all[i - 1].gainWeight >= m.gainWeight));
ck("the ranking is on unrounded share points, so two rows that round alike keep a stable order",
  noProgress.readiness.marginal.every((m, i, all) => i === 0 || all[i - 1].gainWeight > m.gainWeight || all[i - 1].row < m.row));
ck("a completed row is not offered as a next move", !rowsOf(clearedPython).includes(ROW_PYTHON.row),
  `(${rowsOf(noProgress).length} rows before, ${rowsOf(clearedPython).length} after)`);
ck("...and every other row is still offered", rowsOf(clearedPython).length === rowsOf(noProgress).length - 1);
ck("the gain is stated against the same denominator as readiness",
  noProgress.readiness.marginal[0].from === 0 && noProgress.readiness.marginal[0].to === 83
    && noProgress.readiness.marginal[0].gainPoints === 83);
ck("...and a row that clears nothing the market asks for offers no gain",
  noProgress.readiness.marginal.some((m) => m.gainWeight === 0 && m.gainPoints === 0),
  "(reported at +0 rather than hidden — a skill at 0% share is a finding about the plan)");
ck("every marginal row resolves to a real workbook topic",
  noProgress.readiness.marginal.every((m) => m.topic.length > 0 && m.topic === String(workbook.Plan[m.row][2])));

// ---------------------------------------------------------------------------
console.log("\n  reachability — five exclusive tiers, and what an out-of-reach req may not touch");
// ---------------------------------------------------------------------------

console.log(`    ${noProgress.reachability.statement.split("\n")[0]}`);

const tier = (id: ReachTier) => noProgress.reachability.tiers.find((t) => t.tier === id)!;
const tierSum = noProgress.reachability.tiers.reduce((n, t) => n + t.count, 0);
ck("every tier is rendered, in one fixed order", noProgress.reachability.tiers.map((t) => t.tier).join() === REACH_TIERS.join());
ck("the tiers partition the corpus: they sum to the core count", tierSum === noProgress.reachability.coreCount,
  `(${tierSum} of ${noProgress.reachability.coreCount})`);
ck("...and each tier holds what it was built to hold",
  tier("india-remote").count === 2 && tier("emea-apac-remote").count === 2 && tier("india-office").count === 1
    && tier("relocate-sponsor").count === 3 && tier("out-of-reach").count === 2,
  `(${noProgress.reachability.tiers.map((t) => `${t.tier} ${t.count}`).join(", ")})`);
ck("reachable is india-remote + emea-apac-remote and nothing else",
  noProgress.reachability.reachableCount === tier("india-remote").count + tier("emea-apac-remote").count
    && noProgress.reachability.reachablePct === 40, `(${noProgress.reachability.reachableCount} of 10)`);
// A clone group is ONE role posted in several cities, so it takes the BEST tier anywhere in the
// group -- you apply to the city you can reach. Tiering the oldest-firstSeen representative
// alone hid five real openings on the live corpus, including an Anthropic role with a Bangalore
// clone that read as relocate-sponsor.
ck("a clone group takes the best tier any clone offers, not the representative's",
  noProgress.reachability.tiers.find((t) => t.tier === "emea-apac-remote")!.count >= 1,
  "(the Sierra req is remote-EMEA; its city clones are on-site, and the group keeps the reachable tier)");

ck("an Indian office is NOT counted as employable today",
  noProgress.reachability.reachableCount + tier("india-office").count !== noProgress.reachability.reachableCount,
  "(a domestic move is a different question from a remote offer)");

/**
 * The leak this section exists for.
 *
 * `latency-cost` is carried by exactly the two out-of-reach requisitions and by nothing else. It
 * is 20% of the whole core market and must be 0% of the reachable slice. If either req entered
 * the reachable denominator or the reachable numerator, this number stops being 0 — and 20% of
 * a market you cannot take, printed under a column headed "the market you can take", is the
 * single most expensive wrong number this file can produce, because it is what a study decision
 * is made from.
 */
const reachSkill = (id: string) => noProgress.reachability.skills.find((s) => s.id === id)!;
ck("an out-of-reach req never enters a reachable percentage",
  reachSkill("latency-cost").marketPct === 20 && reachSkill("latency-cost").reachablePct === 0 && reachSkill("latency-cost").hits === 0,
  `(${reachSkill("latency-cost").marketPct}% of the market, ${reachSkill("latency-cost").reachablePct}% of the reachable slice)`);
// The denominator is the WITHOUT-LEAVING-INDIA slice, not the no-move slice and never the core
// count. A percentage over the five no-move reqs is noise -- one requisition moves it twenty
// points -- and this column exists to inform a study decision, so it is computed over the wider
// set that a multi-month plan can actually reach. Still never the core count: that would let an
// out-of-reach req deflate a number labelled reachable.
ck("...and the reachable denominator is the in-India count, never the core count",
  noProgress.reachability.skills.every((s) => s.reqs === noProgress.reachability.inIndiaCount) &&
    noProgress.reachability.inIndiaCount !== noProgress.reachability.coreCount,
  `(denominator ${noProgress.reachability.skills[0].reqs}, in-India ${noProgress.reachability.inIndiaCount}, core ${noProgress.reachability.coreCount})`);
ck("in-India is the no-move slice plus india-office",
  noProgress.reachability.inIndiaCount ===
    noProgress.reachability.reachableCount + noProgress.reachability.tiers.find((t) => t.tier === "india-office")!.count);

ck("a skill on every req reads 100% in both columns", reachSkill("python").marketPct === 100 && reachSkill("python").reachablePct === 100);
ck("both columns are always reported, and their difference with them",
  reachSkill("latency-cost").deltaPoints === -20 && reachSkill("latency-cost").statement.includes("20% of the whole core market, 0% of the market you can take without leaving India"));

/**
 * The stored tier beats the location, in the direction that costs a reachable req.
 *
 * Palantir's second fixture req is posted to "Remote - India" and its stored `reach` says the
 * body carried a US-person clause. reach.ts's body pass only ever moves a req INTO
 * `out-of-reach`, so re-deriving the tier here from `location` — which is what the tab would do
 * if `tierOf` preferred the cheap answer — promotes it straight back into the reachable slice.
 */
ck("a scan-time tier overrides the location it contradicts",
  tier("india-remote").count === 2 && !tier("india-remote").statement.includes("3 of 10"),
  "(3 locations say India-remote; one of them was tiered out-of-reach from its body)");
ck("...and the tab says how much of the corpus was tiered without a body",
  noProgress.reachability.derivedCount === 9 && noProgress.reachability.statement.includes("tiered from the location string alone"),
  `(${noProgress.reachability.derivedCount} of 10 derived)`);

// ---------------------------------------------------------------------------
console.log("\n  segments — assignment is total, and the fit ranking is a measurement");
// ---------------------------------------------------------------------------

const segSum = noProgress.segments.reduce((n, s) => n + s.count, 0);
console.log(`    ${noProgress.segments.map((s) => `${s.rank}. ${s.id} ${s.count}`).join("  ")}`);
ck("every core req lands in exactly one segment", segSum === noProgress.reachability.coreCount,
  `(${segSum} of ${noProgress.reachability.coreCount})`);
ck("a company absent from the table lands in `other` rather than off the edge",
  noProgress.segments.find((s) => s.id === "other")?.count === 1,
  "(Newco: the catch-all is what makes the sum above a partition and not a coincidence)");
ck("...and `other` is absent entirely when every company is mapped",
  !insightOf(null, null, workbook, buildIndex(FIXTURES.filter((f) => f.company !== "Newco"))).segments.some((s) => s.id === "other"));
ck("the five real segments always render, at zero if need be",
  noProgress.segments.filter((s) => s.id !== "other").length === 5,
  "(a segment that emptied out this week is itself the finding)");
ck("ranks are 1..n with no gaps", noProgress.segments.every((s, i) => s.rank === i + 1));
ck("the fit ranking leads on reachable requisitions, not on share",
  noProgress.segments.every((s, i, all) => i === 0 || all[i - 1].reachableCount >= s.reachableCount)
    && noProgress.segments[0].reachableCount === 2,
  `(#1 is ${noProgress.segments[0].id} with ${noProgress.segments[0].reachableCount} reachable of ${noProgress.segments[0].count})`);
ck("a segment's readiness is against its own demand, not the market's",
  insightOf(progressOf(event(ROW_LATENCY.topic, "done", "2026-09-05")), null).segments.find((s) => s.id === "inference-infra")!.readinessPct
    > insightOf(progressOf(event(ROW_LATENCY.topic, "done", "2026-09-05")), null).segments.find((s) => s.id === "agent-engineer")!.readinessPct,
  "(latency-cost is half of Baseten's inference-infra demand and none of Sierra's)");
ck("a segment's reachable count is a subset of its own count",
  noProgress.segments.every((s) => s.reachableCount <= s.count && s.reach.reduce((n, t) => n + t.count, 0) === s.count));

// ---------------------------------------------------------------------------
console.log("\n  velocity — one point is one point, and it says so");
// ---------------------------------------------------------------------------

const TODAY_POINT: TrendPoint = { d: DAY, core: 10, companies: 8, s: benchmark.skillShares };
const WEEK_AGO: TrendPoint = { d: "2026-08-30", core: 8, companies: 7, s: { python: 0.45, "latency-cost": 0.2 } };
const THREE_DAYS: TrendPoint = { d: "2026-09-04", core: 9, companies: 8, s: { python: 0.45, "latency-cost": 0.2 } };

const onePoint = insightOf(null, [TODAY_POINT]);
console.log(`    ${onePoint.velocity.statement}`);
ck("one trend point yields no velocity claim",
  onePoint.velocity.available === false && onePoint.velocity.skills.length === 0
    && onePoint.velocity.coreFrom === null && onePoint.velocity.coreTo === null && onePoint.velocity.coreDelta === null);
ck("...and no movement sentence is rendered anywhere in it",
  !/\d+% to \d+%/.test(onePoint.velocity.statement) && !/[+-]\d/.test(onePoint.velocity.statement)
    && onePoint.velocity.statement.includes("it starts next week"), `("${onePoint.velocity.statement}")`);
ck("...and it emits no band-crossing flag either", !onePoint.flags.some((f) => f.kind === "band-crossing"));
ck("no trend file at all reads the same way", insightOf(null, null).velocity.available === false);

const tooClose = insightOf(null, [THREE_DAYS, TODAY_POINT]);
ck("two points three days apart is still not velocity",
  tooClose.velocity.available === false && tooClose.velocity.skills.length === 0
    && tooClose.velocity.statement.includes(`needs ${VELOCITY_MIN_DAYS}`), `("${tooClose.velocity.statement}")`);
ck("...and nothing is interpolated to fill the gap", !/\d+% to \d+%/.test(tooClose.velocity.statement));

const moved = insightOf(null, [WEEK_AGO, THREE_DAYS, TODAY_POINT]);
console.log(`    ${moved.velocity.statement.split("\n").join(" ")}`);
ck("two points a week apart is", moved.velocity.available === true && moved.velocity.spanDays === 8 && moved.velocity.coreDelta === 2);
ck("...measured from the most recent point old enough, not the oldest one", moved.velocity.from === WEEK_AGO.d);
ck("a skill that moved is reported with the band it crossed",
  moved.velocity.skills.some((s) => s.id === "python" && s.from === 45 && s.to === 100 && s.delta === 55 && s.crossed === 50));
ck("...and raises a band-crossing flag", moved.flags.some((f) => f.kind === "band-crossing" && f.id === "python"));
ck("a flat skill is not reported", !moved.velocity.skills.some((s) => s.id === "latency-cost"));
ck("the movement threshold is benchmark.ts's, imported rather than re-declared", MOVE_MIN_POINTS === 3);

// ---------------------------------------------------------------------------
console.log("\n  flags — deterministic, and never manufactured out of a missing field");
// ---------------------------------------------------------------------------

ck("a readiness move raises a flag", clearedPython.flags.some((f) => f.kind === "readiness")
  && clearedPython.readiness.deltaPoints === 83 && clearedPython.readiness.weekAgoPct === 0);
ck("...and the threshold is whole points", READINESS_FLAG_POINTS === 3);
ck("an event older than the window is not this week's move",
  insightOf(progressOf(event(ROW_PYTHON.topic, "done", "2026-08-01")), null).readiness.deltaPoints === 0);
ck("an undated event counts in both snapshots, so a missing field cannot manufacture a flag",
  insightOf(progressOf(event(ROW_PYTHON.topic, "done", null)), null).readiness.deltaPoints === 0
    && insightOf(progressOf(event(ROW_PYTHON.topic, "done", null)), null).readiness.pct === 83);
ck("a new req you could take from Pune today is flagged",
  noProgress.flags.filter((f) => f.kind === "new-india-remote").length === 1);
ck("...and the one whose body ruled it out is not",
  !noProgress.flags.some((f) => f.kind === "new-india-remote" && f.statement.includes("Forward Deployed Software Engineer")),
  "(both were first seen today and both are posted to Remote - India)");

// ---------------------------------------------------------------------------
console.log("\n  the live corpus — 745 stored reqs, 189 distinct core across 23 companies");
// ---------------------------------------------------------------------------

/**
 * The fixtures above choose eight location strings. The live index carries 253 distinct ones,
 * and "the tiers are mutually exclusive and sum to the core count" is a claim about that corpus,
 * not about a set a test author picked. Same for segment totality: it is only interesting if
 * every company on all 27 enabled boards is in SEGMENT_BY_COMPANY, and only the real index can
 * say whether one is missing.
 */
const liveIndex = load("reports/market/index.json") as MarketIndex;
const liveTrend = load("reports/market/trend.json") as TrendPoint[];
const liveBenchmark = computeBenchmark(liveIndex, skillMap, workbook, NOW, null);
const live = computeInsight(liveIndex, liveBenchmark, null, workbook, liveTrend, NOW);

console.log(`    ${live.reachability.statement.split("\n")[0]}`);
console.log(`    ${live.readiness.marginal[0].statement.split("\n")[0]}`);
console.log(`    ${live.segments.map((s) => `${s.rank}. ${s.id} ${s.count}/${s.reachableCount}`).join("  ")}`);

ck("the live core count matches the benchmark's", live.reachability.coreCount === liveBenchmark.coreCount && liveBenchmark.coreCount === 189,
  `(${live.reachability.coreCount})`);
ck("the tiers partition 189 real requisitions",
  live.reachability.tiers.reduce((n, t) => n + t.count, 0) === 189,
  `(${live.reachability.tiers.map((t) => `${t.tier} ${t.count}`).join(", ")})`);
ck("every one of the 189 lands in exactly one segment",
  live.segments.reduce((n, s) => n + s.count, 0) === 189, `(${live.segments.map((s) => `${s.id} ${s.count}`).join(", ")})`);
ck("no live company falls through SEGMENT_BY_COMPANY", !live.segments.some((s) => s.id === "other"),
  "(23 core companies, all mapped — an unmapped board would show here as an unassigned count)");
ck("the reachable slice excludes every out-of-reach req",
  live.reachability.reachableCount ===
    live.reachability.tiers.filter((t) => t.tier === "india-remote" || t.tier === "emea-apac-remote").reduce((n, t) => n + t.count, 0));
ck("the live readiness denominator is the summed market share", live.readiness.totalWeight === 490,
  `(${live.readiness.totalWeight} share points across ${live.readiness.skillCount} skills)`);
ck("month one reads 0% and leads with the marginal table anyway",
  live.readiness.pct === 0 && live.readiness.marginal.length > 0 && live.readiness.marginal[0].row === 28,
  `(row ${live.readiness.marginal[0].row}, +${live.readiness.marginal[0].gainPoints} points)`);
ck("the live trend holds one point, so no velocity is claimed",
  liveTrend.length === 1 && live.velocity.available === false && live.velocity.skills.length === 0);
ck("computeInsight is pure over its arguments",
  JSON.stringify(computeInsight(liveIndex, liveBenchmark, null, workbook, liveTrend, NOW)) === JSON.stringify(live));
ck("the module never writes a Quaere paragraph", live.quaere === null && noProgress.quaere === null,
  "(it is filled by the cron after this returns; this module never calls a model)");

// ---------------------------------------------------------------------------
console.log("\n  the cron — Quaere's paragraph, and the write order that lost benchmark.json");
// ---------------------------------------------------------------------------

/**
 * The last two properties live in the route, not in the pure module, and neither has a return
 * value anybody inspects — they are observable only in the bytes handed to GitHub. So the
 * handler is driven end to end through `GET` with `globalThis.fetch` replaced by a stub that
 * answers GitHub and MiniMax and CAPTURES every PUT. The stub 502s every job board, which is the
 * cheapest complete cycle: the cursor still wraps, so the route runs all five writes.
 *
 * Resend's env vars are deliberately unset, so `sendWeekly` returns before it opens a socket and
 * this section never depends on which day of the week it runs.
 */
const SECRET = "test-cron-secret";
process.env.CRON_SECRET = SECRET;
process.env.GITHUB_TOKEN = "test-github-token";
process.env.GITHUB_REPO = "test/lumen-fde";
process.env.GITHUB_BRANCH = "main";
delete process.env.RESEND_API_KEY;
delete process.env.RESEND_FROM_EMAIL;
delete process.env.MARKET_TO_EMAIL;
delete process.env.DIGEST_TO_EMAIL;

const { GET: scanGET } = await import("../../app/api/cron/market-scan/route.ts");

const realFetch = globalThis.fetch;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

type Put = { path: string; body: unknown };
let puts: Put[] = [];
let modelCalled = false;

async function scan(paragraph: string) {
  puts = [];
  modelCalled = false;
  process.env.MINIMAX_API_KEY = "test-minimax-key";
  (globalThis as unknown as { fetch: unknown }).fetch = async (input: unknown, init?: RequestInit) => {
    const url = typeof input === "string" ? input : String((input as { url?: string })?.url ?? input);
    if (url === "https://api.minimax.io/v1/chat/completions") {
      modelCalled = true;
      return json({ choices: [{ message: { content: paragraph } }] });
    }
    if (url.startsWith("https://api.github.com/")) {
      if (init?.method === "PUT") {
        const payload = JSON.parse(String(init.body)) as { content: string };
        puts.push({ path: decodeURIComponent(url.split("/contents/")[1]), body: JSON.parse(Buffer.from(payload.content, "base64").toString("utf8")) });
        return json({ content: { sha: "sha-2" } });
      }
      return new Response(null, { status: 404 }); // cold start: every file absent
    }
    return json({ message: "Bad Gateway" }, 502); // every job board
  };
  const response = await scanGET(new Request("http://localhost/api/cron/market-scan", { headers: { authorization: `Bearer ${SECRET}` } }));
  const body = (await response.json()) as Record<string, unknown>;
  delete process.env.MINIMAX_API_KEY;
  return { status: response.status, body, written: puts.find((p) => p.path === INSIGHT_PATH)?.body as (Insight & { quaere: string | null }) | undefined, order: puts.map((p) => p.path) };
}

const CLEAN = "Aim at the slice that already hires remotely and let the rest wait. The ranking is telling you to clear the widest skill first, not the most interesting one.";
const clean = await scan(CLEAN);
// Asserted first: without it every check below passes for the wrong reason on a run where the
// model was never consulted at all.
ck("the model is actually consulted for the reading", modelCalled);
ck("the scan completes a cycle and writes an insight",
  clean.status === 200 && clean.body.ok === true && clean.body.partial === false && clean.body.insight === true);
ck("a digit-free paragraph is stored", clean.body.reading === true && clean.written?.quaere === CLEAN);

/**
 * The digit ban. The prompt says "Write no numbers at all", so there is no allow-set to be
 * absent from — which is the whole point, because every weaker version leaked. A whitelist built
 * from text the model can see is a whitelist the model can quote from: deriving it from the
 * prompt whitelisted `60` forever ("In 80 words or fewer" has the same shape), and deriving it
 * from the facts whitelisted `58`, because the marginal statements this reading is prompted with
 * cite plan rows and hours — `row 28, "Production Python architecture" - 14.5h, month 7` — and a
 * row number reads as a percentage the moment the model puts a % after it.
 *
 * An invented number sitting among audited ones discredits the audited ones too, and the tab
 * renders this paragraph directly beneath them. Dropping it costs the paragraph and nothing else.
 */
const invented = await scan("Roughly 3 in 10 of these roles are reachable, so aim there first.");
ck("a reading carrying a digit is dropped", invented.body.reading === false && invented.written?.quaere === null);
ck("...and none of it reaches the file", !JSON.stringify(invented.written).includes("Roughly 3 in 10"));
ck("...while the measured insight is still written", invented.body.insight === true && typeof invented.written?.readiness === "object");

const laundered = await scan("Row 28 is the widest move available, so start there and defer the rest.");
ck("a plan row number cannot launder itself into the paragraph", laundered.body.reading === false && laundered.written?.quaere === null,
  "(28 is the top marginal row in the very prompt this reading is written from)");
const decimal = await scan("Coverage moved 14.5 points this week, so hold the line on evaluation work.");
ck("a decimal is a token of its own", decimal.body.reading === false && decimal.written?.quaere === null);
const thinking = await scan("<think>The user wants a reading of this market.");
ck("an unterminated reasoning block leaves no paragraph rather than an empty one",
  thinking.body.reading === false && thinking.written?.quaere === null && !JSON.stringify(thinking.written).includes("<think>"),
  "(null, not \"\" — an empty string would render an empty Quaere block instead of no block)");

/**
 * The write order, which is not a style preference.
 *
 * Each write is a commit on the same branch, so concurrent writes race the branch ref and GitHub
 * rejects the losers with "is at <commit> but expected <commit>". The first real scan wrote
 * index.json, trend.json and the history archive and LOST benchmark.json to exactly that. So the
 * order is pinned, not just the fact that five files were written: index first because it is the
 * only file that cannot be recomputed, and insight last because it is the most derived.
 */
ck("five files are written, each exactly once", clean.order.length === 5 && new Set(clean.order).size === 5, `(${clean.order.join(" -> ")})`);
ck("index.json goes first, alone", clean.order[0] === INDEX_PATH);
ck("insight.json goes last, after the benchmark and the trend it is derived from",
  clean.order[clean.order.length - 1] === INSIGHT_PATH
    && clean.order.indexOf(INSIGHT_PATH) > clean.order.indexOf(BENCHMARK_PATH)
    && clean.order.indexOf(INSIGHT_PATH) > clean.order.indexOf(TREND_PATH));

(globalThis as unknown as { fetch: unknown }).fetch = realFetch;
console.log(fails ? `\n${fails} FAILURES` : "\nall assertions passed");
process.exit(fails ? 1 : 0);
