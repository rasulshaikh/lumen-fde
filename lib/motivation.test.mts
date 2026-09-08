/**
 * Motivation tests. Run with:  npx tsx lib/motivation.test.mts
 *
 * The market tests pin arithmetic. This file pins a PROPERTY OF THE OUTPUT: that on the worst
 * day — the one where the user opens the dashboard after a week away, in month 12 of 23 — the
 * page states a rate and a maximum and nothing that reads as a forfeit. That property has no
 * natural failure signal. A "current streak: 0" renders perfectly, throws nothing, and is
 * exactly as plausible as the correct output to anyone reading the code; it is only wrong
 * against the design constraint, which is why the assertions below read the rendered strings
 * and search them for the vocabulary of loss rather than checking a field is absent.
 *
 * So the fixtures are built around one scenario the design names explicitly — back after five
 * days, longest run twelve — and the assertions compare whole sentences, because the defect
 * being guarded against is a sentence.
 *
 * Two invariants carry the rest:
 *
 *  1. The run is a maximum over an append-only history. Time passing adds no events, so the run
 *     is asserted across three progressively later `now` values and must never fall while the
 *     rate is allowed to.
 *  2. Evidence is `insight.readiness.marginal` run forward and nothing else, so the readiness a
 *     completed row is PROMISED is asserted equal to the readiness recomputed WITH that row
 *     done. Two independent paths to one number, held together by one assertion.
 *
 * Nothing here pins a live value. Six assertions in this repo have pinned live scan output and
 * would have failed on a correct system the morning after a scan; the live section below reads
 * the real index and the real reports/progress and asserts only relationships that hold for
 * every possible corpus — printing the numbers instead of asserting them.
 */
import { readdirSync, readFileSync } from "node:fs";
import { computeBenchmark, type SkillMap, type Workbook } from "./market/benchmark.ts";
import type { SkillMap as MatcherSkillMap } from "./market/skills.ts";
import { computeInsight, type PlanRowRef, type Progress } from "./market/insight.ts";
import type { MarketIndex, TrendPoint } from "./market/store.ts";
import { computeEvidence, computeStreak, GAP_DAYS, STREAK_WINDOW_DAYS } from "./motivation.ts";

let fails = 0;
const ck = (n: string, c: boolean, x = "") => { if (!c) { fails++; console.log(`  FAIL ${n} ${x}`); } else console.log(`  ok   ${n} ${x}`); };

const root = new URL("../", import.meta.url);
const load = (p: string) => JSON.parse(readFileSync(new URL(p, root), "utf8"));

const DAY = "2026-09-08";
const NOW = new Date(`${DAY}T04:11:02Z`);
const at = (day: string) => new Date(`${day}T04:11:02Z`);

/** Events as GET /api/progress returns them: newest first, one per recorded update. */
const progressOf = (days: string[], status = "in_progress"): Progress => ({
  events: [...days].sort().reverse().map((d) => ({ topic: "Shell mastery and scripting", status, date: `${d}T09:00:00.000Z` })),
});

/**
 * The vocabulary a chain-based implementation would reach for. Searched in the rendered
 * sentences rather than in the field names, because the constraint is about what the user
 * reads. `streak` is in the list deliberately: the mechanic is called that in the design, and
 * the moment the word reaches a rendered string the concept it names has reached the page too.
 */
const LOSS = /broken|streak|reset|\block\b|lost|missed|slipped|fail|behind|don't worry|keep going|only /i;
const rendered = (s: { statement: string; rateStatement: string; runStatement: string; recencyStatement: string }) =>
  [s.statement, s.rateStatement, s.runStatement, s.recencyStatement];

// ---------------------------------------------------------------------------
// The scenario the design names: a twelve-day run in August, then a five-day gap, then today.
// ---------------------------------------------------------------------------

