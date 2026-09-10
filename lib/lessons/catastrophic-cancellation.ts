/**
 * Variance, and the digits the textbook formula throws away.
 *
 * Plan row 99: "Numerical computing: NumPy vectorisation, floating point, numerical stability".
 *
 * The misconception: "sum of squares minus the square of the sum is the variance formula - it is in
 * every textbook, so it is fine." It is algebraically correct and numerically hopeless. When the
 * mean is large relative to the spread, the two terms are nearly equal, the subtraction cancels
 * every significant digit they had in common, and what is left is rounding error. It can return
 * zero. It can return a negative variance.
 *
 * Drag the offset. The data does not change shape at all - the same numbers, shifted - and the
 * naive answer falls apart while Welford does not notice.
 */
import { paramValue, type Lesson, type LessonScene, type Params } from "./types";

const EPS = Number.EPSILON;

/**
 * The condition number of the variance problem: sqrt(1 + mean^2 / variance).
 *
 * This is the multiplier on input error, and it is the whole story. The naive formula loses
 * kappa SQUARED because it forms sum(x^2), which is where the mean^2 term gets squared again.
 * Welford loses kappa, which is the best any method can do.
 */
export const kappa = (mean: number, sd: number) => Math.sqrt(1 + (mean * mean) / (sd * sd));
export const naiveRelError = (mean: number, sd: number) => EPS * Math.pow(kappa(mean, sd), 2);
export const welfordRelError = (mean: number, sd: number) => EPS * kappa(mean, sd);
/** Where the naive answer has no correct digits left at all. */
export const naiveFailsAt = (sd: number) => sd * Math.sqrt(1 / EPS - 1);

const sci = (v: number) => v.toExponential(1);
const digits = (rel: number) => Math.max(0, -Math.log10(Math.max(rel, 1e-300)));

export const catastrophicCancellation: Lesson = {
  id: "catastrophic-cancellation",
  title: "Variance, and the digits the textbook formula throws away",
  prompt: "Drag the offset. The spread never changes; watch the naive answer stop being an answer.",
  topicIndices: [99],
  view: { x0: 0, x1: 12, y0: -18, y1: 2 },

  params: [
    { id: "logMean", label: "Offset", min: 0, max: 12, step: 0.05, unit: "", value: 2, slider: false,
      hint: "Drag the ball. Add a constant to every value - a timestamp, a sensor baseline, an account balance." },
    { id: "sd", label: "Spread", min: 0.01, max: 100, step: 0.01, unit: "", value: 1, slider: true,
      hint: "The standard deviation of the data. Unchanged by the offset, which is the point." },
  ],
  handles: [{ id: "ball", param: "logMean", axis: "x" }],

  scene(params: Params): LessonScene {
    const logMean = paramValue(catastrophicCancellation, params, "logMean");
    const sd = paramValue(catastrophicCancellation, params, "sd");
    const mean = 10 ** logMean;
    const naive = naiveRelError(mean, sd);
    const welford = welfordRelError(mean, sd);
    const fails = naiveFailsAt(sd);
    const logFails = Math.log10(fails);

    const naiveCurve: Array<[number, number]> = [];
    const welfordCurve: Array<[number, number]> = [];
    for (let i = 0; i <= 200; i++) {
      const l = (12 * i) / 200;
      const m = 10 ** l;
      naiveCurve.push([l, Math.max(-18, Math.min(2, Math.log10(naiveRelError(m, sd))))]);
      welfordCurve.push([l, Math.max(-18, Math.min(2, Math.log10(welfordRelError(m, sd))))]);
    }

    const broken = naive >= 1;
    const naiveDigits = digits(naive);

    const caption = broken
      ? `The naive formula has no correct digits left. Welford still has ${digits(welford).toFixed(1)}.`
      : `Naive keeps ${naiveDigits.toFixed(1)} correct digits, Welford ${digits(welford).toFixed(1)}.`;

    const detail = broken
      ? `sum(x^2)/n and mean^2 now agree to every bit they have, so the subtraction returns whatever noise survives. In double precision this is where the textbook formula starts returning zero variance for data that plainly varies, and occasionally a negative one - which is how it announces itself, if you are checking.`
      : `Both methods lose digits to the same underlying condition number, but the naive formula loses it SQUARED because it forms sum of squares first. Every factor of ten on the offset costs it two digits and Welford one. Nothing about the data changed - the spread is identical - only where it sits on the number line.`;

    const arrived = broken
      ? `An offset of ${sci(mean)} against a spread of ${sd} is not exotic: it is a Unix timestamp, a sensor with a baseline, or a price in the smallest currency unit. The fix is not more precision, it is not computing the difference of two large nearly-equal numbers at all - which is exactly what Welford's update does, and why every serious library uses it instead of the formula in the textbook.`
      : undefined;

    return {
      paths: [
        { id: "naive", kind: "curve", points: naiveCurve },
        { id: "welford", kind: "tangent", points: welfordCurve },
      ],
      dots: [
        { id: "ball", kind: "handle", x: logMean, y: Math.max(-18, Math.min(2, Math.log10(naive))), label: sci(mean) },
        ...(logFails <= 12 ? [{ id: "fails", kind: "marker" as const, x: logFails, y: 0 }] : []),
      ],
      readouts: [
        { label: "offset", value: sci(mean) },
        { label: "spread", value: `${sd}` },
        { label: "naive digits", value: naiveDigits.toFixed(1) },
        { label: "welford digits", value: digits(welford).toFixed(1) },
        { label: "condition", value: sci(kappa(mean, sd)) },
      ],
      caption,
      detail,
      arrived,
    };
  },
};
