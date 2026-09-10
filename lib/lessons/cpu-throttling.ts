/**
 * CPU limits, and the throttling you cannot see in the average.
 *
 * Plan row 8: "Kubernetes production ops: probes, HPA, requests and limits, storage, RBAC".
 *
 * The misconception, and it is the most expensive one on this list: "we are only using a third of
 * our CPU limit, so the limit is not the problem - it must be the database."
 *
 * A CFS quota is not a rate, it is an allowance spent per 100ms period. A request that wants
 * several cores for twelve milliseconds burns the whole period's allowance in twelve milliseconds
 * and is then frozen for the remaining eighty-eight, whatever the one-minute average says. Drag the
 * limit down and watch wall-clock latency climb in steps of exactly 100ms while mean utilisation
 * stays comfortable.
 */
import { paramValue, type Lesson, type LessonScene, type Params } from "./types";

/** CPU-milliseconds of work one request needs, whatever it is spread across. */
const WORK_MS = 200;
/** Requests per second, for the utilisation the dashboard would show. */
const RPS = 2;
const PERIOD_MS = 100;

/** CPU-ms of allowance per period. This is what a "limit" actually is. */
export const quotaPerPeriod = (limit: number) => limit * PERIOD_MS;
export const periodsNeeded = (limit: number) => Math.max(1, Math.ceil(WORK_MS / quotaPerPeriod(limit)));
export const isThrottled = (limit: number) => WORK_MS > quotaPerPeriod(limit);

/**
 * Wall-clock time for one request.
 *
 * Each full period contributes its whole 100ms, because the container is frozen once the allowance
 * is gone. The final period contributes only the time actually spent burning the remainder, at
 * whatever parallelism is available.
 */
export const wallMs = (limit: number, threads: number) => {
  const q = quotaPerPeriod(limit);
  const full = periodsNeeded(limit) - 1;
  const remainder = WORK_MS - full * q;
  /*
   * The burn rate is the THREAD COUNT, not the limit.
   *
   * This is the mechanism, and getting it wrong makes the lesson teach the opposite of the truth.
   * CFS does not smooth a container down to `limit` cores; it lets it burst to whatever
   * parallelism it has until the allowance is spent, then freezes it. `min(threads, limit)` gave
   * 80ms for a request that is not throttled at all and should take 25ms, which would have made
   * the un-throttled case look like the problem.
   */
  return full * PERIOD_MS + remainder / Math.max(threads, 1);
};

/** What the container would take with no quota at all - the number people expect. */
export const unthrottledMs = (threads: number) => WORK_MS / threads;
/** Mean cores used across a whole second. This is the number on the dashboard. */
export const meanUtilisation = (limit: number) => (RPS * WORK_MS) / 1000 / limit;

const ms = (n: number) => `${n.toFixed(1)}ms`;

export const cpuThrottling: Lesson = {
  id: "cpu-throttling",
  title: "CPU limits, and the throttling the average cannot see",
  prompt: "Drag the CPU limit down. Watch latency climb while utilisation stays comfortable.",
  topicIndices: [8],
  view: { x0: 0.1, x1: 4, y0: 0, y1: 700 },

  params: [
    { id: "limit", label: "CPU limit", min: 0.1, max: 4, step: 0.05, unit: " cores", value: 2.5, slider: false,
      hint: "Drag the ball. This is spec.containers[].resources.limits.cpu." },
    { id: "threads", label: "Parallelism", min: 1, max: 32, step: 1, unit: " threads", value: 8, slider: true,
      hint: "How many threads the request can spread its work across. More threads spend the allowance faster, not slower." },
  ],
  handles: [{ id: "ball", param: "limit", axis: "x" }],

  scene(params: Params): LessonScene {
    const limit = paramValue(cpuThrottling, params, "limit");
    const threads = paramValue(cpuThrottling, params, "threads");
    const wall = wallMs(limit, threads);
    const ideal = unthrottledMs(threads);
    const util = meanUtilisation(limit);
    const throttled = isThrottled(limit);
    const periods = periodsNeeded(limit);

    const curve: Array<[number, number]> = [];
    for (let i = 0; i <= 200; i++) {
      const x = 0.1 + (3.9 * i) / 200;
      curve.push([x, Math.min(700, wallMs(x, threads))]);
    }
    // The limit at which the whole request fits inside one period. The cliff edge.
    const safe = WORK_MS / PERIOD_MS;

    const saturated = util >= 1;
    const caption = saturated
      ? `The allowance cannot carry the offered load at all: ${RPS} requests a second need ${(RPS * WORK_MS).toFixed(0)} CPU-ms and the limit provides ${(limit * 1000).toFixed(0)}.`
      : throttled
        ? `${ms(wall)} for a request that needs ${ms(ideal)} of work - spread over ${periods} quota periods.`
        : `${ms(wall)}, inside one quota period. Nothing is throttled.`;

    const detail = saturated
      ? `This is a different failure from throttling and it is worth telling them apart. Here the limit is genuinely too small for the traffic and the queue grows without bound. Throttling proper is the case above, where there is plenty of headroom on average and requests are still being frozen.`
      : throttled
      ? `The allowance is ${quotaPerPeriod(limit).toFixed(0)} CPU-ms per 100ms period. This request wants ${WORK_MS}, so it burns the allowance, freezes until the period rolls over, and repeats. Meanwhile the dashboard reads ${(util * 100).toFixed(0)}% mean utilisation, because a one-minute average cannot see a freeze that lasts eighty-eight milliseconds. The metric to look at is throttled_periods, not utilisation.`
      : `A limit is an allowance per 100ms period rather than a speed. While the whole request fits inside one period nothing freezes, and adding threads genuinely helps. Below ${safe.toFixed(1)} cores it stops fitting, and more threads then spend the allowance faster without finishing sooner.`;

    const arrived = throttled && !saturated && util < 0.5
      ? `Latency is ${(wall / ideal).toFixed(1)} times what the work needs, and mean utilisation is ${(util * 100).toFixed(0)}%. Both numbers are correct. This is the shape of the ticket that gets blamed on the database: nothing in the CPU graph looks wrong, because the graph is an average over periods that were mostly spent frozen.`
      : undefined;

    return {
      paths: [
        { id: "wall", kind: "curve", points: curve },
        { id: "ideal", kind: "tangent", points: [[0.1, ideal], [4, ideal]] },
      ],
      dots: [
        { id: "ball", kind: "handle", x: limit, y: Math.min(700, wall), label: `${limit.toFixed(2)} cores` },
        { id: "safe", kind: "marker", x: safe, y: 0 },
      ],
      readouts: [
        { label: "limit", value: `${limit.toFixed(2)}` },
        { label: "latency", value: ms(wall) },
        { label: "work needs", value: ms(ideal) },
        { label: "periods", value: `${periods}` },
        { label: "mean util", value: `${(util * 100).toFixed(0)}%` },
      ],
      caption,
      detail,
      arrived,
    };
  },
};
