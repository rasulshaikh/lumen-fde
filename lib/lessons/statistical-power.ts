/**
 * Sample size, and the square that makes small effects unaffordable.
 *
 * Plan rows 97 and 60: "Experimentation and causality" and "Model gateway, routing, fallbacks,
 * canaries". One lesson, because a canary's minimum detectable regression is this same equation
 * solved for the effect instead of the sample.
 *
 * The misconception: "we will run the canary at 5% for a day and see if quality drops." Required n
 * goes as one over the effect squared, so halving the effect you want to catch quadruples the
 * traffic AND the runtime. A canary small enough to be safe is usually too small to detect anything
 * you would actually care about, and it will report "no significant regression" either way.
 */
import { paramValue, type Lesson, type LessonScene, type Params } from "./types";

/** Two-sided 5%, 80% power. z(0.975) + z(0.80), to the precision anyone needs. */
const Z_SUM = 1.959963985 + 0.8416212336;
const Z_SUM_SQ = Z_SUM * Z_SUM;
/** Baseline pass rate of the eval set the canary is scored against. */
const P0 = 0.85;
/** Requests scored per day. */
const PER_DAY = 5000;

/** n per arm = 2 (z_a + z_b)^2 p(1-p) / delta^2. */
export const perArm = (delta: number) => (2 * Z_SUM_SQ * P0 * (1 - P0)) / (delta * delta);
export const totalNeeded = (delta: number) => 2 * perArm(delta);
/** Days at a given canary share: the small arm is the binding one. */
export const daysAt = (delta: number, share: number) => perArm(delta) / (PER_DAY * Math.max(share, 1e-9));
/** The effect a canary of this share can catch in one day. Power solved for delta. */
export const mdeInADay = (share: number) =>
  Math.sqrt((2 * Z_SUM_SQ * P0 * (1 - P0)) / (PER_DAY * Math.max(share, 1e-9)));

const pts = (v: number) => `${(v * 100).toFixed(1)} points`;
const n = (v: number) => Math.round(v).toLocaleString("en-GB");

export const statisticalPower: Lesson = {
  id: "statistical-power",
  title: "Sample size, and the square that makes small effects unaffordable",
  prompt: "Drag the regression you want to catch. Watch what it costs to catch it.",
  topicIndices: [97, 60],
  view: { x0: 0.005, x1: 0.15, y0: 0, y1: 40000 },

  params: [
    { id: "delta", label: "Regression to detect", min: 0.005, max: 0.15, step: 0.001, unit: "", value: 0.05, slider: false,
      hint: "Drag the ball. How large a drop in eval pass rate you want to be able to see." },
    { id: "share", label: "Canary share", min: 0.01, max: 0.5, step: 0.01, unit: "", value: 0.05, slider: true,
      hint: "Fraction of traffic on the new model. Smaller is safer per request and blinder overall." },
  ],
  handles: [{ id: "ball", param: "delta", axis: "x" }],

  scene(params: Params): LessonScene {
    const delta = paramValue(statisticalPower, params, "delta");
    const share = paramValue(statisticalPower, params, "share");
    const arm = perArm(delta);
    const days = daysAt(delta, share);
    const catchable = mdeInADay(share);

    const curve: Array<[number, number]> = [];
    for (let i = 0; i <= 200; i++) {
      const x = 0.005 + (0.145 * i) / 200;
      curve.push([x, Math.min(40000, perArm(x))]);
    }

    const halved = perArm(delta / 2);
    const impractical = days > 14;

    const caption = impractical
      ? `${n(arm)} per arm, which at ${(share * 100).toFixed(0)}% canary traffic is ${days.toFixed(0)} days.`
      : `${n(arm)} per arm to see a ${pts(delta)} drop - ${days.toFixed(1)} days at ${(share * 100).toFixed(0)}% traffic.`;

    const detail = impractical
      ? `Nobody runs a canary for ${days.toFixed(0)} days. In practice it runs for one, sees no significant difference, and ships - which is not evidence of no regression, it is evidence that a regression this size was never detectable at this traffic. At ${(share * 100).toFixed(0)}% the smallest drop one day can actually catch is ${pts(catchable)}.`
      : `The effect appears squared in the denominator, so halving the regression you want to catch multiplies the sample by four: ${pts(delta)} needs ${n(arm)} per arm and ${pts(delta / 2)} needs ${n(halved)}. Time scales with it, and so does the exposure of the canary arm.`;

    const arrived = delta <= 0.02
      ? `Catching a ${pts(delta)} regression needs ${n(arm)} scored requests per arm - ${days.toFixed(0)} days at this canary share. The honest options are a bigger canary, a smaller eval set with a harder threshold, a sequential test that can stop early, or accepting that regressions under a few points ship undetected. Running it for a day and reading "not significant" is not one of them.`
      : undefined;

    return {
      paths: [
        { id: "n", kind: "curve", points: curve },
      ],
      dots: [
        { id: "ball", kind: "handle", x: delta, y: Math.min(40000, arm), label: pts(delta) },
        { id: "catchable", kind: "marker", x: catchable, y: Math.min(40000, perArm(catchable)) },
      ],
      readouts: [
        { label: "regression", value: pts(delta) },
        { label: "per arm", value: n(arm) },
        { label: "days", value: days.toFixed(1) },
        { label: "half that needs", value: n(halved) },
        { label: "catchable in a day", value: pts(catchable) },
      ],
      caption,
      detail,
      arrived,
    };
  },
};
