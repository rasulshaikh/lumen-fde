/**
 * The p99 on the dashboard, and the bucket it is stuck in.
 *
 * Plan row 22: "Observability: OpenTelemetry, Prometheus, Grafana, logs, traces, metrics".
 *
 * The misconception: "the p99 on the dashboard is the p99." It is not. It is a linear interpolation
 * inside buckets someone chose eighteen months ago, and above the largest finite bucket it is a
 * CONSTANT. Drag the real latency up and the reported number climbs in steps, then stops moving
 * entirely while reality carries on getting worse.
 *
 * The graph goes flat exactly during the incident, which is the worst possible time for a metric to
 * stop responding.
 */
import { paramValue, type Lesson, type LessonScene, type Params } from "./types";

/** A perfectly ordinary bucket layout. Nobody revisits these. */
const BUCKETS = [5, 10, 25, 50, 100, 250, 500, 1000];
const Q = 0.99;

/** An exponential body, scaled so its true 99th percentile is the value being dragged. */
const scaleFor = (trueP99: number) => trueP99 / -Math.log(1 - Q);
export const cdf = (x: number, trueP99: number) => 1 - Math.exp(-x / scaleFor(trueP99));

/**
 * What histogram_quantile actually returns.
 *
 * Linear interpolation between the bounds of whichever bucket the quantile falls in. If it falls in
 * the +Inf bucket Prometheus has no upper bound to interpolate toward, so it returns the largest
 * finite one - and keeps returning it however bad things get.
 */
export const reportedP99 = (trueP99: number): number => {
  let lowerBound = 0, lowerC = 0;
  for (const le of BUCKETS) {
    const c = cdf(le, trueP99);
    if (c >= Q) {
      const span = c - lowerC;
      return span <= 0 ? le : lowerBound + (le - lowerBound) * ((Q - lowerC) / span);
    }
    lowerBound = le; lowerC = c;
  }
  return BUCKETS[BUCKETS.length - 1];
};

export const TOP_BUCKET = BUCKETS[BUCKETS.length - 1];
export const isPinned = (trueP99: number) => cdf(TOP_BUCKET, trueP99) < Q;

const ms = (n: number) => `${n.toFixed(0)}ms`;

export const histogramP99: Lesson = {
  id: "histogram-p99",
  title: "The p99 on the dashboard, and the bucket it is stuck in",
  prompt: "Drag the real latency up. Watch the dashboard stop following.",
  topicIndices: [22],
  view: { x0: 0, x1: 2500, y0: 0, y1: 1400 },

  params: [
    { id: "trueP99", label: "Real p99", min: 5, max: 2500, step: 5, unit: "ms", value: 120, slider: false,
      hint: "Drag the ball. This is what your users are actually experiencing." },
  ],
  handles: [{ id: "ball", param: "trueP99", axis: "x" }],

  scene(params: Params): LessonScene {
    const truth = paramValue(histogramP99, params, "trueP99");
    const reported = reportedP99(truth);
    const pinned = isPinned(truth);
    const error = truth > 0 ? (reported - truth) / truth : 0;

    const curve: Array<[number, number]> = [];
    for (let i = 0; i <= 250; i++) {
      const x = 5 + (2495 * i) / 250;
      curve.push([x, reportedP99(x)]);
    }

    const caption = pinned
      ? `Reality is ${ms(truth)}. The dashboard says ${ms(reported)} and will keep saying it however bad this gets.`
      : `Reality is ${ms(truth)}, the dashboard says ${ms(reported)} - off by ${(Math.abs(error) * 100).toFixed(0)}%.`;

    const detail = pinned
      ? `Fewer than 99% of requests now land under the largest finite bucket, so histogram_quantile has no upper bound to interpolate toward and returns that bound itself. The metric is not wrong in a way that alerts; it is pinned, and it is pinned at exactly the moment the number mattered.`
      : `histogram_quantile interpolates linearly inside whichever bucket the quantile falls into, which assumes latency is uniformly spread across that bucket. It is not. The wider the bucket the more the reported number is an artefact of where its edges were put, and nobody has revisited these edges since the service was written.`;

    const arrived = pinned && truth > TOP_BUCKET * 1.8
      ? `Users are seeing ${ms(truth)}. The graph is a flat line at ${ms(reported)}. Every alert threshold on that graph is now unreachable, and the on-call engineer is looking at a chart that says the service is fine. The fix is a bucket above your worst plausible latency, and the way to find out you need one is that the line has gone suspiciously flat.`
      : undefined;

    return {
      paths: [
        { id: "reported", kind: "curve", points: curve },
        { id: "truth", kind: "tangent", points: [[0, 0], [1400, 1400]] },
      ],
      dots: [
        { id: "ball", kind: "handle", x: truth, y: reported, label: ms(truth) },
        ...BUCKETS.map((b) => ({ id: `b${b}`, kind: "marker" as const, x: 0, y: b })),
      ],
      readouts: [
        { label: "real p99", value: ms(truth) },
        { label: "reported", value: ms(reported) },
        { label: "error", value: `${(error * 100).toFixed(0)}%` },
        { label: "top bucket", value: ms(TOP_BUCKET) },
        { label: "state", value: pinned ? "pinned" : "tracking" },
      ],
      caption,
      detail,
      arrived,
    };
  },
};
