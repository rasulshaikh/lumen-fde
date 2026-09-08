/**
 * The personal reading of the market benchmark: what 189 core requisitions mean for one
 * candidate sitting in Pune at month one of a twenty-month plan.
 *
 * `benchmark.ts` answers what the market asks for. It is impersonal, publishable, and the same
 * for every reader. This file answers what that costs and what to do about it, and it is
 * neither — different inputs, different audience, different blast radius if wrong. That is why
 * it is a second module rather than three hundred more lines in the first one.
 *
 * Pure, for the same reason `benchmark.ts` is: `now` is a parameter, there is no network, no
 * filesystem and no `Date.now()`, so every number below can be exercised against a fixture
 * instead of against a 47 MB scan of 27 live boards. A readiness percentage that can only be
 * produced by a full scan is a readiness percentage nobody ever checks.
 *
 * Four rules shape everything here, each of which produces a plausible wrong number if broken:
 *
 *  1. Readiness reads PROGRESS EVENTS, never workbook column 15. That column is the committed
 *     baseline and holds 117 "Not started" and 2 "Skipped" and nothing else, so a
 *     workbook-derived readiness is 0% forever and reads as a bug rather than as month one.
 *  2. Readiness is weighted by market share, not by row count. Clearing the 67% skill is worth
 *     sixteen times clearing the 4% one, and a row count says they are equal.
 *  3. A requisition that is out of reach never enters a reachable denominator, and the two
 *     denominators are both reported. "Evals is 42% of the market" and "evals is 55% of the
 *     market you can take" are different facts and the second one is the actionable one.
 *  4. Velocity needs two points spanning a week. With one point it says so and emits nothing;
 *     it never interpolates, because there is no way to recover board state from before the
 *     first scan and a fabricated slope would be indistinguishable from a measured one.
 *
 * Every entry carries a rendered `statement`, exactly as `benchmark.ts` does, so the Market tab
 * and the weekly email print identical sentences and a wording or arithmetic fix has one home.
 */
import { dedupeKey } from "./classify";
// Type-only: store.ts talks to GitHub. Importing it for values would put a network module in
// this file's import graph, which is exactly the coupling the purity above protects.
import type { MarketIndex, ReqRecord, TrendPoint } from "./store";
import { MOVE_MIN_POINTS, type Benchmark, type CoverageEntry, type PlanRow, type PlanRowRef, type Workbook } from "./benchmark";
/**
 * Tiering is reach.ts's job, not this file's.
 *
 * That module runs at scan time with the JD body in hand, which is the only place the
 * US-person clause and the clearance language exist — 22 of the 189 distinct core reqs sit in
 * the Washington/Maryland/Virginia belt and read as ordinary on-site roles until you read the
 * body. Re-deriving tiers here from `location` alone would give the tab a second, more
 * permissive answer than the one stored on the requisition, and the two would disagree in the
 * direction that inflates "the market you can take".
 *
 * `classifyReach(req, null)` is the same function with no body, which is exactly the
 * location-only fallback this file needs for a req scanned before the field existed.
 */
import { REACH_LABELS, REACH_TIERS, classifyReach, type ReachTier } from "./reach";

export type { PlanRowRef, Workbook } from "./benchmark";
export type { ReachTier } from "./reach";

/**
 * A readiness move of this many whole points raises a flag.
 *
 * Three points is roughly one mid-sized skill clearing — `rag` at 22% of the market is 4.5
 * points of readiness on the current corpus. Below that the flag would fire on the rounding of
 * a single 1% skill and stop meaning anything.
 */
export const READINESS_FLAG_POINTS = 3;

/** Velocity needs a window at least this wide. Two scans on consecutive days measure noise. */
export const VELOCITY_MIN_DAYS = 7;

/**
 * The band edges, mirrored from `benchmark.ts`, which declares the same three and does not
 * export them. This file cannot edit that one, so the constant is copied rather than reached
 * for; the test pins the two in agreement. A skill crossing 25/50/75 is reported even when it
 * moved fewer than MOVE_MIN_POINTS, because "half the market now asks for this" is a fact about
 * the market and a two-point move across 50 is the moment it became true.
 */
const BANDS = [25, 50, 75];

/**
 * "Employable from Pune today" — the two tiers that need no move and no visa.
 *
 * Every percentage this file describes as reachable is computed over exactly these two, so an
 * `out-of-reach` requisition cannot enter one by omission. It lives here rather than in
 * reach.ts on that module's own instruction: which tiers a headline is recomputed within is a
 * reporting decision, and tiering a requisition is not.
 *
 * `india-office` is deliberately outside it, because a Bengaluru role is takeable only after a
 * domestic move and one number cannot mean both "today" and "this quarter".
 */
const REACHABLE_TIERS: ReachTier[] = ["india-remote", "emea-apac-remote"];

/**
 * "Takeable without leaving India" — the above plus `india-office`.
 *
 * Both sets exist because collapsing to either one alone reports something false. Answering
 * only with REACHABLE_TIERS is what made the first run claim data-platform was the sole segment
 * with any reachable roles: Anthropic's Applied AI Architect in Bangalore and Observe AI's AI
 * Agent Engineer in Bengaluru both scored zero, so a frontier-lab and an agent-engineer opening
 * that a Pune-based candidate can genuinely take read as unreachable. Collapsing the other way
 * would erase the distinction between a role needing no move at all and one needing a domestic
 * one.
 *
 * So: headline counts report both, and everything whose purpose is to inform a MULTI-MONTH
 * decision — segment ranking, per-segment reach — uses this wider set. Over a 23-month plan a
 * domestic move is a choice, not a barrier, and treating it as one distorts the only question
 * the segment ranking exists to answer.
 */
