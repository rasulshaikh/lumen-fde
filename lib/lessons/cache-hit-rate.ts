/**
 * The cache hit rate, and the queue behind it.
 *
 * Plan row 46: "System design playbook: load balancing, caching, sharding, queues, rate limits".
 *
 * The misconception: "going from 90% to 95% is where the big latency win is - it halves the miss
 * traffic, so it must beat 50% to 55%."
 *
 * It is backwards, and the reason is the queue. If the origin had unlimited capacity the mean would
 * be a straight line, L = 1 + (1-h) * 20, and five points would buy the same five points anywhere.
 * That straight line is drawn on the diagram as a guide. The real curve sits above it, and the gap
 * between them is entirely queueing - time a miss spends waiting behind other misses.
 *
 * At a low hit rate the origin is busy, the queue is deep, and removing miss traffic drains it, so
 * five points buys a lot. At a high hit rate the origin is idle, there is no queue left to drain,
 * and five points buys almost nothing. The lesson is where the win actually lives, and the diagram
 * says it in the gap.
 *
 * This framing replaced one that claimed the mean was linear. It is not: the suite compared the two
 * moves and found 7.50ms against 1.24ms, which is the opposite of equal.
 *
 * ## The model, named honestly
 *
 * The origin is a pool of workers behind a balancer, each fed an equal share of the misses, so each
 * is an independent M/M/1 queue and W = S0/(1-rho) is that queue's exact mean response time. This
 * is NOT the M/M/c Erlang-C formula and does not claim to be - naming the wrong queue is exactly
 * the kind of nearly-right thing that survives review.
 *
 * Every number in the captions is computed rather than quoted.
 */
import { paramValue, type Lesson, type LessonScene, type Params } from "./types";

/** Requests per second offered to the service. Not the reader's to change. */
const R = 2000;
/** ms, the cache's own latency, paid on every request whether it hits or misses. */
const L_HIT = 1;
/** ms, one origin request with nothing queued in front of it. */
const S0 = 20;
const CEILING = 16;

/** rps one worker can finish, times workers. */
export const capacity = (w: number) => (1000 * w) / S0;
/** rps reaching the origin. Depends on the miss rate and nothing else. */
export const arrivals = (h: number) => R * (1 - h);
export const utilisation = (h: number, w: number) => arrivals(h) / capacity(w);

/** ms, mean response of one M/M/1 worker. Infinite at or past saturation. */
export const originReply = (h: number, w: number) => {
  const r = utilisation(h, w);
  return r >= 1 ? Infinity : S0 / (1 - r);
};

/** ms, the mean if the origin never queued. Straight by construction: this is the line people assume. */
export const idealLatency = (h: number) => L_HIT + (1 - h) * S0;

/** ms, L = L_HIT + (1-h) * W. A miss pays the cache lookup, then waits for the origin. */
export const latency = (h: number, w: number) => {
  const W = originReply(h, w);
  return Number.isFinite(W) ? L_HIT + (1 - h) * W : Infinity;
};

/** The hit rate at which the origin saturates: 1 - capacity/R. Below it, latency is unbounded. */
export const wall = (w: number) => Math.max(0, 1 - capacity(w) / R);

const ms = (n: number) => (Number.isFinite(n) ? `${n.toFixed(2)}ms` : "unbounded");
const pc = (n: number) => `${(n * 100).toFixed(1)}%`;

