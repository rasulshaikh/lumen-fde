/**
 * Blocking, and why "99% accurate" is not a number about your matcher.
 *
 * Plan row 37: "Entity resolution and record linkage: blocking, fuzzy and probabilistic matching".
 *
 * The misconception: "my matcher is 99% accurate, so entity resolution is solved." Fifty thousand
 * records make 1.25 billion candidate pairs and perhaps twenty-five thousand of them are real
 * duplicates - a prior of one in fifty thousand. A matcher at 99% sensitivity and 99% specificity
 * turned loose on that returns twelve million false positives and twenty-four thousand true ones.
 *
 * Blocking is what fixes it, and it is not a CPU optimisation. Only comparing records that share a
 * key raises the prior by orders of magnitude, and the prior is what decides precision. Drag it
 * tighter and precision climbs; keep going and the key starts excluding real duplicates, so recall
 * falls off. Somewhere in between is the only defensible place to stand.
 */
import { paramValue, type Lesson, type LessonScene, type Params } from "./types";

const RECORDS = 50_000;
const TRUE_PAIRS = 25_000;
const ALL_PAIRS = (RECORDS * (RECORDS - 1)) / 2;
const TPR = 0.95;
const FPR = 0.01;

/** Candidate pairs surviving the block. Four orders of magnitude across the slider. */
export const candidatePairs = (strictness: number) => ALL_PAIRS * Math.pow(10, -4 * strictness);
/**
 * True pairs the block keeps. Near-free at first and then expensive: a loose key loses almost
 * nothing, a tight one starts splitting genuine duplicates into different blocks.
 */
export const blockingRecall = (strictness: number) => 1 - Math.pow(Math.min(strictness, 1), 6);
export const truePositives = (s: number) => TPR * TRUE_PAIRS * blockingRecall(s);
export const falsePositives = (s: number) => FPR * Math.max(candidatePairs(s) - TRUE_PAIRS * blockingRecall(s), 0);
export const precisionAt = (s: number) => {
  const tp = truePositives(s), fp = falsePositives(s);
  return tp + fp <= 0 ? 0 : tp / (tp + fp);
};
export const recallAt = (s: number) => truePositives(s) / TRUE_PAIRS;
/** Harmonic mean, only so the two curves have somewhere to cross that means something. */
export const f1At = (s: number) => {
  const p = precisionAt(s), r = recallAt(s);
  return p + r <= 0 ? 0 : (2 * p * r) / (p + r);
};

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const n = (v: number) => Math.round(v).toLocaleString("en-GB");

export const blocking: Lesson = {
  id: "blocking",
  title: "Blocking, and why 99% accurate is not a number about your matcher",
  prompt: "Drag the blocking key tighter. Watch precision climb, then watch what it costs.",
  topicIndices: [37],
  // Stops at 0.95: at exactly 1 the key splits every duplicate and both curves are identically
  // zero, which is a degenerate endpoint rather than a lesson.
  view: { x0: 0, x1: 0.95, y0: 0, y1: 1 },

  params: [
    { id: "s", label: "Blocking strictness", min: 0, max: 0.95, step: 0.005, unit: "", value: 0, slider: false,
      hint: "Drag the ball. 0 compares every pair; 1 only compares records that agree on almost everything." },
  ],
  handles: [{ id: "ball", param: "s", axis: "x" }],

  scene(params: Params): LessonScene {
    const s = paramValue(blocking, params, "s");
    const pairs = candidatePairs(s);
    const p = precisionAt(s);
    const r = recallAt(s);
    const tp = truePositives(s);
    const fp = falsePositives(s);

    const pCurve: Array<[number, number]> = [];
    const rCurve: Array<[number, number]> = [];
    for (let i = 0; i <= 200; i++) {
      const x = (0.95 * i) / 200;
      pCurve.push([x, precisionAt(x)]);
      rCurve.push([x, recallAt(x)]);
    }

    const drowning = p < 0.2;
    const overTight = r < 0.7;

    const caption = drowning
      ? `${n(fp)} false pairs against ${n(tp)} real ones. Precision ${pct(p)}.`
      : overTight
        ? `Precision ${pct(p)}, but the key has thrown away ${pct(1 - r)} of the real duplicates.`
        : `Precision ${pct(p)}, recall ${pct(r)}, from ${n(pairs)} candidate pairs.`;

    const detail = drowning
      ? `Nothing is wrong with the matcher: it is still ${pct(TPR)} sensitive and ${pct(1 - FPR)} specific, exactly as the test set said. The problem is the prior. Out of ${n(pairs)} candidate pairs only ${n(TRUE_PAIRS)} are real, so a 1% false positive rate produces far more wrong answers than there are right ones to find. No threshold rescues this.`
      : overTight
        ? `The key is now so tight that genuine duplicates land in different blocks and are never compared at all. Recall lost to blocking cannot be recovered downstream - the matcher never sees those pairs, so no threshold, model or review queue will find them. This is the failure that does not show up in any precision number.`
        : `Blocking raised the prior from one in ${n(ALL_PAIRS / TRUE_PAIRS)} to one in ${n(Math.max(pairs / Math.max(tp, 1), 1))}, and precision followed it. The matcher has not changed at all while you dragged - this is entirely a change in what it is being asked to look at.`;

    const arrived = s > 0.55 && p > 0.5 && r > 0.8
      ? `Precision ${pct(p)} at recall ${pct(r)}, from the same matcher that scored ${pct(precisionAt(0))} with no blocking. Every point of that came from choosing what to compare rather than from the model. This is why entity resolution work is mostly key design, and why "our matcher is 99% accurate" describes a test set rather than a system.`
      : undefined;

    return {
      paths: [
        { id: "precision", kind: "curve", points: pCurve },
        { id: "recall", kind: "tangent", points: rCurve },
      ],
      dots: [
        { id: "ball", kind: "handle", x: s, y: p, label: pct(p) },
        { id: "rec", kind: "ghost", x: s, y: r, label: "recall" },
      ],
      readouts: [
        { label: "candidate pairs", value: n(pairs) },
        { label: "precision", value: pct(p) },
        { label: "recall", value: pct(r) },
        { label: "true found", value: n(tp) },
        { label: "false pairs", value: n(fp) },
      ],
      caption,
      detail,
      arrived,
    };
  },
};
