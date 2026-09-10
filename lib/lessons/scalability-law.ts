/**
 * Capacity, and the point where more concurrency makes it worse.
 *
 * Plan row 23: "Load testing and chaos".
 *
 * The misconception: "push load until throughput stops rising - that is capacity." Throughput does
 * not stop rising. Under the Universal Scalability Law it PEAKS and then falls, and in the falling
 * region the fix is fewer connections, which is the opposite of what the graph appears to be asking
 * for. Every load test that reports "we got to N and it fell over" was probably past the peak well
 * before it fell over.
 *
 * Two coefficients. Contention (sigma) is the serial fraction and only ever flattens the curve -
 * that is Amdahl. Coherency (kappa) is the cost of keeping N workers agreeing with each other, it
 * grows as N squared, and it is the one that turns the curve over.
 */
import { paramValue, type Lesson, type LessonScene, type Params } from "./types";

/** X(N) = N / (1 + sigma(N-1) + kappa*N(N-1)). Gunther's USL, unchanged. */
export const usl = (n: number, sigma: number, kappa: number) =>
  n / (1 + sigma * (n - 1) + kappa * n * (n - 1));

/** The peak, in closed form: N* = sqrt((1 - sigma) / kappa). Infinite when kappa is zero. */
export const peakAt = (sigma: number, kappa: number) =>
  kappa <= 0 ? Infinity : Math.sqrt((1 - sigma) / kappa);

/** Little's law: with throughput X and N in flight, residence time is N/X. */
export const residence = (n: number, sigma: number, kappa: number) => n / usl(n, sigma, kappa);

const fmt = (n: number, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : "never");

export const scalabilityLaw: Lesson = {
  id: "scalability-law",
  title: "Capacity, and the point where more makes it worse",
  prompt: "Drag the concurrency. Find the peak, then keep going.",
  topicIndices: [23],
  view: { x0: 1, x1: 512, y0: 0, y1: 60 },

  params: [
    { id: "n", label: "Concurrency", min: 1, max: 512, step: 1, unit: "", value: 32, slider: false,
      hint: "Drag the ball. Clients in flight at once - threads, connections, workers." },
    { id: "sigma", label: "Contention", min: 0, max: 0.2, step: 0.005, unit: "", value: 0.03, slider: true,
      hint: "The serial fraction. This is Amdahl: it flattens the curve and never turns it over." },
    { id: "kappa", label: "Coherency", min: 0, max: 0.005, step: 0.0001, unit: "", value: 0.0008, slider: true,
      hint: "The cost of N workers agreeing with each other. Grows as N squared. Set it to zero and the peak goes away entirely." },
  ],
  handles: [{ id: "ball", param: "n", axis: "x" }],

  scene(params: Params): LessonScene {
    const n = paramValue(scalabilityLaw, params, "n");
    const sigma = paramValue(scalabilityLaw, params, "sigma");
    const kappa = paramValue(scalabilityLaw, params, "kappa");

    const x = usl(n, sigma, kappa);
    const peak = peakAt(sigma, kappa);
    const peakX = Number.isFinite(peak) ? usl(peak, sigma, kappa) : Infinity;
    const past = Number.isFinite(peak) && n > peak;

    const curve: Array<[number, number]> = [];
    for (let i = 0; i <= 256; i++) {
      const c = 1 + (511 * i) / 256;
      curve.push([c, Math.min(60, usl(c, sigma, kappa))]);
    }
    // Linear scaling, for comparison. What the curve would be if nothing interfered.
    const linear: Array<[number, number]> = [[1, 1], [60, 60]];

    const caption = past
      ? `${fmt(x)}x throughput at ${n} in flight, down from ${fmt(peakX)}x at the peak of ${fmt(peak, 0)}.`
      : `${fmt(x)}x throughput at ${n} in flight. The peak is at ${fmt(peak, 0)}.`;

    const detail = past
      ? `Past the peak, adding concurrency REMOVES throughput. Residence time is ${fmt(residence(n, sigma, kappa), 2)} times the single-request service time and climbing. The instinct here is to raise the connection pool because the system looks starved; that moves it further right and makes it worse. The fix is to admit fewer requests at once.`
      : kappa <= 0
        ? `With coherency at zero this is Amdahl's law: the curve flattens toward ${fmt(1 / Math.max(sigma, 1e-9), 0)}x and never turns over. That is the shape everyone has in their head, and it is the shape you get when workers never have to agree about anything.`
        : `Contention flattens the curve; coherency turns it over. Coherency is every cost that scales with pairs of workers - cache line ping-pong, lock convoys, a shared row everyone updates - so it grows as N squared while throughput is only trying to grow as N.`;

    const arrived = past && x < peakX * 0.75
      ? `Throughput is ${((1 - x / peakX) * 100).toFixed(0)}% below its own peak, and every graph on the wall is still labelled "load test". A system in this region responds to more capacity by getting slower, which is why the answer is sometimes a smaller pool - and why "it fell over at 400 connections" usually means it stopped improving at ${fmt(peak, 0)}.`
      : undefined;

    return {
      paths: [
        { id: "usl", kind: "curve", points: curve },
        { id: "linear", kind: "tangent", points: linear },
      ],
      dots: [
        { id: "ball", kind: "handle", x: n, y: Math.min(60, x), label: `${n}` },
        ...(Number.isFinite(peak) ? [{ id: "peak", kind: "marker" as const, x: peak, y: Math.min(60, peakX) }] : []),
      ],
      readouts: [
        { label: "in flight", value: `${n}` },
        { label: "throughput", value: `${fmt(x)}x` },
        { label: "peak at", value: fmt(peak, 0) },
        { label: "peak value", value: `${fmt(peakX)}x` },
        { label: "residence", value: `${fmt(residence(n, sigma, kappa), 2)}x` },
      ],
      caption,
      detail,
      arrived,
    };
  },
};