/**
 * 2026-08-14 to 2026-08-25 is the twelve consecutive days. 08-28, 08-29 and 09-03 are ordinary
 * scattered days after it. Then nothing from 09-04 to 09-07, and an event today — which is
 * "back after 5 days" measured 09-03 to 09-08, the exact shape the design writes out.
 *
 * Inside the 21-day window ending today (08-19 onward) that leaves 7 days of the run plus 08-28,
 * 08-29, 09-03 and 09-08: eleven of twenty-one. Counted by hand so the assertion is a claim
 * about the arithmetic and not a transcription of what the code printed.
 */
const RUN_12 = ["2026-08-14", "2026-08-15", "2026-08-16", "2026-08-17", "2026-08-18", "2026-08-19",
  "2026-08-20", "2026-08-21", "2026-08-22", "2026-08-23", "2026-08-24", "2026-08-25"];
const SCATTER = ["2026-08-28", "2026-08-29", "2026-09-03"];
const WITH_GAP = [...RUN_12, ...SCATTER, "2026-09-08"];

const back = computeStreak(progressOf(WITH_GAP), NOW);
console.log(`\n  ${back.statement}`);

ck("a five-day gap renders as a rate, a maximum and a return — the whole sentence",
  back.statement === "STUDY - Studied 11 of the last 21 days (52%). Longest run 12 days, 2026-08-14 to 2026-08-25. Back after 5 days.",
  `(${back.statement})`);
ck("the rate is days-in-window over the window, dipped but not reset",
  back.activeDays === 11 && back.ratePct === 52 && back.windowDays === STREAK_WINDOW_DAYS);
ck("the longest run is the twelve consecutive days, dated", back.longestRunDays === 12
  && back.longestRunFrom === "2026-08-14" && back.longestRunTo === "2026-08-25");
ck("the gap is reported as the days it was", back.returnedAfterDays === 5 && back.daysSinceLast === 0);

/**
 * The assertion this file exists for. Not "no broken-streak field" — no broken-streak SENTENCE,
 * and no bare zero anywhere in the four strings the page renders. A zero here would have to be
 * a count of something the user did not do.
 */
for (const [i, line] of rendered(back).entries()) {
  ck(`nothing the page renders speaks of a loss [${i}]`, !LOSS.test(line), `(${line})`);
  ck(`nothing the page renders is a zero [${i}]`, !/\b0\b/.test(line), `(${line})`);
}

/**
 * The same history, five days earlier in the return: he has not come back yet. The elapsed days
 * are stated with the date they are measured from and nothing is added — no consolation, which
 * is the same rule as no flattery. The rate has dipped by one day. The run has not moved.
 */
const away = computeStreak(progressOf([...RUN_12, ...SCATTER]), NOW);
console.log(`  ${away.statement}`);
ck("mid-gap, the elapsed days are stated as a fact and dated",
  away.recencyStatement === "5 days since the last event, 2026-09-03." && away.daysSinceLast === 5);
ck("...the run is untouched by the gap", away.longestRunDays === 12);
ck("...and the rate dipped by exactly the missing day", away.activeDays === 10 && away.ratePct === 48);
for (const [i, line] of rendered(away).entries()) {
  ck(`mid-gap, nothing renders as a loss [${i}]`, !LOSS.test(line) && !/\b0\b/.test(line), `(${line})`);
}

// ---------------------------------------------------------------------------
// The invariant: the rate may fall, the run may not.
// ---------------------------------------------------------------------------

/**
 * One history, read on three progressively later days with no new events. This is exactly what
 * abandonment looks like from inside the data, and it is where a chain implementation produces
 * its zero. The rate is allowed — required — to fall. The run is a maximum over days already
 * recorded, so nothing about the passage of time may touch it.
 */
const history = progressOf(WITH_GAP);
const later = ["2026-09-08", "2026-09-13", "2026-09-20", "2026-09-30"].map((d) => computeStreak(history, at(d)));
ck("the longest run never decreases as days pass without events",
  later.every((s) => s.longestRunDays === 12),
  `(${later.map((s) => `${s.day}:${s.longestRunDays}`).join(" ")})`);
