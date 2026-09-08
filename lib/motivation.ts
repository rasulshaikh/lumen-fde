/**
 * The motivation layer: two computations over data that already exists, and no third one.
 *
 * The plan is 1,588 hours across 23 months and the failure mode over that horizon is quiet
 * abandonment, not missing information. So this module answers exactly two questions:
 *
 *  1. `computeStreak` — how often the work is actually happening, in a shape that CANNOT
 *     report a loss.
 *  2. `computeEvidence` — what finishing one row bought, in market share, priced by numbers
 *     the market modules already computed.
 *
 * Pure, for the same reason `lib/market/insight.ts` is: `now` is a parameter, there is no
 * network, no filesystem and no `Date.now()`, so every sentence below can be exercised against
 * a fixture. A motivational number that can only be produced by a live scan is one nobody
 * checks, and one nobody checks is one nobody trusts.
 *
 * Three rules shape everything here, each of which produces something harmful if broken:
 *
 *  1. NO CHAIN, AND NO BROKEN-STREAK STATE. There is no "current streak" field, because there
 *     is no field here that can go to zero and read as a loss. A 40-day chain rendered as
 *     broken is a plausible quit trigger in month 12, which is the outcome this whole layer
 *     exists to prevent. What is reported instead is a RATE, which dips, and a LONGEST RUN,
 *     which is a maximum over an append-only history and therefore only ever increases.
 *  2. IT DOES NOT CONSOLE EITHER. The product never flatters; the same rule forbids softening.
 *     A five-day gap renders "Back after 5 days." — the fact, stated once, with no adverb and
 *     no reassurance attached. "Only 5 days" and "don't worry" are the same defect as "great
 *     work": both are the module having an opinion about a number it measured.
 *  3. MARKET NUMBERS ARE CONSUMED, NEVER RECOMPUTED. `computeEvidence` reads
 *     `insight.readiness.marginal`, whose whole purpose is "what would this row buy", and
 *     `benchmark.coverage`, which owns every share and every denominator pair. A second
 *     arithmetic path to a readiness percentage would be a second number to keep in sync, and
 *     the two would disagree on the day it mattered.
 *
 * Everything is rendered here, as `statement` strings, because four consumers read this — the
 * homepage, the weekly email, /api/ask and the MCP tools — and a sentence assembled four times
 * is a sentence that says four different things.
 */
import type { Benchmark } from "./market/benchmark";
import type {
  Insight,
  PlanRowRef,
  Progress,
  ReachRole,
  SkillWeight,
} from "./market/insight";
import type { MarketIndex } from "./market/store";

/**
 * The rate window. Three weeks, not seven days: a week is short enough that one flu, one work
 * crunch or one holiday halves the number, and a rate that swings 50 points on a normal week is
 * a rate that gets ignored. It is a default rather than a constant because the weekly email and
 * the homepage may reasonably want different windows over the same history.
 */
export const STREAK_WINDOW_DAYS = 21;

/**
 * A gap is two or more days between events, so studying on consecutive days is never described
 * as a return. One day is the ordinary rhythm of a plan with rest days in it.
 */
export const GAP_DAYS = 2;

