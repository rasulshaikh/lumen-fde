/**
 * The same five steps, in two orders, with completely different meanings.
 *
 * Explains plan row 104, "Feature engineering, selection, imbalanced data: SMOTE, class weights,
 * target encoding".
 *
 * There is nothing to learn here about what target encoding or SMOTE do. The content is entirely
 * about which side of the train/test split each one sits on, and that is not a detail - it is the
 * difference between a model that works and a number that lies. Every fault in this machine makes
 * the reported score go UP. That is what makes leakage the most dangerous class of mistake in
 * applied machine learning: the feedback signal points the wrong way, so the harder you tune, the
 * more thoroughly you are fooled.
 *
 * The thing to take away is a habit rather than a fact. Anything that learns a parameter from data -
 * a mean, a scale, a category's target rate, a set of synthetic neighbours - must learn it inside
 * the split, and be applied outward.
 */
import { clamp01, stepAt, type Machine, type Scene, type SceneNode } from "./types";

const ENCODE_FIRST = "encode-first";
const RESAMPLE_FIRST = "resample-first";
const SCALE_ON_ALL = "scale-on-all";

const PLACES: Array<[string, string, number, number, "actor" | "service" | "store"]> = [
  ["raw", "Raw table", 30, 44, "store"],
  ["split", "Split", 108, 44, "service"],
  ["enc", "Target encode", 192, 44, "service"],
  ["res", "Resample", 262, 108, "service"],
  ["fit", "Fit", 160, 132, "service"],
  ["score", "Validation score", 46, 126, "actor"],
];

const EDGES = [
  { from: "raw", to: "split", dashed: true },
  { from: "split", to: "enc", dashed: true },
  { from: "enc", to: "res", dashed: true },
  { from: "res", to: "fit", dashed: true },
  { from: "fit", to: "score", dashed: true },
  { from: "raw", to: "enc", dashed: true },
  { from: "raw", to: "res", dashed: true },
];

