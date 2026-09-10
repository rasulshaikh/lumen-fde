/**
 * Cross-entropy, and the price of being sure.
 *
 * Plan row 98: "Information theory and loss functions: entropy, KL, cross-entropy".
 *
 * The misconception this kills: "more confidence is better - if the model is usually right,
 * sharpening towards 1.00 can only help." Drag the prediction toward the wrong answer and the loss
 * does not rise gently, it goes vertical, because it is minus a logarithm and a logarithm has no
 * floor. Being 99% sure and wrong costs many times what being unsure and wrong costs.
 *
 * The second half is the truth slider. At q = 1 the outcome is certain and the entire loss is the
 * model's to remove. Below 1 the outcome is genuinely random, H(P) is not zero, and part of the
 * loss stops being anyone's fault - which is the floor people mistake for underfitting.
 *
 * ## Every number in the prose is computed
 *
 * Six lesson designs went through an adversarial maths check and every one came back the same way:
 * the model was right and the hard-coded figures quoted in the captions were wrong. So nothing here
 * states a number it does not compute on the spot. Relationships go in prose; numbers go in
 * readouts or in an interpolation.
 */
import { paramValue, type Lesson, type LessonScene, type Params } from "./types";

/** x ln x, with the information-theory convention 0 ln 0 = 0. Without it H(1) is NaN. */
const xlnx = (t: number) => (t > 0 ? t * Math.log(t) : 0);

/** H(P): how much of the loss is the coin's rather than the model's. Written 0 - (...) so q=1 gives 0, not -0. */
export const entropy = (q: number) => 0 - (xlnx(q) + xlnx(1 - q));

/**
 * CE(P,Q) in nats.
 *
 * Each term is guarded by its own coefficient, not by trusting p to be clamped. With q = 1 the
 * second coefficient is 0 and the second log is log(0) = -Infinity, and 0 * -Infinity is NaN, not
 * 0. The parameter clamps p away from the edges but the marker for "the best you can do" is drawn
 * at p = q, which reaches 1 - so the unguarded version put a NaN coordinate on screen at the
 * resting state. A NaN coordinate is an invisible path rather than an error.
 */
export const crossEnt = (p: number, q: number) =>
  0 - ((q > 0 ? q * Math.log(p) : 0) + (1 - q > 0 ? (1 - q) * Math.log(1 - p) : 0));

/**
 * KL(P||Q), computed independently rather than as CE - H.
 *
 * Deriving it by subtraction would make the identity CE = H + KL true by construction, and the
 * readout showing it would be a tautology rather than a check. Computed separately, the suite can
 * assert the identity and mean it.
 */
export const kldiv = (p: number, q: number) =>
  (q > 0 ? q * Math.log(q / p) : 0) + (1 - q > 0 ? (1 - q) * Math.log((1 - q) / (1 - p)) : 0);

/**
 * dCE/dp = (p - q) / (p(1-p)), by hand.
 *   CE(p) = -q ln p - (1-q) ln(1-p)
 *   CE'(p) = -q/p + (1-q)/(1-p) = [-q(1-p) + (1-q)p] / (p(1-p)) = (p - q) / (p(1-p))
 * Zero exactly at p = q. This is the number that makes "vertical" a fact rather than a description.
 */
export const dLoss = (p: number, q: number) => (p - q) / (p * (1 - p));

const fmt = (n: number, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : "∞");

export const crossEntropy: Lesson = {
  id: "cross-entropy",
  title: "Cross-entropy, and the price of being sure",
  prompt: "Drag your prediction. Take it toward the wrong answer and watch what confidence costs.",
  topicIndices: [98],
  view: { x0: 0, x1: 1, y0: 0, y1: 5 },

  params: [
    { id: "p", label: "Your prediction", min: 0.01, max: 0.99, step: 0.01, unit: "", value: 0.7, slider: false,
      hint: "Drag the ball itself." },
    { id: "q", label: "How certain the outcome really is", min: 0.6, max: 1, step: 0.01, unit: "", value: 1, slider: true,
      hint: "1.00 is a hard label: the outcome is fixed and the whole loss is yours to remove. Below that, part of it belongs to the coin and no model can take it away." },
  ],
  handles: [{ id: "ball", param: "p", axis: "x" }],

  scene(params: Params): LessonScene {
    const p = paramValue(crossEntropy, params, "p");
    const q = paramValue(crossEntropy, params, "q");
    const ce = crossEnt(p, q);
    const h = entropy(q);
    const kl = kldiv(p, q);
    const g = dLoss(p, q);

    const curve: Array<[number, number]> = [];
    for (let i = 0; i <= 200; i++) {
      const x = 0.005 + (0.99 * i) / 200;
      curve.push([x, Math.min(5, crossEnt(x, q))]);
    }

    // The floor: the part of the loss that is the outcome's own randomness, not the model's error.
    const floor: Array<[number, number]> = [[0, h], [1, h]];
    // What the same wrongness costs the other way round. The asymmetry, drawn rather than argued.
    const mirrored = crossEnt(1 - p, q);

    const wrongSide = p < q - 0.005;
    const atBest = Math.abs(p - q) < 0.005;
    const ratio = mirrored > 0 ? ce / mirrored : 1;

    const caption = atBest
      ? `As close as this prediction can get. The loss is ${fmt(ce)} nats and it will not go lower.`
      : wrongSide
        ? `Leaning the wrong way. The loss is ${fmt(ce)} nats, ${fmt(ratio, 1)} times what the mirror-image prediction would cost.`
        : `The loss is ${fmt(ce)} nats, and the slope under the ball is ${fmt(g)}.`;

    const detail = atBest
      ? h > 0.005
        ? `The loss stops at H = ${fmt(h)} rather than at zero, because the outcome itself is uncertain. That floor is not underfitting and no amount of training removes it. Only the part above it, KL = ${fmt(kl)}, was ever yours.`
        : "The outcome is certain here, so the floor is zero and every nat of loss is the model's to remove. That is the only setting where driving the loss to zero is a coherent goal."
      : `Cross-entropy is minus the log of the probability you put on what actually happened, so the penalty has no floor - as the probability approaches zero the loss approaches infinity. The gradient is ${fmt(g)} right now, and it grows without bound in the same direction.`;

    const arrived = p <= 0.02 && q >= 0.99
      ? `At ${fmt(p)} on an outcome that is certain, the loss is ${fmt(ce)} nats against ${fmt(crossEnt(0.5, q))} for saying "I do not know". Confidence in the wrong direction is the most expensive thing a model can do, and a model that is right most of the time can still be dominated by the few times it was sure and wrong.`
      : undefined;

    return {
      paths: [
        { id: "ce", kind: "curve", points: curve },
        { id: "floor", kind: "guide", points: floor },
      ],
      dots: [
        { id: "ball", kind: "handle", x: p, y: Math.min(5, ce), label: `p = ${fmt(p)}` },
        { id: "mirror", kind: "ghost", x: 1 - p, y: Math.min(5, mirrored), label: "mirrored" },
        { id: "best", kind: "marker", x: Math.min(0.99, q), y: Math.min(5, crossEnt(Math.min(0.99, q), q)) },
      ],
      readouts: [
        { label: "prediction", value: fmt(p) },
        { label: "loss", value: `${fmt(ce)} nats` },
        { label: "floor H", value: fmt(h) },
        { label: "KL", value: fmt(kl) },
        { label: "slope", value: fmt(g, 1) },
      ],
      caption,
      detail,
      arrived,
    };
  },
};
