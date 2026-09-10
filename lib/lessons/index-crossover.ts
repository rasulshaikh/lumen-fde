/**
 * Index scans, and the selectivity where reading everything wins.
 *
 * Plan row 31: "PostgreSQL at depth: planner, indexes, EXPLAIN, locks, transactions".
 *
 * The misconception: "the query is slow, so add an index - and if the planner ignores the index I
 * added, the planner is wrong." Underneath sits the belief that an index scan is a strictly cheaper
 * way to reach the same rows. It is not. A sequential scan's cost does not depend on how many rows
 * match; an index scan's does, because every matching row is a separate visit to the heap. Drag the
 * selectivity up and the two curves cross.
 *
 * The second parameter is the one that surprises people: `pg_stats.correlation`, how closely
 * physical row order matches index order. It is a property of the TABLE, not of the index, and it
 * moves the crossover by nearly two orders of magnitude. The same index on the same query is a good
 * idea or a bad one depending on how the rows happen to be laid out on disk.
 *
 * ## Fidelity, and where it stops
 *
 * The formulas are Postgres's own cost model from src/backend/optimizer/path/costsize.c at shipped
 * default constants. Two deliberate simplifications, stated here rather than buried: the `ceil()`
 * Postgres applies to page counts is dropped so the curve is continuous, and btcostestimate's
 * tree-descent term is dropped as noise at this table size. Neither moves the crossover visibly.
 *
 * Every figure in the captions is computed. Nothing here quotes a constant it did not derive.
 */
import { paramValue, type Lesson, type LessonScene, type Params } from "./types";

// Shipped planner defaults.
const SEQ_PAGE_COST = 1.0;
const RANDOM_PAGE_COST = 4.0;
const CPU_TUPLE_COST = 0.01;
const CPU_INDEX_TUPLE_COST = 0.005;
const CPU_OPERATOR_COST = 0.0025;

/** A million rows at 100 per 8kB page, with a 20MB btree over them. */
const ROWS = 1_000_000;
const HEAP_PAGES = 10_000;
const INDEX_PAGES = 2_500;

/**
 * Seq scan: every page once, the predicate on every row. Selectivity does not appear.
 * That absence is the entire lesson, in one line.
 */
export const seqScanCost = () => SEQ_PAGE_COST * HEAP_PAGES + (CPU_TUPLE_COST + CPU_OPERATOR_COST) * ROWS;

/**
 * Mackert-Lohman: how many heap pages a fetch of t tuples actually touches, given that the same
 * page is often hit more than once. Saturates at every page in the table.
 */
export const heapPagesFetched = (s: number): number => {
  const t = Math.max(0, s) * ROWS;
  return Math.min((2 * HEAP_PAGES * t) / (2 * HEAP_PAGES + t), HEAP_PAGES);
};

/**
 * Index scan cost. The correlation term is Postgres's own interpolation between the fully
 * random-order cost and the fully sequential-order cost, weighted by correlation squared.
 */
export const indexScanCost = (s: number, corr: number): number => {
  const sel = Math.min(1, Math.max(0, s));
  const c = Math.min(1, Math.max(0, corr));
  const tuples = sel * ROWS;
  const pages = heapPagesFetched(sel);

  const indexCost = (SEQ_PAGE_COST * INDEX_PAGES + CPU_INDEX_TUPLE_COST + CPU_OPERATOR_COST) * sel;
  const maxIO = pages * RANDOM_PAGE_COST;
  const minIO = pages * SEQ_PAGE_COST;
  const heapCost = maxIO + c * c * (minIO - maxIO);
  return indexCost + heapCost + CPU_TUPLE_COST * tuples;
};

/**
 * Where the two costs meet, by bisection on the difference.
 *
 * Solved rather than tabulated: the crossover moves with correlation, and a hard-coded table of
 * crossovers is exactly the kind of nearly-right constant that survives review. Monotonic in s over
 * the bracket, so bisection is safe and exact to the tolerance.
 */