export const cacheHitRate: Lesson = {
  id: "cache-hit-rate",
  title: "The cache hit rate, and the queue behind it",
  prompt: "Drag the hit rate. Compare a five-point move down here with a five-point move up there.",
  topicIndices: [46],
  view: { x0: 0.5, x1: 1.0, y0: 0, y1: CEILING },

  params: [
    { id: "h", label: "Cache hit rate", min: 0.5, max: 0.999, step: 0.001, unit: "", value: 0.9, slider: false,
      hint: "Drag the ball itself. The only number on this diagram the cache team controls." },
    /*
     * 30, not 20.
     *
     * At 20 the origin saturates at exactly 50% - the left edge of the view - so the entire linear
     * region the lesson is about sat outside the diagram and dragging left went straight to
     * unbounded. The test caught it: a comparison starting at 0.5 returned Infinity.
     *
     * At 30 the wall is well left of anything drawn, so at rest the reader sees the linear truth
     * (equal moves buy equal amounts, which is the first half of the misconception) and has to
     * pull the connections DOWN to walk the wall into hit rates that felt comfortable. That is the
     * better order: the surprise should be something they cause.
     */
    { id: "workers", label: "Origin connections", min: 2, max: 40, step: 1, unit: "", value: 30, slider: true,
      hint: "How many origin requests can be in flight at once. Pull it down and watch the wall move right, into hit rates you thought were safe." },
  ],
  handles: [{ id: "ball", param: "h", axis: "x" }],

  scene(params: Params): LessonScene {
    const h = paramValue(cacheHitRate, params, "h");
    const w = paramValue(cacheHitRate, params, "workers");
    const L = latency(h, w);
    const rho = utilisation(h, w);
    const knee = wall(w);

    const ideal: Array<[number, number]> = [[0.5, idealLatency(0.5)], [1, idealLatency(1)]];
    const curve: Array<[number, number]> = [];
    for (let i = 0; i <= 200; i++) {
      const x = 0.5 + (0.5 * i) / 200;
      const v = latency(x, w);
      curve.push([x, Number.isFinite(v) ? Math.min(CEILING, v) : CEILING]);
    }

    // What the same five points buys in two places, computed rather than asserted.
    const lowMove = latency(0.5, w) - latency(0.55, w);
    const highMove = latency(0.9, w) - latency(0.95, w);
    const comparable = Number.isFinite(lowMove) && Number.isFinite(highMove);

    const saturated = !Number.isFinite(L);
    const nearWall = !saturated && rho > 0.8;

    const caption = saturated
      ? `At ${pc(h)} the origin is receiving ${Math.round(arrivals(h))} requests a second and can finish ${Math.round(capacity(w))}. The queue never drains.`
      : `At ${pc(h)} the mean is ${ms(L)}, with the origin at ${pc(rho)} utilisation.`;

    const detail = saturated
      ? `Nothing is wrong with the cache. The hit rate sets how much traffic reaches the origin, and below ${pc(knee)} that traffic is more than the origin can finish, so latency is not high - it is unbounded, and rising for as long as the load lasts.`
      : nearWall
        ? `Past about 80% utilisation the queue term stops being a rounding error. The mean is no longer the hit rate times a constant: most of it is now time spent waiting behind other people's misses, which is why a cache that drops a few points can take the origin down with it.`
        : comparable
          ? `Five points of hit rate buys ${ms(lowMove)} down at 50% and ${ms(highMove)} up at 90%. The dashed line is what the mean would be if the origin never queued, and it IS straight - the gap above it is queueing. Down low the origin is busy and removing misses drains the queue; up high there is no queue left to drain, so the same five points buys far less.`
          : `The dashed line is the mean if the origin never queued. Everything above it is time a miss spends waiting behind other misses, and that gap is what the hit rate is really buying.`;

    const arrived = rho > 0.95 && !saturated
      ? `The origin is at ${pc(rho)} of capacity and the mean is ${ms(L)}. The cache is doing its job - it is serving ${pc(h)} of requests - and the service is one bad deploy away from unbounded latency. The number to watch is not the hit rate, it is what the hit rate leaves for the origin to carry.`
      : undefined;

    return {
      paths: [
        { id: "latency", kind: "curve", points: curve },
        { id: "ideal", kind: "tangent", points: ideal },
        { id: "wall", kind: "guide", points: [[knee, 0], [knee, CEILING]] },
      ],
      dots: [
        { id: "ball", kind: "handle", x: h, y: Number.isFinite(L) ? Math.min(CEILING, L) : CEILING, label: pc(h) },
        { id: "knee", kind: "marker", x: knee, y: 0 },
      ],
      readouts: [
        { label: "hit rate", value: pc(h) },
        { label: "mean latency", value: ms(L) },
        { label: "origin rps", value: `${Math.round(arrivals(h))}` },
        { label: "utilisation", value: Number.isFinite(rho) ? pc(rho) : "over" },
        { label: "wall at", value: pc(knee) },
      ],
      caption,
      detail,
      arrived,
    };
  },
};