ck("...while the rate dips monotonically",
  later.every((s, i) => i === 0 || s.ratePct <= later[i - 1].ratePct),
  `(${later.map((s) => `${s.day}:${s.ratePct}%`).join(" ")})`);
console.log(`  22 days later: ${later[3].statement}`);
ck("even three weeks silent, the run is still stated and the sentence still carries no loss",
  later[3].runStatement === "Longest run 12 days, 2026-08-14 to 2026-08-25."
    && rendered(later[3]).every((line) => !LOSS.test(line)));
ck("...and the fact of the absence is stated plainly, in days, from a date",
  later[3].recencyStatement === "22 days since the last event, 2026-09-08.", `(${later[3].recencyStatement})`);

/**
 * The other direction of the same invariant: the history only ever grows, and a longer history
 * can only lengthen a run or start a new one. Asserted over every prefix of the fixture rather
 * than at one point, so an implementation that measured the run inside the window — which would
 * shrink it as August fell out — cannot pass.
 */
let previousRun = 0;
let monotone = true;
for (let n = 1; n <= WITH_GAP.length; n++) {
  const run = computeStreak(progressOf(WITH_GAP.slice(0, n)), at("2026-09-30")).longestRunDays;
  if (run < previousRun) monotone = false;
  previousRun = run;
}
ck("appending events never shortens the longest run, at any prefix", monotone && previousRun === 12);

// ---------------------------------------------------------------------------
// Shapes the store actually produces.
// ---------------------------------------------------------------------------

const shuffled: Progress = { events: [...progressOf(WITH_GAP).events].reverse() };
ck("event order is irrelevant — the route returns newest first, a human file is oldest first",
  JSON.stringify(computeStreak(shuffled, NOW)) === JSON.stringify(back));

const twice = computeStreak(progressOf([...WITH_GAP, "2026-09-08", "2026-09-08"]), NOW);
ck("three events in one day is one active day, not three", twice.activeDays === back.activeDays && twice.eventCount === 18);

const undated = computeStreak({ events: [{ topic: "x", status: "done", date: null }, { topic: "x", status: "done" }] }, NOW);
ck("an undated event creates no day and no run", undated.totalActiveDays === 0 && undated.longestRunDays === 0
  && undated.eventCount === 2 && undated.datedCount === 0);
ck("...and says which of the two it is, rather than reading as an empty history",
  undated.recencyStatement === "No progress event carries a date." && undated.daysSinceLast === null);
ck("no events at all reads as no events, not as a zero day count",
  computeStreak(null, NOW).recencyStatement === "No progress events recorded.");

const skew = computeStreak(progressOf(["2026-09-06", "2026-12-25"]), NOW);
ck("a future-dated event cannot extend the run or make the recency negative",
  skew.totalActiveDays === 1 && skew.daysSinceLast === 2 && skew.longestRunDays === 1);

const consecutive = computeStreak(progressOf(["2026-09-07", "2026-09-08"]), NOW);
ck(`consecutive days are never described as a return (GAP_DAYS is ${GAP_DAYS})`,
  consecutive.returnedAfterDays === null && consecutive.recencyStatement === "Last event today.");

const windowed = computeStreak(progressOf(WITH_GAP), NOW, 7);
ck("the window is a parameter, and the rate is computed against the one passed",
  windowed.windowDays === 7 && windowed.activeDays === 2 && windowed.ratePct === 29
    && windowed.rateStatement === "Studied 2 of the last 7 days (29%).", `(${windowed.rateStatement})`);
ck("...and the run, which is not a window quantity, is unchanged by it", windowed.longestRunDays === 12);

// ---------------------------------------------------------------------------
// Evidence, against the real corpus — relationships only, no pinned values.
// ---------------------------------------------------------------------------

console.log(`\n  evidence, against the live corpus and the live plan`);

