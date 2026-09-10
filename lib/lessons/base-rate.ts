/**
 * Precision, prevalence, and the ROC curve that does not move.
 *
 * Plan rows 55 and 103: "Guardrails, prompt injection, red-teaming" and "Model evaluation:
 * cross-validation, leakage, metric choice". One lesson, because it is one identity - and the
 * second row is what makes the first one land.
 *
 * The misconception: "my injection classifier scores 99% on the test set, so I can put it in the
 * request path and block on it."
 *
 * Drag the prevalence down toward what production actually looks like. Precision collapses, while
 * sensitivity, specificity and the point on the ROC curve do not move by a hair - because none of
 * them contain the prevalence. That invariance is exactly why AUC looks fine on a dashboard while
 * the thing is unusable, and it is the second half of the lesson rather than a footnote.
 */
import { paramValue, type Lesson, type LessonScene, type Params } from "./types";

/** Bayes, written out. Precision = TPR*pi / (TPR*pi + FPR*(1-pi)). */
export const precision = (pi: number, tpr: number, fpr: number) => {
  const tp = tpr * pi, fp = fpr * (1 - pi);
  return tp + fp <= 0 ? 0 : tp / (tp + fp);
};
/** The prevalence at which precision is exactly a half: pi = FPR / (TPR + FPR). */
export const halfAt = (tpr: number, fpr: number) => (tpr + fpr <= 0 ? 0 : fpr / (tpr + fpr));
/** Per million requests, how many blocks are legitimate users. The number that gets you paged. */
export const falseBlocksPerMillion = (pi: number, fpr: number) => fpr * (1 - pi) * 1e6;

const pct = (v: number) => (v >= 0.01 ? `${(v * 100).toFixed(1)}%` : `${(v * 100).toFixed(3)}%`);
const prev = (v: number) => `1 in ${Math.round(1 / v).toLocaleString("en-GB")}`;

export const baseRate: Lesson = {
  id: "base-rate",
  title: "Precision, prevalence, and the ROC curve that does not move",
  prompt: "Drag the prevalence down to what production looks like. Watch which numbers move.",
  topicIndices: [55, 103],
  view: { x0: -5, x1: -0.3, y0: 0, y1: 1 },

  params: [
    { id: "logPi", label: "How often the thing actually happens", min: -5, max: -0.3, step: 0.01, unit: "", value: -1, slider: false,
      hint: "Drag the ball. The left edge is one in a hundred thousand requests; the right edge is one in two." },
    { id: "fpr", label: "False positive rate", min: 0.001, max: 0.1, step: 0.001, unit: "", value: 0.01, slider: true,
      hint: "1% sounds excellent and is what a 99%-accurate classifier usually means." },
  ],
  handles: [{ id: "ball", param: "logPi", axis: "x" }],

  scene(params: Params): LessonScene {
    const logPi = paramValue(baseRate, params, "logPi");
    const fpr = paramValue(baseRate, params, "fpr");
    const tpr = 0.99;
    const pi = 10 ** logPi;
    const p = precision(pi, tpr, fpr);
    const half = halfAt(tpr, fpr);
    const logHalf = Math.log10(half);
    const wrongly = falseBlocksPerMillion(pi, fpr);
    const rightly = tpr * pi * 1e6;

    const curve: Array<[number, number]> = [];
    for (let i = 0; i <= 200; i++) {
      const l = -5 + (4.7 * i) / 200;
      curve.push([l, precision(10 ** l, tpr, fpr)]);
    }

    const useless = p < 0.5;

    const caption = useless
      ? `At ${prev(pi)}, precision is ${pct(p)} - most of what this blocks is a legitimate user.`
      : `At ${prev(pi)}, precision is ${pct(p)}.`;

    const detail = useless
      ? `Per million requests it blocks ${Math.round(wrongly).toLocaleString("en-GB")} good ones to catch ${Math.round(rightly).toLocaleString("en-GB")} real ones. Nothing about the classifier changed while you dragged - sensitivity is still ${pct(tpr)}, specificity is still ${pct(1 - fpr)}, and the point on the ROC curve has not moved at all. That is the trap: every metric on the evaluation dashboard is prevalence-free, so none of them can tell you this is about to happen.`
      : `Precision is the one metric that depends on how often the thing actually happens, which is why it is the one that cannot be read off a balanced test set. Below ${prev(half)} it falls under a half and the majority of what you block is innocent.`;

    const arrived = pi <= 1e-4
      ? `${pct(p)} precision from a classifier that is 99% sensitive and 99% specific. The test set was balanced and production is not, and no amount of model work fixes a base rate. This is why guardrails flag rather than block, why review queues exist, and why "99% accurate" is not a deployable claim on its own.`
      : undefined;

    return {
      paths: [
        { id: "precision", kind: "curve", points: curve },
        { id: "half", kind: "guide", points: [[-5, 0.5], [-0.3, 0.5]] },
      ],
      dots: [
        { id: "ball", kind: "handle", x: logPi, y: p, label: pct(p) },
        ...(logHalf >= -5 && logHalf <= -0.3 ? [{ id: "cross", kind: "marker" as const, x: logHalf, y: 0.5 }] : []),
      ],
      readouts: [
        { label: "prevalence", value: prev(pi) },
        { label: "precision", value: pct(p) },
        { label: "sensitivity", value: pct(tpr) },
        { label: "specificity", value: pct(1 - fpr) },
        { label: "blocked in error", value: `${Math.round(wrongly).toLocaleString("en-GB")}/M` },
      ],
      caption,
      detail,
      arrived,
    };
  },
};
