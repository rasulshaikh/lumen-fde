/**
 * Prompt caching, and the traffic rate below which it costs you money.
 *
 * Plan row 64: "Cost and latency engineering: prompt caching, batching, small models".
 *
 * The misconception: "caching the system prompt is free money." It is not free: writing to the
 * cache costs MORE than an ordinary call, and a cache entry expires on a timer. Whether it pays
 * depends entirely on how often the same prefix is requested inside the TTL, which is a property of
 * your traffic and not of your prompt.
 *
 * Drag the request rate. Below a threshold that is much higher than people expect, every request
 * pays the write premium and almost none get a hit, so enabling caching makes the bill larger.
 */
import { paramValue, type Lesson, type LessonScene, type Params } from "./types";

/** Multipliers on the base input price. Roughly what the major providers charge. */
const WRITE = 1.25;
const HIT = 0.10;
const TTL_S = 300;

/**
 * Probability the prefix is still cached when a request arrives.
 *
 * Poisson arrivals, so the gap to the previous request is exponential and the entry survives if
 * that gap is under the TTL: p = 1 - e^(-lambda * TTL). Closed form, no simulation.
 */
export const hitRate = (perHour: number) => 1 - Math.exp(-(perHour / 3600) * TTL_S);
/** Expected cost per request, relative to not caching at all. */
export const cachedCost = (perHour: number) => {
  const p = hitRate(perHour);
  return p * HIT + (1 - p) * WRITE;
};
/**
 * The rate at which caching breaks even. Solved, not searched:
 *   p*HIT + (1-p)*WRITE = 1  =>  p = (WRITE - 1) / (WRITE - HIT)
 *   lambda = -ln(1 - p) / TTL
 */
export const breakEvenPerHour = () => {
  const p = (WRITE - 1) / (WRITE - HIT);
  return (-Math.log(1 - p) / TTL_S) * 3600;
};

const x = (v: number) => `${v.toFixed(2)}x`;
const pc = (v: number) => `${(v * 100).toFixed(0)}%`;

export const promptCache: Lesson = {
  id: "prompt-cache",
  title: "Prompt caching, and the rate below which it costs you money",
  prompt: "Drag the request rate. Find where caching starts paying for itself.",
  topicIndices: [64],
  view: { x0: -1, x1: 3, y0: 0, y1: 1.3 },

  params: [
    { id: "logRate", label: "Requests per hour on this prefix", min: -1, max: 3, step: 0.02, unit: "", value: 0.5, slider: false,
      hint: "Drag the ball. The left edge is one request every ten hours; the right is one every four seconds." },
  ],
  handles: [{ id: "ball", param: "logRate", axis: "x" }],

  scene(params: Params): LessonScene {
    const logRate = paramValue(promptCache, params, "logRate");
    const rate = 10 ** logRate;
    const p = hitRate(rate);
    const cost = cachedCost(rate);
    const even = breakEvenPerHour();
    const logEven = Math.log10(even);

    const curve: Array<[number, number]> = [];
    for (let i = 0; i <= 200; i++) {
      const l = -1 + (4 * i) / 200;
      curve.push([l, Math.min(1.3, cachedCost(10 ** l))]);
    }

    const losing = cost > 1;

    const caption = losing
      ? `${x(cost)} the uncached cost, at ${rate.toFixed(1)} requests an hour. Caching is losing money here.`
      : `${x(cost)} the uncached cost - a ${pc(1 - cost)} saving at ${rate.toFixed(1)} requests an hour.`;

    const detail = losing
      ? `The hit rate is only ${pc(p)}, so most requests pay the ${x(WRITE)} write premium and never get read before the entry expires. Break-even is ${even.toFixed(1)} requests an hour on the same prefix - and note that is per PREFIX, so a per-tenant system prompt divides your traffic by the number of tenants before this number applies.`
      : `Above ${even.toFixed(1)} requests an hour the hit rate is high enough that the reads outweigh the writes. The saving flattens quickly after that: once the cache is essentially always warm the cost approaches ${x(HIT)} and more traffic buys nothing further.`;

    const arrived = rate < even * 0.5
      ? `At this rate caching costs ${x(cost)} rather than saving anything, and every dashboard will still report a positive cache hit rate of ${pc(p)}, which is true and beside the point. The question is never "is the cache being hit" but "is it hit often enough to pay for the writes" - and the break-even is ${even.toFixed(1)} an hour on each distinct prefix.`
      : undefined;

    return {
      paths: [
        { id: "cost", kind: "curve", points: curve },
        { id: "baseline", kind: "guide", points: [[-1, 1], [3, 1]] },
      ],
      dots: [
        { id: "ball", kind: "handle", x: logRate, y: Math.min(1.3, cost), label: x(cost) },
        { id: "even", kind: "marker", x: logEven, y: 1 },
      ],
      readouts: [
        { label: "per hour", value: rate.toFixed(1) },
        { label: "hit rate", value: pc(p) },
        { label: "cost", value: x(cost) },
        { label: "break even", value: `${even.toFixed(1)}/h` },
        { label: "verdict", value: losing ? "costing" : "saving" },
      ],
      caption,
      detail,
      arrived,
    };
  },
};