const skillMap = load("data/market-skill-map.json") as SkillMap & MatcherSkillMap;
const workbook = load("data/workbook.json") as Workbook;
const index = load("reports/market/index.json") as MarketIndex;
const trend = load("reports/market/trend.json") as TrendPoint[];
const benchmark = computeBenchmark(index, skillMap, workbook, NOW, null);
/** Nothing done yet: the state every marginal entry is priced from. */
const before = computeInsight(index, benchmark, null, workbook, trend, NOW);

const planRow = (row: number): PlanRowRef => {
  const r = workbook.Plan[row]!;
  return { row, track: String(r[0] ?? ""), topic: String(r[2] ?? ""), month: Number(r[1] || 0), hours: Number(r[13] || 0), status: String(r[15] ?? "") };
};

const top = before.readiness.marginal[0];
const topRow = planRow(top.row);
const evidence = computeEvidence(benchmark, before, topRow, index, NOW);
console.log(`  ${evidence.statement.split("\n").join("\n  ")}`);

ck("evidence consumes the marginal entry rather than recomputing it",
  evidence.basis === "cleared" && evidence.fromPct === before.readiness.pct
    && evidence.toPct === top.to && evidence.gainPoints === top.gainPoints);

/**
 * The equivalence the design claims — "the marginal table is exactly this calculation run
 * forward" — asserted rather than believed. The readiness this row is PROMISED must equal the
 * readiness computed from scratch with a progress event marking it done. Two paths, one number.
 */
const after = computeInsight(index, benchmark, { events: [{ topic: topRow.topic, status: "done", date: `${DAY}T09:00:00.000Z` }] }, workbook, trend, NOW);
ck("the readiness promised is the readiness recomputed with the row done",
  after.readiness.pct === evidence.toPct,
  `(${evidence.fromPct}% -> promised ${evidence.toPct}%, recomputed ${after.readiness.pct}%)`);
ck("...and the skills named as cleared are the ones that entered the evidenced set",
  evidence.skills.every((s) => after.readiness.evidenced.some((e) => e.id === s.id))
    && evidence.skills.length === after.readiness.evidenced.length - before.readiness.evidenced.length);

const cover = benchmark.coverage.find((c) => c.id === evidence.skill!.id)!;
ck("the share quoted is the benchmark's own, with both denominators",
  evidence.skill!.pct === cover.pct && evidence.share!.hits === cover.hits && evidence.share!.reqs === cover.reqs
    && evidence.share!.companies === cover.companies && evidence.share!.totalCompanies === cover.totalCompanies);
ck("the named skill is the largest share the row clears, not the first one listed",
  evidence.skills.every((s) => s.pct <= evidence.skill!.pct));

/**
 * The role, if one was named, must be a requisition that is BOTH reachable and asking for a
 * skill this row cleared. Asserted as membership in the two sets the insight already built,
 * never as a company name — the top reachable role changes every scan.
 */
if (evidence.role) {
  const req = Object.values(index.reqs).find((r) => r.company === evidence.role!.company && r.title === evidence.role!.title && r.skills?.includes(evidence.roleSkill!.id));
  ck("a named role is a reachable one, and it genuinely asks for a skill this row cleared",
    before.reachability.roles.includes(evidence.role) && req !== undefined
      && evidence.skills.some((s) => s.id === evidence.roleSkill!.id),
    `(${evidence.role.statement} - ${evidence.roleSkill!.id})`);
  ck("...and the sentence names it", evidence.statement.includes(evidence.role.statement));
} else {
  ck("no role exists for this row's skills, and none is named", !evidence.statement.includes("Asked for by"));
}

const withoutIndex = computeEvidence(benchmark, before, topRow, null, NOW);
ck("without the index no role is invented, and every measured part still renders",
  withoutIndex.role === null && withoutIndex.roleSkill === null
    && !withoutIndex.statement.includes("Asked for by")
    && withoutIndex.toPct === evidence.toPct && withoutIndex.statement.includes("Cleared "));