export const leakageOrder: Machine = {
  id: "leakage-order",
  title: "Five steps, two orders, two different meanings",
  short: "Leakage by order",
  subtitle: "Nothing here is about what the transforms do. It is about which side of the split each one sits on.",
  topicIndices: [104],
  steps: ["Raw table", "Split", "Target encode", "Resample", "Fit", "Score"],
  faults: [
    { id: ENCODE_FIRST, label: "Target encode before the split", blurb: "Each category's encoded value now contains the labels of rows in the validation set. The model is reading its own answers." },
    { id: RESAMPLE_FIRST, label: "SMOTE before the split", blurb: "Synthetic points are interpolated between training rows and then land in validation, so the model is scored on near-copies of what it trained on." },
    { id: SCALE_ON_ALL, label: "Fit the scaler on everything", blurb: "The mildest of the three and the most common. The scaler carries the validation set's distribution into training." },
  ],

  scene(step, phase, faults): Scene {
    const p = clamp01(phase);
    const s = stepAt(step, 6);
    const encFirst = faults.includes(ENCODE_FIRST);
    const resFirst = faults.includes(RESAMPLE_FIRST);
    const scaleAll = faults.includes(SCALE_ON_ALL);
    const leaking = encFirst || resFirst || scaleAll;

    const nodes = (notes: Record<string, string> = {}, downs: string[] = []): SceneNode[] =>
      PLACES.map(([id, label, x, y, kind]) => ({ id, label, x, y, kind, note: notes[id], down: downs.includes(id) }));
    const base = { edges: EDGES };

    if (s === 0) {
      return { ...base, nodes: nodes({ raw: "80k rows, 2% positive" }),
        tokens: [{ id: "r", from: "raw", to: "split", at: p, label: "80,000 rows", tone: "normal" }],
        caption: "One table, badly imbalanced, with a high-cardinality categorical column.",
        detail: "Two percent positives and a merchant_id with nine thousand distinct values. Both of those invite a transform that learns from the labels, and both of those transforms are the ones that must not see the validation set." };
    }

    if (s === 1) {
      const early = [encFirst ? "encoding" : "", resFirst ? "resampling" : "", scaleAll ? "scaling" : ""].filter(Boolean);
      return { ...base, nodes: nodes({ split: early.length ? `after ${early.join(" and ")}` : "60k train / 20k validation" }, early.length ? ["split"] : []),
        tokens: [{ id: "sp", from: early.length ? "raw" : "split", to: early.length ? "enc" : "enc", at: p,
          label: early.length ? "already contaminated" : "60k / 20k", tone: early.length ? "fault" : "normal" }],
        caption: early.length
          ? `The split happens, but ${early.join(" and ")} already ran across all 80,000 rows.`
          : "The split comes first. Everything after it is fitted on training rows only.",
        detail: early.length
          ? "A split is only a boundary if it comes before anything that learns. Once a transform has seen all 80,000 rows, drawing a line through them afterwards separates nothing - the validation rows have already influenced numbers that are about to be handed to the model."
          : "This is the only ordering decision in the machine and it determines every other one. Putting the split first is not a convention; it is what makes the validation set a stand-in for data the model has never seen, which is the single thing it is for.",
        fault: early.length ? "The boundary was drawn after the leak." : undefined };
    }

    if (s === 2) {
      if (encFirst) {
        return { ...base, nodes: nodes({ enc: "means include validation labels" }, ["enc"]),
          tokens: [{ id: "e", from: "raw", to: "enc", at: p, label: "mean over all 80k", tone: "fault" }],
          caption: "Each merchant's encoded value is a mean that includes validation rows' labels.",
          detail: "For a merchant appearing three times, with one of those rows in validation, the encoded feature effectively contains that row's answer. The model does not have to learn anything about the merchant - the feature is the label, slightly blurred. Validation accuracy climbs, the feature ranks top of the importance table, and production performance is nothing like it. Target encoding has to be computed out-of-fold: for each training fold, encode using only the other folds, and encode validation using the training data alone.",
          fault: "The feature contains the answer." };
      }
      return { ...base, nodes: nodes({ enc: "out-of-fold, train only" }),
        tokens: [{ id: "e", from: "split", to: "enc", at: p, label: "out-of-fold means", tone: "normal" }],
        caption: "Encoding is computed out-of-fold, from training rows only.",
        detail: "Out-of-fold means a training row's own label never contributes to its own encoded value either - otherwise the leak is just smaller and internal. Smoothing towards the global mean handles the rare categories, where a mean over two rows is noise wearing the costume of a feature." };
    }

    if (s === 3) {
      if (resFirst) {
        return { ...base, nodes: nodes({ res: "synthetic rows in validation" }, ["res"]),
          tokens: [{ id: "s", from: "raw", to: "res", at: p, label: "SMOTE over all 80k", tone: "fault" }],
          caption: "Synthetic minority points were interpolated across the whole table, then split.",
          detail: "SMOTE creates new points between existing minority examples. Run before the split, a synthetic point built from two training rows can land in validation - so the model is scored on something it essentially constructed. The reported recall is excellent and means nothing. Resample inside the training fold only, never touch validation, and keep in mind that the validation set must retain the real class balance or the metric no longer describes the problem.",
          fault: "Scored on points derived from its own training data." };
      }
      return { ...base, nodes: nodes({ res: "train fold only, 2% kept in validation" }),
        tokens: [{ id: "s", from: "enc", to: "res", at: p, label: "resample train", tone: "normal" }],
        caption: "Resampling applies to the training fold. Validation keeps its real imbalance.",
        detail: "Worth asking whether to resample at all: class weights in the loss achieve much of the same thing without inventing data, and for many models a well-chosen decision threshold on calibrated probabilities beats both. SMOTE is the default people reach for and is rarely the best answer." };
    }

    if (s === 4) {
      return { ...base, nodes: nodes({ fit: scaleAll ? "scaler saw all 80k" : "scaler fitted on train" }, scaleAll ? ["fit"] : []),
        tokens: [{ id: "f", from: "res", to: "fit", at: p, label: scaleAll ? "leaked scale" : "fit", tone: scaleAll ? "slow" : "normal" }],
        caption: scaleAll
          ? "The scaler's mean and variance were computed over every row, including validation."
          : "The model is fitted, with every transform having learned from training rows only.",
        detail: scaleAll
          ? "This is the mildest leak on the machine and by far the most common, because it is what happens when you call fit_transform on the whole frame out of habit. The effect on the score is usually small, which is exactly why it survives review, and it is not small when the validation set has a different distribution - which is the case where you most needed the number to be honest. A pipeline object that binds the transforms to the estimator makes this mistake structurally difficult to make, which is a better defence than remembering."
          : "Everything the model has seen came from inside the boundary. Now the validation score is a prediction about unseen data rather than a description of data already used.",
        fault: scaleAll ? "Scaling parameters learned from validation." : undefined };
    }

    return { ...base, nodes: nodes({ score: leaking ? "0.94, and false" : "0.81, and real" }, leaking ? ["score"] : []),
      tokens: [{ id: "sc", from: "fit", to: "score", at: p, label: leaking ? "AUC 0.94" : "AUC 0.81", tone: leaking ? "fault" : "normal" }],
      caption: leaking
        ? "The score went up. That is what every fault on this machine does."
        : "A lower number, and the only one that predicts anything.",
      detail: leaking
        ? "Leakage does not announce itself with an error, it announces itself with a good result - so the feedback loop you are using to make decisions is pointing in the wrong direction, and every hour spent tuning makes the deception more thorough. The practical tells: a score that jumps when a transform is added, a feature whose importance is implausibly dominant, and a gap between validation and the first week in production. The structural fix is a pipeline, where the transforms are fitted inside each fold by construction and the ordering mistake becomes hard to express."
        : "0.81 is worse and is the number to make decisions with. A leaked 0.94 is not an optimistic estimate of production performance - it is not an estimate of anything, because the quantity it measures does not exist outside the experiment.",
      fault: leaking ? "A score that is higher because it is wrong." : undefined };
  },
};