const IN_INDIA_TIERS: ReachTier[] = [...REACHABLE_TIERS, "india-office"];

export type SegmentId = "deployment-strategist" | "agent-engineer" | "frontier-lab-applied" | "data-platform" | "inference-infra" | "other";

const SEGMENT_LABEL: Record<SegmentId, string> = {
  "deployment-strategist": "Deployment strategist",
  "agent-engineer": "Agent engineer",
  "frontier-lab-applied": "Frontier lab, applied",
  "data-platform": "Data platform",
  "inference-infra": "Inference infrastructure",
  other: "Unassigned",
};

/**
 * Segment by company, not by title.
 *
 * The spec's five segments are named by their exemplars; this table extends that to every
 * board in data/market-sources.json, including the five currently disabled, because a segment
 * assignment that is only total over the enabled set stops being total the day a board is
 * switched on. The judgements the spec did not make explicit:
 *
 *  - Applied Intuition and Retool sell customer deployments of their own platform, which is the
 *    deployment-strategist shape whatever the title says.
 *  - LangChain, Writer, Abridge and Glean ship agent and retrieval products; their deployed
 *    engineers build agents against a customer's data, not a data platform.
 *  - Perplexity and Hugging Face are model-side, so they sit with the labs.
 *  - Samsara and Weights & Biases sell a platform over somebody else's data.
 *
 * Anything absent lands in `other`, which is emitted only when it is non-empty. That bucket is
 * the reason segment assignment can be called total: a board added to market-sources.json
 * without a line here shows up as an unassigned count instead of quietly leaving a denominator
 * that the tab asserts is the whole market.
 */
const SEGMENT_BY_COMPANY: Record<string, SegmentId> = {
  Palantir: "deployment-strategist",
  "Scale AI": "deployment-strategist",
  "Applied Intuition": "deployment-strategist",
  Anduril: "deployment-strategist",
  "Vannevar Labs": "deployment-strategist",
  Retool: "deployment-strategist",
  Sierra: "agent-engineer",
  Decagon: "agent-engineer",
  Cresta: "agent-engineer",
  "Observe AI": "agent-engineer",
  LangChain: "agent-engineer",
  Writer: "agent-engineer",
  Abridge: "agent-engineer",
  Glean: "agent-engineer",
  OpenAI: "frontier-lab-applied",
  Anthropic: "frontier-lab-applied",
  Cohere: "frontier-lab-applied",
  "Mistral AI": "frontier-lab-applied",
  Perplexity: "frontier-lab-applied",
  "Hugging Face": "frontier-lab-applied",
  Databricks: "data-platform",
  Snowflake: "data-platform",
  "dbt Labs / Fivetran": "data-platform",
  "Sigma Computing": "data-platform",
  Datadog: "data-platform",
  Samsara: "data-platform",
  "Weights & Biases": "data-platform",
  Baseten: "inference-infra",
  "Modal Labs": "inference-infra",
  "Fireworks AI": "inference-infra",
  Anyscale: "inference-infra",
  "Together AI": "inference-infra",
};

/**
 * A plan row is complete only on these. The dashboard writes `done` (POST /api/progress
 * lowercases the select's "Done" and underscores the space), the other three spellings are
 * what a human or an MCP client types. Nothing else counts: "in progress" is not evidence, and
 * "skipped" is a decision not to acquire the skill rather than a claim to have it.
 */
const DONE_STATUSES = new Set(["done", "complete", "completed", "finished"]);