/**
 * A row the market map does not name as any skill's primary row. Found by search rather than by
 * number, because which rows those are is a property of data/market-skill-map.json and changes
 * when the map does.
 */
const primaries = new Set(benchmark.coverage.map((c) => c.primaryRow));
let unmapped = 0;
for (let n = 1; n < workbook.Plan.length; n++) if (String(workbook.Plan[n]?.[2] ?? "").trim() && !primaries.has(n)) { unmapped = n; break; }
const nothing = computeEvidence(benchmark, before, planRow(unmapped), index, NOW);
console.log(`  ${nothing.statement.split("\n").join("\n  ")}`);
ck("a row carrying no mapped skill says so", nothing.basis === "no-mapped-skill"
  && nothing.statement.includes("names row") && nothing.statement.includes("buys no market share"), `(row ${unmapped})`);
ck("...and invents no benefit to go with it",
  nothing.skills.length === 0 && nothing.skill === null && nothing.share === null && nothing.role === null
    && nothing.gainPoints === 0 && nothing.toPct === nothing.fromPct
    && !nothing.statement.includes("Cleared") && !nothing.statement.includes("Asked for by"));

/**
 * The third case, which must not be reported as the second: the row IS a primary row for a
 * skill the market asks for, but an earlier event already evidenced it. Nothing further is
 * cleared, and the reason is different from "this row buys nothing".
 */
const done = computeEvidence(benchmark, after, topRow, index, NOW);
ck("a row already evidenced reports that, not an absent mapping",
  done.basis === "already-evidenced" && done.toPct === done.fromPct
    && done.statement.includes("already evidenced by an earlier progress event"));

// ---------------------------------------------------------------------------
// The real reports/progress, read as the dashboard reads it. Printed, not pinned.
// ---------------------------------------------------------------------------

console.log(`\n  reports/progress, as it stands right now`);

/** The same three regexes as GET /api/progress and store.ts, and the same newest-first order. */
const dir = new URL("reports/progress/", root);
const liveProgress: Progress = {
  events: readdirSync(dir).filter((f) => f.endsWith(".md")).sort((a, b) => b.localeCompare(a)).map((file) => {
    const body = readFileSync(new URL(file, dir), "utf8");
    return {
      topic: body.match(/^Topic:\s*(.+)$/m)?.[1] || file,
      status: body.match(/^Status:\s*(.+)$/m)?.[1] || "Not started",
      date: body.match(/^Date:\s*(.+)$/m)?.[1] || "",
    };
  }),
};

const live = computeStreak(liveProgress, new Date());
console.log(`  ${live.statement}`);
console.log(`  ${live.eventCount} events, ${live.datedCount} dated, ${live.totalActiveDays} distinct active days since ${live.firstDay}`);

ck("the live rate is a rate: active days inside the window, over the window",
  live.activeDays <= live.windowDays && live.ratePct === Math.round((live.activeDays / live.windowDays) * 100),
  `(${live.activeDays}/${live.windowDays} = ${live.ratePct}%)`);
ck("the live run is at least one day and at most the days actually recorded",
  live.longestRunDays >= Math.min(1, live.totalActiveDays) && live.longestRunDays <= live.totalActiveDays,
  `(run ${live.longestRunDays}, ${live.totalActiveDays} active days)`);
ck("the live run is dated exactly when it is non-empty",
  (live.longestRunDays > 0) === (live.longestRunFrom !== null && live.longestRunTo !== null));
ck("the live history never reads as being in the future", live.daysSinceLast === null || live.daysSinceLast >= 0);
for (const [i, line] of rendered(live).entries()) ck(`the live sentence carries no loss [${i}]`, !LOSS.test(line), `(${line})`);

console.log(fails ? `\n${fails} FAILURES` : "\nall assertions passed");
process.exit(fails ? 1 : 0);