export const crossoverSelectivity = (corr: number): number => {
  const target = seqScanCost();
  let lo = 1e-6, hi = 1;
  if (indexScanCost(hi, corr) < target) return 1;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (indexScanCost(mid, corr) < target) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
};

const pct = (s: number) => (s >= 0.01 ? `${(s * 100).toFixed(1)}%` : s >= 0.0001 ? `${(s * 100).toFixed(3)}%` : `${(s * 1e6).toFixed(0)} in a million`);
const fmt = (n: number) => Math.round(n).toLocaleString("en-GB");

export const indexCrossover: Lesson = {
  id: "index-crossover",
  title: "Index scans, and the selectivity where reading everything wins",
  prompt: "Drag the selectivity. Find where the index stops being the cheaper plan.",
  topicIndices: [31],
  view: { x0: -4, x1: 0, y0: 0, y1: 70000 },

  params: [
    { id: "logSel", label: "Selectivity", min: -4, max: 0, step: 0.005, unit: "", value: -3, slider: false,
      hint: "Drag the dot. The left edge is one row in ten thousand; the right edge is every row." },
    { id: "corr", label: "Physical row order", min: 0, max: 1, step: 0.01, unit: "", value: 0, slider: true,
      hint: "pg_stats.correlation: how closely rows are stored in index order. A property of the table, not of the index - and it moves the answer more than anything you can do to the query." },
  ],
  handles: [{ id: "pick", param: "logSel", axis: "x" }],

  scene(params: Params): LessonScene {
    const logSel = paramValue(indexCrossover, params, "logSel");
    const corr = paramValue(indexCrossover, params, "corr");
    const s = 10 ** logSel;

    const seq = seqScanCost();
    const idx = indexScanCost(s, corr);
    const cross = crossoverSelectivity(corr);
    const logCross = Math.log10(cross);

    const idxCurve: Array<[number, number]> = [];
    for (let i = 0; i <= 160; i++) {
      const l = -4 + (4 * i) / 160;
      idxCurve.push([l, Math.min(70000, indexScanCost(10 ** l, corr))]);
    }

    const indexWins = idx < seq;
    const rows = s * ROWS;

    const caption = indexWins
      ? `At ${pct(s)} the index costs ${fmt(idx)} against ${fmt(seq)} for reading the whole table. The index wins.`
      : `At ${pct(s)} the index costs ${fmt(idx)} against ${fmt(seq)} for reading the whole table. Reading everything is now cheaper.`;

    const detail = indexWins
      ? `The sequential scan's cost is the same number at every selectivity, because it reads every page whatever the predicate says. The index scan's is not: it pays a heap visit per matching row, so its cost climbs with the row count. The two meet at ${pct(cross)}.`
      : `Nothing is wrong with the index and nothing is wrong with the planner. Above ${pct(cross)} the index scan visits so many heap pages, in an order the disk does not like, that reading the table start to finish costs less. This is why the index you added is being ignored, and why forcing it with enable_seqscan = off makes the query slower rather than faster.`;

    const arrived = corr > 0.9 && Math.abs(logSel - logCross) < 0.15
      ? `With rows stored in index order the crossover moves out to ${pct(cross)}, from ${pct(crossoverSelectivity(0))} when they are scattered. Same index, same query, same statistics - the difference is only how the rows happen to sit on disk. That is why CLUSTER exists, and why an index that works on one table is ignored on another that looks identical.`
      : undefined;

    return {
      paths: [
        { id: "index", kind: "curve", points: idxCurve },
        { id: "seq", kind: "guide", points: [[-4, seq], [0, seq]] },
      ],
      dots: [
        { id: "pick", kind: "handle", x: logSel, y: Math.min(70000, idx), label: pct(s) },
        { id: "cross", kind: "marker", x: logCross, y: seq },
      ],
      readouts: [
        { label: "selectivity", value: pct(s) },
        { label: "rows", value: fmt(rows) },
        { label: "index cost", value: fmt(idx) },
        { label: "seq cost", value: fmt(seq) },
        { label: "crossover", value: pct(cross) },
      ],
      caption,
      detail,
      arrived,
    };
  },
};