const DAY_MS = 864e5;
const iso = (now: Date) => now.toISOString().slice(0, 10);
const dayNumber = (day: string) => Math.round(Date.parse(`${day}T00:00:00Z`) / DAY_MS);
const pctOf = (hits: number, total: number) => (total > 0 ? Math.round((hits / total) * 100) : 0);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const signed = (n: number) => `${n > 0 ? "+" : ""}${n}`;
const hrs = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)}h`;

/**
 * The denominator pair, always carried as a pair — the same rule `benchmark.ts` enforces and
 * the same helper, copied because it is not exported and this file may not edit that one.
 */
const pair = (hits: number, reqs: number, companies: number, totalCompanies: number) =>
  `${hits} of ${reqs} reqs, across ${companies} of ${totalCompanies} companies`;

/** The plan-row citation used verbatim across the market modules, so one row reads one way. */
const citeRow = (ref: PlanRowRef) => `row ${ref.row}, "${ref.topic}" - ${hrs(ref.hours)}, month ${ref.month}`;

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// ---------------------------------------------------------------------------
// 1. Study rhythm — a rate and a maximum, and nothing that can be lost.
// ---------------------------------------------------------------------------

export type Streak = {
  day: string;
  /** The rate window, in days, ending today inclusive. */
  windowDays: number;
  /** Distinct days inside the window carrying at least one progress event. */
  activeDays: number;
  ratePct: number;
  /** Distinct active days over the whole history, which is what the run is measured against. */
  totalActiveDays: number;
  firstDay: string | null;
  lastDay: string | null;
  /**
   * The longest run of consecutive active days ever recorded. A maximum over an append-only
   * history: adding events can only extend a run or start a new one, and time passing adds no
   * events at all, so this number cannot fall. That is the entire reason it is the run reported
   * rather than the current one.
   */
  longestRunDays: number;
  longestRunFrom: string | null;
  longestRunTo: string | null;
  /** 0 when there is an event today. `null` only when no event carries a usable date. */
  daysSinceLast: number | null;
  /** The gap that preceded the most recent active day, when it was GAP_DAYS or wider. */
  returnedAfterDays: number | null;
  eventCount: number;
  /** Events carrying a parseable day. A gap between the two counts is a malformed record. */
  datedCount: number;
  rateStatement: string;
  runStatement: string;
  recencyStatement: string;
  statement: string;
};

/**
 * The distinct days on which something was recorded, newest-first input or oldest-first alike.
 *
 * Status is deliberately NOT filtered. A "not_started" event is still an interaction with the
 * plan on that day, and more importantly the store is append-only and carries corrections —
 * reports/progress currently holds an event that reverts a topic and a later one that undoes
 * it. Deciding which of those "counts as studying" is a judgement this module has no basis for,
 * and a rhythm that disagrees with the history the store kept is worse than a blunt one.
 *
 * Days after `today` are dropped. A clock-skewed future event would otherwise inflate the run
 * and make `daysSinceLast` negative.
 */
function activeDaysOf(progress: Progress | null, today: string): { days: string[]; events: number; dated: number } {
  const events = Array.isArray(progress?.events) ? progress!.events : [];
  const seen = new Set<string>();
  let dated = 0;
  for (const event of events) {
    const day = String(event?.at ?? event?.date ?? "").slice(0, 10);
    if (!DAY_PATTERN.test(day)) continue;
    dated += 1;
    if (day > today) continue;
    seen.add(day);
  }
  return { days: [...seen].sort(), events: events.length, dated };
}

/**
 * The study rhythm.
 *
 * Read the field list before adding to it: there is no `currentRunDays` and no `active` boolean,
 * and neither is an oversight. Every number here either rises with work (`longestRunDays`,
 * `totalActiveDays`) or is a rate that moves in both directions without ever standing for a
 * forfeit (`ratePct`). Adding a chain would put a quit trigger in the return value, and no
 * amount of careful rendering downstream would take it back out.
 */
export function computeStreak(progress: Progress | null, now: Date, windowDays: number = STREAK_WINDOW_DAYS): Streak {
  const day = iso(now);
  const { days, events, dated } = activeDaysOf(progress, day);
  const today = dayNumber(day);
  const nums = days.map(dayNumber);

  const windowStart = today - windowDays + 1;
  const activeDays = nums.filter((n) => n >= windowStart).length;
  const ratePct = pctOf(activeDays, windowDays);

  // The longest run: one pass over the sorted days. Consecutive means exactly one day apart.
  let longestRunDays = 0;
  let longestRunFrom: string | null = null;
  let longestRunTo: string | null = null;
  let runStart = 0;
  for (let i = 0; i < nums.length; i++) {
    if (i > 0 && nums[i] - nums[i - 1] !== 1) runStart = i;
    const length = i - runStart + 1;
    if (length > longestRunDays) {
      longestRunDays = length;
      longestRunFrom = days[runStart];
      longestRunTo = days[i];
    }
  }

  const lastDay = days.length ? days[days.length - 1] : null;
  const daysSinceLast = lastDay === null ? null : today - dayNumber(lastDay);
  const priorGap = days.length > 1 ? nums[nums.length - 1] - nums[nums.length - 2] : null;
  const returnedAfterDays = priorGap !== null && priorGap >= GAP_DAYS ? priorGap : null;

  const rateStatement = `Studied ${activeDays} of the last ${windowDays} days (${ratePct}%).`;
  const runStatement = longestRunDays > 0
    ? `Longest run ${plural(longestRunDays, "day", "days")}, ${longestRunFrom} to ${longestRunTo}.`
    : `No dated progress event yet.`;

  /**
   * Recency, in the one order that cannot be read as a scolding: the elapsed days are stated,
   * the date they are measured from is stated, and nothing is added. "Back after 5 days" is the
   * return case and it is a report, not a welcome.
   */
  const recencyStatement = daysSinceLast === null
    ? (events > 0 ? `No progress event carries a date.` : `No progress events recorded.`)
    : daysSinceLast === 0
      ? (returnedAfterDays !== null ? `Back after ${plural(returnedAfterDays, "day", "days")}.` : `Last event today.`)
      : `${plural(daysSinceLast, "day", "days")} since the last event, ${lastDay}.`;

  return {
    day,
    windowDays,
    activeDays,
    ratePct,
    totalActiveDays: days.length,
    firstDay: days.length ? days[0] : null,
    lastDay,
    longestRunDays,
    longestRunFrom,
    longestRunTo,
    daysSinceLast,
    returnedAfterDays,
    eventCount: events,
    datedCount: dated,
    rateStatement,
    runStatement,
    recencyStatement,
    statement: `STUDY - ${rateStatement} ${runStatement} ${recencyStatement}`,
  };
}

// ---------------------------------------------------------------------------
// 2. Evidence — what completing one row actually bought.
// ---------------------------------------------------------------------------

/**
 * Why the row bought what it bought, so a caller never has to infer it from an empty list.
 *
 * `no-mapped-skill` is the case that must not be papered over: 119 of the plan's rows exist,
 * the skill map names far fewer as a primary row, and a row outside that set clears no market
 * share at all. Reporting a benefit there would be inventing one, and the first invented
 * benefit is the one that makes every real one unbelievable.
 */
export type EvidenceBasis = "cleared" | "already-evidenced" | "no-mapped-skill";

export type Evidence = {
  day: string;
  row: number;
  topic: string;
  hours: number;
  month: number;
  basis: EvidenceBasis;
  /** Readiness before and after, both straight from the marginal entry for this row. */
  fromPct: number;
  toPct: number;
  gainPoints: number;
  /** The skills this row clears, highest market share first. Empty unless `cleared`. */
  skills: SkillWeight[];
  /** The one the sentence names: the largest share. */
  skill: SkillWeight | null;
  /** That skill's share of core requisitions, with both denominators, from the benchmark. */
  share: { hits: number; reqs: number; companies: number; totalCompanies: number } | null;
  /** A reachable requisition that asks for a cleared skill, when one exists. Otherwise null. */
  role: ReachRole | null;
  roleSkill: SkillWeight | null;
  statement: string;
};

/**
 * The first reachable requisition asking for any of the cleared skills.
 *
 * Roles are scanned in `insight.reachability.roles` order, which is best-tier first, so a
 * requisition needing no move at all outranks one needing a domestic move even when the second
 * asks for a bigger skill. Within a role the largest cleared skill wins. The lookup is exact
 * company + title because that is where the roles came from: every entry in `roles` is a core
 * requisition of this index, and its `skills` are the fingerprint stored at scan time.
 *
 * `index` may be null — the weekly email has the insight without the 450 KB index — and then
 * no role is named. Nothing is fabricated in its place and no sentence is emitted about it,
 * because "no matching role" is not a fact about the work that was just finished.
 */
function namedRole(insight: Insight, index: MarketIndex | null, skills: SkillWeight[]): { role: ReachRole | null; skill: SkillWeight | null } {
  if (!index || !skills.length) return { role: null, skill: null };
  const asks = new Map<string, Set<string>>();
  for (const req of Object.values(index.reqs)) {
    if (!req.skills) continue;
    const key = `${req.company} ${req.title}`;
    const held = asks.get(key) ?? new Set<string>();
    for (const id of req.skills) held.add(id);
    asks.set(key, held);
  }
  for (const role of insight.reachability.roles) {
    const held = asks.get(`${role.company} ${role.title}`);
    if (!held) continue;
    const hit = skills.find((s) => held.has(s.id));
    if (hit) return { role, skill: hit };
  }
  return { role: null, skill: null };
}

/**
 * Price one completed row against the market.
 *
 * `insight` must be the one computed BEFORE the row moved to done — that is where the marginal
 * table lives, and the marginal table is already exactly this calculation: `from` is readiness
 * today, `to` is readiness once this row's skills are evidenced. Running it forward is the
 * whole of the arithmetic here, which is why there is none. The test pins that equivalence by
 * recomputing the insight with the row marked done and asserting the two agree.
 *
 * `row` is passed by the caller rather than looked up because the caller — the plan table, or
 * the POST that recorded the event — already holds it, and `planRow` is private to benchmark.ts.
 */
export function computeEvidence(
  benchmark: Benchmark,
  insight: Insight,
  row: PlanRowRef,
  index: MarketIndex | null,
  now: Date,
): Evidence {
  const day = iso(now);
  const entry = insight.readiness.marginal.find((m) => m.row === row.row) ?? null;
  // Sorted by share so the sentence names the skill that carries the most demand, ties by id so
  // two skills at the same percentage do not trade places between runs.
  const skills = entry ? [...entry.skills].sort((a, b) => b.pct - a.pct || (a.id < b.id ? -1 : 1)) : [];
  const skill = skills[0] ?? null;

  /**
   * No marginal entry has two possible causes and they are different facts. Either the market
   * map names this row as the primary row of a skill the market asks for — in which case the
   * row was already evidenced by an earlier event and readiness cannot move again — or it does
   * not, and there was never any share to clear. Collapsing them would report the second as the
   * first and quietly credit work the market does not pay for.
   */
  const mapped = benchmark.coverage.some((c) => c.primaryRow === row.row && c.pct > 0);
  const basis: EvidenceBasis = entry ? "cleared" : mapped ? "already-evidenced" : "no-mapped-skill";

  const fromPct = insight.readiness.pct;
  const toPct = entry ? entry.to : fromPct;
  const cover = skill ? benchmark.coverage.find((c) => c.id === skill.id) ?? null : null;
  const share = cover
    ? { hits: cover.hits, reqs: cover.reqs, companies: cover.companies, totalCompanies: cover.totalCompanies }
    : null;
  const named = namedRole(insight, index, skills);

  const head = `EVIDENCE - ${citeRow(row)}`;
  const statement = basis === "cleared"
    ? `${head}: readiness ${fromPct}% to ${toPct}% (${signed(toPct - fromPct)}).` +
      `\nCleared ${skills.map((s) => `${s.label} (${s.pct}%)`).join(", ")}.` +
      (skill && share
        ? `\n${skill.label} is ${skill.pct}% of the core market: ${pair(share.hits, share.reqs, share.companies, share.totalCompanies)}.`
        : "") +
      (named.role && named.skill
        ? `\nAsked for by ${named.role.statement} (${named.role.tierLabel}).`
        : "")
    : basis === "already-evidenced"
      ? `${head}: readiness unchanged at ${fromPct}%.` +
        `\nThe skills this row carries were already evidenced by an earlier progress event, so finishing it clears no further market share.`
      : `${head}: readiness unchanged at ${fromPct}%.` +
        `\nNo skill of the ${insight.readiness.skillCount} the market asks for names row ${row.row} as its primary row, so this row buys no market share.` +
        `\nIt may still be a support row for a skill cleared elsewhere; readiness credits the primary row only.`;

  return {
    day,
    row: row.row,
    topic: row.topic,
    hours: row.hours,
    month: row.month,
    basis,
    fromPct,
    toPct,
    gainPoints: entry ? entry.gainPoints : 0,
    skills,
    skill,
    share,
    role: named.role,
    roleSkill: named.skill,
    statement,
  };
}
