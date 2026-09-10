/**
 * Attention, and what the divide by root d is actually for.
 *
 * Plan row 115: "Transformers from scratch: attention maths, positional encoding, KV cache".
 *
 * Almost everyone who can recite softmax(QK^T / sqrt(d_k))V can also not say why the divide is
 * there. The usual answer, "to normalise", is not an answer.
 *
 * Here is the real one, and it is draggable. A dot product of two d-dimensional vectors with unit
 * components has variance d, so the logits have standard deviation sqrt(d). Softmax only sees
 * DIFFERENCES between logits, so as the head gets wider those differences grow, and softmax
 * saturates toward a hard argmax: one key gets everything, the rest get nothing, and the gradient
 * through the whole thing goes to zero. Dividing by sqrt(d_k) holds the spread constant, so a wide
 * head attends exactly as softly as a narrow one.
 *
 * Drag the head width. Unscaled, attention collapses to one-hot. Scaled, the line is flat.
 */
import { paramValue, type Lesson, type LessonScene, type Params } from "./types";

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

/** Typical gap between the top two logits: two independent scores each with SD sqrt(d). */
export const logitGap = (dk: number, scaled: boolean) =>
  scaled ? Math.SQRT2 : Math.sqrt(2 * Math.max(dk, 1));
/** Weight the winning key receives, for a two-key head. Softmax of a pair is a sigmoid of the gap. */
export const topWeight = (dk: number, scaled: boolean) => sigmoid(logitGap(dk, scaled));
/** d(softmax)/d(logit) at the winner: w(1-w). Vanishes as w approaches one. */
export const gradientThrough = (dk: number, scaled: boolean) => {
  const w = topWeight(dk, scaled);
  return w * (1 - w);
};

const pct = (v: number) => `${(v * 100).toFixed(2)}%`;
const sci = (v: number) => (v < 1e-4 ? v.toExponential(1) : v.toFixed(4));

export const softmaxScale: Lesson = {
  id: "softmax-scale",
  title: "Attention, and what the divide by root d is actually for",
  prompt: "Drag the head width. Watch attention harden, then turn the scaling on.",
  topicIndices: [115],
  view: { x0: 1, x1: 512, y0: 0.5, y1: 1 },

  params: [
    { id: "dk", label: "Head width", min: 1, max: 512, step: 1, unit: "", value: 64, slider: false,
      hint: "Drag the ball. d_k, the dimension each attention head works in. 64 is typical." },
    { id: "scaled", label: "Divide by sqrt(d_k)", min: 0, max: 1, step: 1, unit: "", value: 0, slider: true,
      hint: "0 is the naive dot product. 1 is what the paper actually specifies." },
  ],
  handles: [{ id: "ball", param: "dk", axis: "x" }],

  scene(params: Params): LessonScene {
    const dk = paramValue(softmaxScale, params, "dk");
    const scaled = paramValue(softmaxScale, params, "scaled") >= 0.5;
    const w = topWeight(dk, scaled);
    const gap = logitGap(dk, scaled);
    const g = gradientThrough(dk, scaled);
    const gAt64 = gradientThrough(64, false);

    const curve: Array<[number, number]> = [];
    for (let i = 0; i <= 200; i++) {
      const x = 1 + (511 * i) / 200;
      curve.push([x, topWeight(x, scaled)]);
    }
    const other: Array<[number, number]> = [];
    for (let i = 0; i <= 200; i++) {
      const x = 1 + (511 * i) / 200;
      other.push([x, topWeight(x, !scaled)]);
    }

    const hard = w > 0.99;

    const caption = scaled
      ? `${pct(w)} to the winning key, at d_k = ${dk}. Flat: the width no longer changes anything.`
      : hard
        ? `${pct(w)} to one key at d_k = ${dk}. This is an argmax with extra steps.`
        : `${pct(w)} to the winning key at d_k = ${dk}, and climbing with the width.`;

    const detail = scaled
      ? `Dividing by sqrt(d_k) cancels the sqrt(d_k) the dot product introduced, so the logit gap is ${gap.toFixed(3)} whatever the width is. That is the entire purpose: not normalisation in any general sense, but holding the temperature of the softmax constant as the head gets wider. A 512-wide head now attends exactly as softly as a 1-wide one.`
      : hard
        ? `The gradient through this softmax is w(1-w) = ${sci(g)}. Attention has become a hard selection, and a hard selection has no useful derivative - so the layer stops learning which key to attend to, at exactly the width where you were hoping it would learn more. Nothing errors; training just quietly stops improving.`
        : `A dot product of two d-dimensional vectors accumulates d terms, so its variance is d and its spread is sqrt(d). Softmax sees only differences between logits, so widening the head widens the gaps, and a wider gap is a harder softmax. The width is acting as an inverse temperature that nobody chose.`;

    const arrived = !scaled && dk >= 256
      ? `At d_k = ${dk} the winning key takes ${pct(w)} and the gradient through the softmax is ${sci(g)} - against ${sci(gAt64)} at the usual 64. This is what the divide prevents, and why it appears in the formula rather than being an implementation detail. Turn the slider on and the whole curve becomes flat.`
      : undefined;

    return {
      paths: [
        { id: "weight", kind: "curve", points: curve },
        { id: "other", kind: "tangent", points: other },
      ],
      dots: [
        { id: "ball", kind: "handle", x: dk, y: w, label: pct(w) },
        { id: "typical", kind: "marker", x: 64, y: topWeight(64, scaled) },
      ],
      readouts: [
        { label: "head width", value: `${dk}` },
        { label: "top weight", value: pct(w) },
        { label: "logit gap", value: gap.toFixed(2) },
        { label: "gradient", value: sci(g) },
        { label: "scaling", value: scaled ? "on" : "off" },
      ],
      caption,
      detail,
      arrived,
    };
  },
};