const iso = (now: Date) => now.toISOString().slice(0, 10);
const pctOf = (hits: number, total: number) => (total > 0 ? Math.round((hits / total) * 100) : 0);
/** 18 stays "18h", 14.5 stays "14.5h" — never "18.0h", which reads like false precision. */
const hrs = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)}h`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const signed = (n: number) => `${n > 0 ? "+" : ""}${n}`;
/** reach.ts's tier wordings are lowercase fragments; rendered as their own line they are not. */
const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The denominator, always as a pair — the same rule benchmark.ts enforces, and the same
 * helper, copied because it is not exported and this file may not edit that one. A skill at
 * 100% of one company's 26 cloned reqs and a skill at 40% across 12 companies are different
 * findings that a bare percentage renders identically.
 */
const pair = (hits: number, reqs: number, companies: number, totalCompanies: number) =>
  `${hits} of ${reqs} reqs, across ${companies} of ${totalCompanies} companies`;

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 864e5);

const norm = (value: unknown) => String(value ?? "").trim().toLowerCase();
/** Progress statuses arrive underscored from the dashboard POST and spaced from a human. */
const normStatus = (value: unknown) => norm(value).replace(/_/g, " ");

/** One progress event as /api/progress returns it, newest first. */
export type ProgressEvent = {
  topic: string;
  status: string;
  /**
   * The instant the event was recorded. The design names it `at`; the live route emits the
   * same ISO string as `date`, so both are read — a caller that pipes /api/progress straight
   * through must not silently lose every timestamp.
   *
   * An event with no usable timestamp counts in BOTH the current and the week-ago snapshot.
   * Treating it as new instead would make an undated event look like a week's progress and
   * raise a readiness flag out of a missing field.
   */
  at?: string | null;
  date?: string | null;
};

export type Progress = { events: ProgressEvent[] };

/** A skill cleared, or clearable, by one plan row. */
export type SkillWeight = { id: string; label: string; pct: number };

export type MarginalEntry = {
  row: number;
  topic: string;
  hours: number;
  month: number;
  status: string;
  skills: SkillWeight[];
  /** Share points cleared by finishing this row, against the same denominator as readiness. */
  gainWeight: number;
  from: number;
  to: number;
  gainPoints: number;
  statement: string;
};

export type Readiness = {
  pct: number;
  /** Σ market share of evidenced skills, and of all of them. Carried so the tab can show both. */
  evidencedWeight: number;
  totalWeight: number;
  evidenced: SkillWeight[];
  /** Mapped skills the market currently asks for. A 0%-share skill is not part of the goal. */
  skillCount: number;
  /** The same computation over only the events recorded seven days ago or earlier. */
  weekAgoPct: number;
  deltaPoints: number;
  /** Progress events supplied, and how many named a plan row. A gap between them is a typo. */
  eventCount: number;
  matchedCount: number;
  marginal: MarginalEntry[];
  statement: string;
};

export type ReachEntry = { tier: ReachTier; label: string; count: number; pct: number; companies: number; statement: string };

/** One skill's share of the whole core market beside its share of the reachable slice. */
export type ReachSkillEntry = {
  id: string;
  label: string;
  marketPct: number;
  reachablePct: number;
  hits: number;
  reqs: number;
  companies: number;
  totalCompanies: number;
  deltaPoints: number;
  statement: string;
};

/** One named requisition a Pune-based candidate can take. */
export type ReachRole = { company: string; title: string; location: string; url: string; tier: ReachTier; tierLabel: string; statement: string };

export type Reachability = {
  coreCount: number;
  tiers: ReachEntry[];
  reachableCount: number;
  reachablePct: number;
  reachableCompanies: number;
  /** The wider slice: takeable without leaving India, so a domestic move is allowed. */
  inIndiaCount: number;
  inIndiaPct: number;
  inIndiaCompanies: number;
  /**
   * The in-India requisitions, named.
   *
   * Counts and percentages were all this carried at first, and the tab could then only render
   * shares -- but "Databricks - Staff Forward Deployed Engineer, Remote - India" is the thing
   * a reader acts on, and a share of eleven is not. Ordered best-tier first, then company.
   */
  roles: ReachRole[];
  /** Reqs tiered from the `location` string alone, because no scan-time `reach` was stored. */
  derivedCount: number;
  skills: ReachSkillEntry[];
  statement: string;
};

export type SegmentEntry = {
  id: SegmentId;
  label: string;
  rank: number;
  companies: string[];
  count: number;
  sharePct: number;
  reachableCount: number;
  reachablePct: number;
  reach: ReachEntry[];
  topSkills: SkillWeight[];
  readinessPct: number;
  statement: string;
};

export type VelocitySkill = { id: string; label: string; from: number; to: number; delta: number; crossed: number | null; statement: string };

export type Velocity = {
  available: boolean;
  points: number;
  from: string | null;
  to: string | null;
  spanDays: number;
  coreFrom: number | null;
  coreTo: number | null;
  coreDelta: number | null;
  skills: VelocitySkill[];
  statement: string;
};

export type Flag = { kind: "readiness" | "new-india-remote" | "band-crossing"; id: string; statement: string };

export type Insight = {
  computedAt: string;
  day: string;
  readiness: Readiness;
  reachability: Reachability;
  segments: SegmentEntry[];
  velocity: Velocity;
  flags: Flag[];
  /**
   * One ≤80-word paragraph, written by the cron after this function returns and stored so the
   * tab stays model-free at request time. Null here always: this module never calls a model,
   * and the separation between measured numbers and interpretation is the whole design.
   */
  quaere: string | null;
};

/** A stored requisition, plus the tier the scan extracted from the JD body when it did. */
type ReachableReq = ReqRecord & { reach?: ReachTier | null };

/**
 * The live core corpus, deduped — the same three exclusions `benchmark.ts` applies, because
 * this file's counts have to add up to that file's `coreCount` or the tab contradicts itself
 * in two adjacent panels. Duplicated rather than imported because `distinct` is private there
 * and this task may not edit it; the test pins the two totals equal.
 *
 *  - `skills === null` is a failed JD fetch, retried next run.
 *  - `missingSince !== null` is a closed req inside its 14-day decay window.
 *  - duplicates by `dedupeKey`, or LangChain's 15 city clones set every percentage.
 *
 * The representative of a clone group is the oldest `firstSeen`, deterministically, so two
 * runs over the same index tier and segment the same requisition.
 */
function distinctCore(index: MarketIndex): ReachableReq[] {
  const byKey = new Map<string, ReachableReq>();
  for (const id of Object.keys(index.reqs).sort()) {
    const req = index.reqs[id] as ReachableReq | undefined;
    if (!req || req.class !== "core") continue;
    if (req.skills === null || req.missingSince !== null) continue;
    const key = dedupeKey(req.company, req.title);
    const held = byKey.get(key);
    if (!held || req.firstSeen < held.firstSeen) byKey.set(key, req);
  }
  return [...byKey.values()];
}

const companiesOf = (reqs: ReqRecord[]) => new Set(reqs.map((r) => r.company)).size;

/**
 * The best tier anywhere in a requisition's clone group, keyed by `dedupeKey`.
 *
 * `distinctCore` keeps the oldest clone as the representative, which is right for counting and
 * wrong for reach: a clone group is ONE role posted in several cities, and you apply to
 * whichever city you can reach. Tiering the representative alone hid five real openings behind
 * whichever location happened to be posted first — Anthropic's Applied AI Architect read as
 * relocate-sponsor while a clone sat in Bangalore, Databricks' Forward Deployed Engineer the
 * same while a clone was Remote - India, and Cresta's Senior FDE read as out-of-reach while a
 * clone was remote in Australia.
 *
 * `REACH_TIERS` is declared best-reachable-first, so "best" is simply the earliest index. This
 * only ever moves a requisition toward being reachable, and only on evidence that a takeable
 * posting for that exact role exists.
 */
function bestTierByKey(index: MarketIndex, tierOf: (r: ReachableReq) => ReachTier): Map<string, { tier: ReachTier; location: string; url: string }> {
  const best = new Map<string, { tier: ReachTier; location: string; url: string }>();
  for (const id of Object.keys(index.reqs).sort()) {
    const req = index.reqs[id] as ReachableReq | undefined;
    if (!req || req.class !== "core" || req.missingSince !== null) continue;
    const key = dedupeKey(req.company, req.title);
    const tier = tierOf(req);
    const held = best.get(key);
    // The WINNING clone's location and url travel with its tier. Carrying the representative's
    // instead printed "Anthropic - Applied AI Architect, Tokyo, Japan" under india-office: the
    // Bangalore clone earned the tier and Tokyo was displayed beside it, which reads as a bug
    // and sends the reader to the wrong posting.
    if (!held || REACH_TIERS.indexOf(tier) < REACH_TIERS.indexOf(held.tier)) {
      best.set(key, { tier, location: req.location || "", url: req.url });
    }
  }
  return best;
}

/**
 * Tier one requisition. Returns the tier and whether it was derived from `location` alone.
 *
 * The stored `reach` wins outright when it is there, because it is the only value that ever
 * saw the JD body. When it is absent — every requisition in an index scanned before the field
 * existed — `classifyReach(req, null)` is that same function with no body, which reach.ts
 * documents as an upper bound on every tier but one: the body pass only ever moves reqs INTO
 * `out-of-reach`. So a derived corpus overstates what is reachable, and `derivedCount` is how
 * the tab says that out loud instead of letting the reader assume the visa and clearance
 * clauses were checked.
 */
function tierOf(req: ReachableReq): { tier: ReachTier; derived: boolean } {
  if (req.reach && REACH_TIERS.includes(req.reach)) return { tier: req.reach, derived: false };
  return { tier: classifyReach(req, null), derived: true };
}

/**
 * Resolve a plan row against the workbook. `workbook.Plan[N]` is plan row N with the header at
 * index 0 — verified against data/curriculum/50.json, which carries `"i": 50` for the topic at
 * plan row 51. Off by one here cites the wrong topic in every sentence this file renders.
 */
function planRow(workbook: Workbook, row: number | null): PlanRowRef | null {
  if (row === null || !Number.isInteger(row) || row < 1 || row >= workbook.Plan.length) return null;
  const r: PlanRow | undefined = workbook.Plan[row];
  if (!r) return null;
  return {
    row,
    track: String(r[0] ?? ""),
    topic: String(r[2] ?? ""),
    month: Number(r[1] || 0),
    hours: Number(r[13] || 0),
    status: normStatus(r[15]) || "not started",
  };
}

const citeRow = (ref: PlanRowRef) => `row ${ref.row}, "${ref.topic}" - ${hrs(ref.hours)}, month ${ref.month}`;

/**
 * The status of every plan row, from progress events.
 *
 * Matching is by topic string, trimmed and lowercased, exactly as app/page.tsx matches
 * `/api/progress` against the plan — one matcher, or the tab and the tab's own readiness number
 * disagree about which rows are done. First event wins because /api/progress returns newest
 * first; a second event for the same topic is the older history of that row.
 *
 * `cutoff` is what makes a week-ago snapshot possible without storing yesterday's insight
 * anywhere: the same event list, filtered to what had already happened by that instant. An
 * event with no timestamp is always included, so a missing field can never manufacture a move.
 *
 * Workbook column 15 is deliberately NOT consulted here. It is the committed baseline — 117
 * "Not started", 2 "Skipped", no other value ever written — so a readiness that reads it is
 * pinned at 0% for the life of the plan and looks like a bug rather than like month one. The
 * column survives only as the display fallback in `planRow`, so a skipped row still reads as
 * skipped in the marginal table.
 */
function statusByRow(progress: Progress | null, workbook: Workbook, cutoff: string | null): { rows: Map<number, string>; events: number; matched: number } {
  const rows = new Map<number, string>();
  const byTopic = new Map<string, number>();
  for (let n = 1; n < workbook.Plan.length; n++) {
    const topic = norm(workbook.Plan[n]?.[2]);
    if (topic && !byTopic.has(topic)) byTopic.set(topic, n);
  }

  const events = Array.isArray(progress?.events) ? progress.events : [];
  let matched = 0;
  for (const event of events) {
    const row = byTopic.get(norm(event?.topic));
    if (row === undefined) continue;
    matched += 1;
    const at = String(event?.at ?? event?.date ?? "").slice(0, 10);
    if (cutoff && at && at > cutoff) continue;
    if (!rows.has(row)) rows.set(row, normStatus(event?.status));
  }
  return { rows, events: events.length, matched };
}

/**
 * Readiness: Σ market share of the skills whose primary plan row is complete, over Σ market
 * share of every mapped skill.
 *
 * Weighted, not counted. `python` is 67% of core requisitions and `latency-cost` is 1%; a row
 * count calls finishing either of them the same 1/32nd of the way there, which is the wrong
 * advice at precisely the moment the advice matters. On the current corpus the denominator is
 * 490 share points across 32 asked-for skills.
 *
 * `coverage` here is the caller's asked-for slice, never the raw benchmark rows: a skill at 0%
 * share adds 0 to both sides of the fraction, so it cannot change the percentage, and listing it
 * in `evidenced` would credit a clearing that bought nothing.
 */
function readinessOf(coverage: CoverageEntry[], done: (row: number | null) => boolean) {
  let evidencedWeight = 0;
  let totalWeight = 0;
  const evidenced: SkillWeight[] = [];
  for (const entry of coverage) {
    totalWeight += entry.pct;
    if (!done(entry.primaryRow)) continue;
    evidencedWeight += entry.pct;
    evidenced.push({ id: entry.id, label: entry.label, pct: entry.pct });
  }
  return { evidencedWeight, totalWeight, evidenced, pct: pctOf(evidencedWeight, totalWeight) };
}

/**
 * Compute the whole insight.
 *
 * `benchmark` is passed rather than recomputed: it already owns the skill shares, the coverage
 * rows and the cold-start and partial-scan decisions, and a second copy of any of those would
 * be a second thing to keep in sync. `index` is still needed because reachability and segments
 * are per-requisition questions and the benchmark has already aggregated them away.
 */
export function computeInsight(
  index: MarketIndex,
  benchmark: Benchmark,
  progress: Progress | null,
  workbook: Workbook,
  trend: TrendPoint[] | null,
  now: Date,
): Insight {
  const day = iso(now);
  const coverage = benchmark.coverage;

  // -------------------------------------------------------------------------
  // 1. Readiness, and the marginal table that is the actual deliverable.
  // -------------------------------------------------------------------------

  /**
   * The skills the market actually asks for, which is not every skill the benchmark emits.
   *
   * `computeBenchmark` renders a coverage row for every skill in data/market-skill-map.json,
   * including the ones no live requisition mentions — `async-comms` and `llm-as-judge` are both
   * at 0% on the current corpus. That is correct THERE: a mapped skill that nothing asks for is
   * a finding about the plan. It is wrong in everything below, because everything below prices
   * STUDY, and clearing a skill with no demand behind it buys exactly nothing.
   *
   * Left unfiltered it produced marginal row 80: one skill, +0 readiness, a whole ranked "study
   * this next" row whose entire content was the absence of demand. And it listed `llm-as-judge`
   * beside `evals` on row 59, which reads as a row that clears two things the market pays for
   * when it clears one.
   *
   * Filtering here rather than in the tab because the tab is one of four consumers — the weekly
   * email, /api/ask, the MCP market tools and insight.json itself all read these same rows, and
   * a row's worth is not a rendering question.
   *
   * The readiness PERCENTAGE cannot move as a result: a 0% skill contributes 0 to both
   * `evidencedWeight` and `totalWeight`. Only the counts change, and they change toward the
   * truth — "0 of 32 skills cleared" is the goal; "0 of 34" counts two nobody is hiring for.
   * The test pins the percentage across this filter, so if it ever moves, the defect is
   * elsewhere and this is where it surfaces.
   */
  const asked = coverage.filter((entry) => entry.pct > 0);

  const weekAgo = iso(new Date(now.getTime() - VELOCITY_MIN_DAYS * 864e5));
  const current = statusByRow(progress, workbook, null);
  const before = statusByRow(progress, workbook, weekAgo);
  const isDone = (rows: Map<number, string>) => (row: number | null) => row !== null && DONE_STATUSES.has(rows.get(row) ?? "");

  const nowReady = readinessOf(asked, isDone(current.rows));
  const thenReady = readinessOf(asked, isDone(before.rows));

  /**
   * Every incomplete plan row that carries a skill, with the readiness it would buy.
   *
   * Grouped by row rather than by skill because a row is the unit of work: row 53 carries
   * `agents`, `multi-agent`, `agent-memory` and `human-in-the-loop`, and four separate lines
   * would understate it four times over and rank it below rows worth less than it. A completed
   * row cannot appear — its skills are already in the numerator, so its gain is empty and the
   * group is never created. Nor can a row whose only skills sit at 0% share: `asked` never hands
   * one over, so no group is created for it at all.
   */
  const byRow = new Map<number, SkillWeight[]>();
  for (const entry of asked) {
    if (entry.primaryRow === null || isDone(current.rows)(entry.primaryRow)) continue;
    const held = byRow.get(entry.primaryRow) ?? [];
    held.push({ id: entry.id, label: entry.label, pct: entry.pct });
    byRow.set(entry.primaryRow, held);
  }

  const marginal: MarginalEntry[] = [];
  for (const [row, skills] of byRow) {
    const ref = planRow(workbook, row);
    if (!ref) continue;
    const gainWeight = skills.reduce((n, s) => n + s.pct, 0);
    // A row that buys nothing is not a move, and ranking it is noise. `asked` already makes this
    // unreachable, and it stays because the two rules are independent: the sort below orders on
    // `gainWeight`, so a zero can only ever be last, and "last" is where a reader looks for the
    // cheapest remaining move rather than for a row that does not exist.
    //
    // Tested on `gainWeight`, never on `gainPoints`. Rows 61 and 65 each carry a 1% skill and
    // round to +0 readiness against a 490-point denominator; they are real demand and real work,
    // and dropping them would delete the market's tail rather than its absence.
    if (gainWeight === 0) continue;
    const to = pctOf(nowReady.evidencedWeight + gainWeight, nowReady.totalWeight);
    marginal.push({
      row,
      topic: ref.topic,
      hours: ref.hours,
      month: ref.month,
      status: current.rows.get(row) ?? ref.status,
      skills,
      gainWeight,
      from: nowReady.pct,
      to,
      gainPoints: to - nowReady.pct,
      statement:
        `NEXT - ${citeRow(ref)}: readiness ${nowReady.pct}% to ${to}% (${signed(to - nowReady.pct)}).` +
        ` Clears ${skills.map((s) => `${s.label} (${s.pct}%)`).join(", ")}. Status: ${current.rows.get(row) ?? ref.status}.`,
    });
  }
  // Ranked on the unrounded share points, then by row, so two rows that both round to +9 keep
  // a stable and truthful order instead of trading places between runs.
  marginal.sort((a, b) => b.gainWeight - a.gainWeight || a.row - b.row);

  const readiness: Readiness = {
    pct: nowReady.pct,
    evidencedWeight: nowReady.evidencedWeight,
    totalWeight: nowReady.totalWeight,
    evidenced: nowReady.evidenced,
    // The skills with demand behind them, not every mapped skill. `coverage.length` was 34 while
    // two of those rows were at 0% share, so the statement read "0 of 34 cleared" against a goal
    // of 32 — and the Market tab's own coverage table, which filters pct > 0, printed 32 rows
    // directly beneath it. The weighted denominator is untouched by this: 0% adds 0 either way.
    skillCount: asked.length,
    weekAgoPct: thenReady.pct,
    deltaPoints: nowReady.pct - thenReady.pct,
    eventCount: current.events,
    matchedCount: current.matched,
    marginal,
    statement:
      `READINESS - ${nowReady.pct}% of the market you can evidence today: ${nowReady.evidencedWeight} of ${nowReady.totalWeight} share points,` +
      ` ${plural(nowReady.evidenced.length, "skill", "skills")} of ${asked.length} cleared, weighted by how often the market asks for each.` +
      ` From ${plural(current.matched, "progress event", "progress events")} matched to a plan row, not from the workbook baseline.` +
      `\nA low number is the expected month-one reading, not a failure — rank by the marginal gains, not by this.`,
  };

  // -------------------------------------------------------------------------
  // 2. Reachability, in five mutually exclusive tiers that sum to the core count.
  // -------------------------------------------------------------------------

  const core = distinctCore(index);
  const coreCount = core.length;
  const totalCompanies = companiesOf(core);
  const tierOfReq = new Map<ReqRecord, ReachTier>();
  let derivedCount = 0;
  // Tier from the whole clone group, not from the representative. See bestTierByKey.
  const bestTier = bestTierByKey(index, (r) => tierOf(r).tier);
  for (const req of core) {
    const { tier, derived } = tierOf(req);
    tierOfReq.set(req, bestTier.get(dedupeKey(req.company, req.title))?.tier ?? tier);
    if (derived) derivedCount += 1;
  }
  const inTier = (reqs: ReachableReq[], tier: ReachTier) => reqs.filter((r) => tierOfReq.get(r) === tier);

  /** Built once and reused for the whole-market table and for every segment's mix. */
  const reachTable = (reqs: ReachableReq[]): ReachEntry[] =>
    REACH_TIERS.map((tier) => {
      const hit = inTier(reqs, tier);
      const companies = companiesOf(hit);
      return {
        tier,
        // reach.ts owns the wording as well as the rule, so the tier a requisition landed in
        // and the sentence explaining why cannot drift apart across two files.
        label: REACH_LABELS[tier],
        count: hit.length,
        pct: pctOf(hit.length, reqs.length),
        companies,
        statement: `${tier} - ${pctOf(hit.length, reqs.length)}% of core FDE requisitions: ${pair(hit.length, reqs.length, companies, companiesOf(reqs))}.\n${sentence(REACH_LABELS[tier])}.`,
      };
    });

  const tiers = reachTable(core);
  const reachable = core.filter((r) => REACHABLE_TIERS.includes(tierOfReq.get(r)!));
  const reachableCount = reachable.length;
  const reachableCompanies = companiesOf(reachable);

  // The wider slice: no international move, a domestic one allowed. Skill shares are recomputed
  // over THIS rather than over the five no-move reqs, because a percentage of five is noise --
  // one requisition moves it twenty points -- and the column exists to inform study decisions.
  const inIndia = core.filter((r) => IN_INDIA_TIERS.includes(tierOfReq.get(r)!));
  const inIndiaCount = inIndia.length;
  const inIndiaCompanies = companiesOf(inIndia);

  /**
   * Every headline share, recomputed inside the reachable slice.
   *
   * The denominator is `reachableCount` and nothing else, so an out-of-reach requisition cannot
   * contribute a hit to a number the tab labels reachable. The two columns disagreeing is the
   * point of printing both: a skill can be 42% of a market that is mostly American on-site and
   * a different number entirely among the roles that can be done from Pune, and only the second
   * one is a study decision.
   */
  // Named, so the tab can print a company and a title instead of a share of eleven. Sorted by
  // tier first (REACH_TIERS is best-reachable-first) so the roles needing no move at all lead.
  const roles: ReachRole[] = inIndia
    .map((r) => {
      const tier = tierOfReq.get(r)!;
      // From the clone that earned the tier, so the location shown never contradicts it.
      const won = bestTier.get(dedupeKey(r.company, r.title));
      return {
        company: r.company,
        title: r.title,
        location: (won?.tier === tier ? won.location : r.location) || "",
        url: (won?.tier === tier ? won.url : r.url) || r.url,
        tier,
        tierLabel: REACH_LABELS[tier],
        statement: `${r.company} - ${r.title}${(won?.tier === tier ? won.location : r.location) ? `, ${won?.tier === tier ? won.location : r.location}` : ""}`,
      };
    })
    .sort((a, b) =>
      REACH_TIERS.indexOf(a.tier) - REACH_TIERS.indexOf(b.tier) ||
      (a.company < b.company ? -1 : a.company > b.company ? 1 : 0) ||
      (a.title < b.title ? -1 : 1));

  const skills: ReachSkillEntry[] = coverage.map((entry) => {
    const hit = inIndia.filter((r) => r.skills !== null && r.skills.includes(entry.id));
    const reachablePct = pctOf(hit.length, inIndiaCount);
    const companies = companiesOf(hit);
    return {
      id: entry.id,
      label: entry.label,
      marketPct: entry.pct,
      reachablePct,
      hits: hit.length,
      reqs: inIndiaCount,
      companies,
      totalCompanies: inIndiaCompanies,
      deltaPoints: reachablePct - entry.pct,
      statement:
        `${entry.label} - ${entry.pct}% of the whole core market, ${reachablePct}% of the market you can take without leaving India:` +
        ` ${pair(hit.length, inIndiaCount, companies, inIndiaCompanies)}.`,
    };
  });
  skills.sort((a, b) => b.reachablePct - a.reachablePct || b.hits - a.hits || (a.id < b.id ? -1 : 1));

  const byTier = new Map(tiers.map((t) => [t.tier, t]));
  const reachability: Reachability = {
    coreCount,
    tiers,
    reachableCount,
    reachablePct: pctOf(reachableCount, coreCount),
    reachableCompanies,
    inIndiaCount,
    inIndiaPct: pctOf(inIndiaCount, coreCount),
    inIndiaCompanies,
    roles,
    derivedCount,
    skills,
    statement:
      `REACH - ${reachableCount} of ${coreCount} core requisitions need no move at all (${pctOf(reachableCount, coreCount)}%),` +
      ` across ${plural(reachableCompanies, "company", "companies")}: ${byTier.get("india-remote")!.count} remote from India,` +
      ` ${byTier.get("emea-apac-remote")!.count} remote within EMEA/APAC.` +
      ` ${inIndiaCount} of ${coreCount} (${pctOf(inIndiaCount, coreCount)}%) are takeable without leaving India, across` +
      ` ${plural(inIndiaCompanies, "company", "companies")}, adding ${byTier.get("india-office")!.count} in an Indian office.` +
      ` Beyond that, ${byTier.get("relocate-sponsor")!.count} need relocation and sponsorship and ${byTier.get("out-of-reach")!.count} are out of reach.` +
      (derivedCount > 0
        ? `\n${derivedCount} of ${coreCount} were tiered from the location string alone. Visa and clearance language lives in the JD body and is` +
          ` extracted at scan time; where that is absent, the out-of-reach count is a floor and the relocate tier is its ceiling.`
        : ""),
  };

  // -------------------------------------------------------------------------
  // 3. Segments — the market is five markets, and they are not equally takeable.
  // -------------------------------------------------------------------------

  const segmentOf = (req: ReqRecord): SegmentId => SEGMENT_BY_COMPANY[req.company] ?? "other";
  const segments: SegmentEntry[] = [];
  for (const id of [...Object.keys(SEGMENT_LABEL)] as SegmentId[]) {
    const reqs = core.filter((r) => segmentOf(r) === id);
    // `other` is emitted only when a company genuinely fell through the table, so an empty
    // catch-all never appears in a ranked fit list. The five real segments always render, at
    // zero if need be — a segment that has emptied out this week is itself the finding.
    if (id === "other" && !reqs.length) continue;

    /**
     * Readiness against this segment's demand, not the whole market's. Weighted by the share
     * each skill has HERE: `python` is a different fraction of Databricks' reqs than of
     * Sierra's, and a segment fit list computed on global weights would rank every segment in
     * the same order as the global readiness and say nothing.
     */
    let segEvidenced = 0;
    let segTotal = 0;
    const segSkills: SkillWeight[] = [];
    for (const entry of coverage) {
      const hits = reqs.filter((r) => r.skills !== null && r.skills.includes(entry.id)).length;
      const share = pctOf(hits, reqs.length);
      if (share > 0) segSkills.push({ id: entry.id, label: entry.label, pct: share });
      segTotal += share;
      if (isDone(current.rows)(entry.primaryRow)) segEvidenced += share;
    }
    segSkills.sort((a, b) => b.pct - a.pct || (a.id < b.id ? -1 : 1));
    const topSkills = segSkills.slice(0, 5);

    const segReachable = reqs.filter((r) => IN_INDIA_TIERS.includes(tierOfReq.get(r)!));
    const readinessPct = pctOf(segEvidenced, segTotal);
    const companies = [...new Set(reqs.map((r) => r.company))].sort();
    segments.push({
      id,
      label: SEGMENT_LABEL[id],
      rank: 0,
      companies,
      count: reqs.length,
      sharePct: pctOf(reqs.length, coreCount),
      reachableCount: segReachable.length,
      reachablePct: pctOf(segReachable.length, reqs.length),
      reach: reachTable(reqs),
      topSkills,
      readinessPct,
      statement:
        `SEGMENT - ${SEGMENT_LABEL[id]}: ${pair(reqs.length, coreCount, companies.length, totalCompanies)}.` +
        ` ${segReachable.length} employable from Pune today (${pctOf(segReachable.length, reqs.length)}% of this segment).` +
        ` Readiness against this segment's own demand: ${readinessPct}%.` +
        `\nAsks most for: ${topSkills.map((s) => `${s.label} ${s.pct}%`).join(", ") || "nothing this corpus can measure"}.`,
    });
  }

  /**
   * The fit ranking, and why it is a count rather than a score.
   *
   * The obvious formula is reachability × coverage, and at month one it evaluates to zero for
   * every segment — a ranking that goes flat exactly when it is most needed. Reachable
   * requisition count is a measurement, not a composite: it already contains "60% reachable of
   * a big segment beats 5% reachable of a bigger one", and it stays meaningful all twenty
   * months. Readiness breaks ties, so as skills clear, the segment they clear for rises.
   */
  segments.sort((a, b) => b.reachableCount - a.reachableCount || b.readinessPct - a.readinessPct || b.count - a.count || (a.id < b.id ? -1 : 1));
  segments.forEach((segment, i) => { segment.rank = i + 1; });

  // -------------------------------------------------------------------------
  // 4. Velocity — two points, seven days, or nothing at all.
  // -------------------------------------------------------------------------

  const velocity = ((): Velocity => {
    const points = (trend ?? []).filter((p) => p && typeof p.d === "string").slice().sort((a, b) => (a.d < b.d ? -1 : 1));
    const empty = { available: false, points: points.length, from: null, to: null, spanDays: 0, coreFrom: null, coreTo: null, coreDelta: null, skills: [] };
    if (points.length < 2) {
      return { ...empty, statement: `VELOCITY - ${plural(points.length, "scan", "scans")} recorded. Velocity needs two scans a week apart; it starts next week.` };
    }

    const to = points[points.length - 1];
    // The most recent point at least a week old, not the oldest one: the window should measure
    // the last week of the market, and against a six-month-old point every skill has "moved".
    const from = [...points].reverse().find((p) => daysBetween(p.d, to.d) >= VELOCITY_MIN_DAYS) ?? null;
    if (!from) {
      const span = daysBetween(points[0].d, to.d);
      return {
        ...empty,
        statement: `VELOCITY - ${plural(points.length, "scan", "scans")} spanning ${plural(span, "day", "days")}. Velocity needs ${VELOCITY_MIN_DAYS}; nothing is interpolated.`,
      };
    }

    const spanDays = daysBetween(from.d, to.d);
    const moved: VelocitySkill[] = [];
    for (const entry of coverage) {
      const was = from.s?.[entry.id];
      const is = to.s?.[entry.id];
      // A skill absent from the earlier point is skipped rather than treated as having been at
      // 0%: adding a skill to the map is not a movement in the market.
      if (typeof was !== "number" || typeof is !== "number") continue;
      const fromPct = Math.round(was * 100);
      const toPct = Math.round(is * 100);
      const delta = toPct - fromPct;
      const crossed = BANDS.find((b) => (fromPct < b && toPct >= b) || (fromPct >= b && toPct < b)) ?? null;
      if (Math.abs(delta) < MOVE_MIN_POINTS && crossed === null) continue;
      moved.push({
        id: entry.id,
        label: entry.label,
        from: fromPct,
        to: toPct,
        delta,
        crossed,
        statement: `${entry.label} ${fromPct}% to ${toPct}% (${signed(delta)})${crossed !== null ? `, crossing ${crossed}%` : ""}`,
      });
    }
    moved.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || (a.id < b.id ? -1 : 1));

    const coreDelta = to.core - from.core;
    return {
      available: true,
      points: points.length,
      from: from.d,
      to: to.d,
      spanDays,
      coreFrom: from.core,
      coreTo: to.core,
      coreDelta,
      skills: moved,
      statement:
        `VELOCITY - ${plural(spanDays, "day", "days")}, ${from.d} to ${to.d}: the core market went ${from.core} to ${to.core} requisitions (${signed(coreDelta)}).` +
        (moved.length ? `\n${moved.map((m) => m.statement).join(". ")}.` : `\nNo skill moved ${MOVE_MIN_POINTS} points or crossed a band.`),
    };
  })();

  // -------------------------------------------------------------------------
  // 5. Flags — deterministic, model-free, and suppressed on the runs the benchmark suppresses.
  // -------------------------------------------------------------------------

  const flags: Flag[] = [];
  if (Math.abs(readiness.deltaPoints) >= READINESS_FLAG_POINTS) {
    flags.push({
      kind: "readiness",
      id: "readiness",
      statement: `FLAG - readiness moved ${signed(readiness.deltaPoints)} points in the last ${VELOCITY_MIN_DAYS} days, ${readiness.weekAgoPct}% to ${readiness.pct}%.`,
    });
  }

  /**
   * A new requisition you could take from Pune today is the one market event worth an
   * interruption, so it is the one that gets a flag of its own.
   *
   * `benchmark.baseline` and `benchmark.movement.suppressed` are read rather than re-derived:
   * computeBenchmark has already resolved the cold start (where every req is new and a flag per
   * req would train you to ignore flags) and the partial scan (where "new" is indistinguishable
   * from "not fetched yet"), and a second copy of DELTA_MIN_BOARDS here would be a threshold to
   * keep in sync with no test holding the two together.
   */
  if (!benchmark.baseline && !benchmark.movement.suppressed) {
    for (const req of core) {
      if (req.firstSeen !== day || tierOfReq.get(req) !== "india-remote") continue;
      flags.push({
        kind: "new-india-remote",
        id: dedupeKey(req.company, req.title),
        statement: `FLAG - new requisition you can take from India today: ${[req.company, req.title, req.location].filter(Boolean).join(", ")}.`,
      });
    }
  }

  for (const skill of velocity.skills) {
    if (skill.crossed === null) continue;
    flags.push({
      kind: "band-crossing",
      id: skill.id,
      statement: `FLAG - ${skill.label} crossed the ${skill.crossed}% band, ${skill.from}% to ${skill.to}%.`,
    });
  }

  return {
    computedAt: now.toISOString(),
    day,
    readiness,
    reachability,
    segments,
    velocity,
    flags,
    // Filled by the cron after this returns, never here. This module does not call a model.
    quaere: null,
  };
}
