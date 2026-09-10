/**
 * Where a tree splits, and why regularisation stops it splitting at all.
 *
 * Plan row 101: "Trees, random forests, gradient boosting (XGBoost/LightGBM)".
 *
 * The misconception: "the tree found a weird split, so the data must be weird" - and its sibling,
 * "more regularisation means smaller trees". Both miss that XGBoost's split choice is one equation
 * evaluated at every candidate, and that lambda and gamma act on it in completely different ways.
 *
 * Drag the split point along the feature. Gain peaks exactly where the signal changes, which is
 * reassuring. Then raise gamma and watch the whole curve drop below zero: no split anywhere in the
 * feature is worth taking, so the tree stops - not because the data ran out, but because a constant
 * you set said the improvement was not worth the leaf.
 */
import { paramValue, type Lesson, type LessonScene, type Params } from "./types";

const N = 100;
/** The real boundary in the feature. Everything left is class 0, everything right is class 1. */
const TRUE_SPLIT = 0.6;
/** Current prediction before this tree: squared loss, so g = pred - y and h = 1. */
const PRED = 0.5;

const gAt = (x: number) => PRED - (x < TRUE_SPLIT ? 0 : 1);

/** Sum of gradients and hessians on each side of a candidate split. */
export const sides = (t: number) => {
  let GL = 0, HL = 0, GR = 0, HR = 0;
  for (let i = 0; i < N; i++) {
    const x = (i + 0.5) / N;
    const g = gAt(x);
    if (x < t) { GL += g; HL += 1; } else { GR += g; HR += 1; }
  }
  return { GL, HL, GR, HR, G: GL + GR, H: HL + HR };
};

/** XGBoost's gain, unchanged: 1/2 [ GL^2/(HL+l) + GR^2/(HR+l) - G^2/(H+l) ] - gamma. */
export const gain = (t: number, lambda: number, gamma: number) => {
  const { GL, HL, GR, HR, G, H } = sides(t);
  const term = (g: number, h: number) => (g * g) / (h + lambda);
  return 0.5 * (term(GL, HL) + term(GR, HR) - term(G, H)) - gamma;
};

/** The best split available, found by evaluating every candidate - which is what the library does. */
export const bestSplit = (lambda: number, gamma: number) => {
  let best = { t: 0.5, value: -Infinity };
  for (let i = 1; i < N; i++) {
    const t = i / N;
    const v = gain(t, lambda, gamma);
    if (v > best.value) best = { t, value: v };
  }
  return best;
};

const fmt = (v: number) => v.toFixed(2);

export const splitGain: Lesson = {
  id: "split-gain",
  title: "Where a tree splits, and why regularisation stops it splitting at all",
  prompt: "Drag the split point. Find the peak, then raise gamma until there is no peak worth taking.",
  topicIndices: [101],
  view: { x0: 0.02, x1: 0.98, y0: -4, y1: 14 },

  params: [
    { id: "t", label: "Split point", min: 0.02, max: 0.98, step: 0.01, unit: "", value: 0.3, slider: false,
      hint: "Drag the ball. The threshold the tree would test on this feature." },
    { id: "lambda", label: "L2 on leaf weights", min: 0, max: 50, step: 1, unit: "", value: 1, slider: true,
      hint: "Shrinks every leaf's weight, so it shrinks every gain - but it shrinks small leaves most, which changes WHERE the best split is." },
    { id: "gamma", label: "Minimum gain to split", min: 0, max: 14, step: 0.25, unit: "", value: 0, slider: true,
      hint: "A flat toll on every split. It does not change which split is best, only whether any of them happen." },
  ],
  handles: [{ id: "ball", param: "t", axis: "x" }],

  scene(params: Params): LessonScene {
    const t = paramValue(splitGain, params, "t");
    const lambda = paramValue(splitGain, params, "lambda");
    const gamma = paramValue(splitGain, params, "gamma");
    const g = gain(t, lambda, gamma);
    const best = bestSplit(lambda, gamma);

    const curve: Array<[number, number]> = [];
    for (let i = 1; i < N; i++) {
      const x = i / N;
      curve.push([x, Math.max(-4, Math.min(14, gain(x, lambda, gamma)))]);
    }

    const nothingWorth = best.value <= 0;
    const atBest = Math.abs(t - best.t) < 0.02;

    const caption = nothingWorth
      ? `The best split available scores ${fmt(best.value)}. Nothing here is worth a leaf, so the tree stops.`
      : atBest
        ? `Gain ${fmt(g)} at ${fmt(t)} - the best split in this feature.`
        : `Gain ${fmt(g)} at ${fmt(t)}. The best is ${fmt(best.value)} at ${fmt(best.t)}.`;

    const detail = nothingWorth
      ? `Gamma is a flat toll subtracted from every candidate, so raising it does not change WHICH split is best - it changes whether the best one clears the bar. The tree stopping here is a decision you made in a config file, not something the data said, and it looks identical in the output to a feature that genuinely carries no signal.`
      : `Gain compares the sum of the two children's scores against the parent's, so it is large exactly where splitting separates the gradients. It peaks at ${fmt(best.t)} because that is where the label changes. Lambda sits in the denominators, so it shrinks every term - but it shrinks a leaf with few points hardest, because lambda is large relative to that leaf's hessian. On a clean split like this one both sides are large and the best threshold does not move at all; where it moves is on rare-category splits, which is the real reason L2 suppresses them.`;

    const arrived = gamma > 0 && nothingWorth
      ? `At gamma ${fmt(gamma)} the best gain in the entire feature is ${fmt(best.value)}, so this node becomes a leaf. Nothing about the data changed - the split at ${fmt(best.t)} is still exactly as good as it was. Lambda and gamma are both called regularisation and they do different jobs: lambda reshapes the curve, gamma raises the floor.`
      : undefined;

    return {
      paths: [
        { id: "gain", kind: "curve", points: curve },
        { id: "zero", kind: "guide", points: [[0.02, 0], [0.98, 0]] },
      ],
      dots: [
        { id: "ball", kind: "handle", x: t, y: Math.max(-4, Math.min(14, g)), label: fmt(g) },
        { id: "best", kind: "marker", x: best.t, y: Math.max(-4, Math.min(14, best.value)) },
      ],
      readouts: [
        { label: "split at", value: fmt(t) },
        { label: "gain", value: fmt(g) },
        { label: "best split", value: fmt(best.t) },
        { label: "best gain", value: fmt(best.value) },
        { label: "splits?", value: nothingWorth ? "no" : "yes" },
      ],
      caption,
      detail,
      arrived,
    };
  },
};
