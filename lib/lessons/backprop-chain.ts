/**
 * Backpropagation, and the nudge that does not arrive.
 *
 * Plan row 110: "Neural network foundations: backpropagation, activations, initialisation".
 *
 * The misconception: "a vanishing gradient means something in the backward pass is wrong, or the
 * network is too small, and the fix is bigger weights." All three are false. The backward pass is
 * exact. dy/dx of a composed function is a PRODUCT of one number per layer, sigma' never exceeds
 * 0.25, and a product of small numbers is a smaller number. Nothing is broken; arithmetic is
 * happening.
 *
 * Drag the input away from centre and each layer slides into the flat part of its own sigmoid,
 * where its local derivative collapses. Three correct factors multiply to something the first layer
 * cannot feel. That is why deep networks stopped training, and it is caused here rather than read.
 *
 * The chain is deliberately the most favourable arrangement a sigmoid stack can have - each layer
 * biased to sit at the centre of the next one's range. Even this one dies.
 *
 * Every figure in the prose is computed.
 */
import { paramValue, type Lesson, type LessonScene, type Params } from "./types";

const sigma = (z: number) => 1 / (1 + Math.exp(-z));
/** sigma'(z) = sigma(z)(1 - sigma(z)). Peaks at exactly 0.25 when z = 0. */
export const dsigma = (z: number) => { const s = sigma(z); return s * (1 - s); };

/** Three sigmoid layers sharing one weight, each biased onto the centre of the one before it. */
export const chain = (x: number, w: number) => {
  const z1 = w * x, a1 = sigma(z1);
  const z2 = w * (a1 - 0.5), a2 = sigma(z2);
  const z3 = w * (a2 - 0.5), y = sigma(z3);
  const s1 = w * dsigma(z1);
  const s2 = w * dsigma(z2);
  const s3 = w * dsigma(z3);
  return { z1, a1, z2, a2, z3, y, s1, s2, s3, g: s1 * s2 * s3 };
};

/** dy/dx at x = 0 in closed form: every sigma' is exactly 0.25 there, so the product is (w/4)^3. */
export const peakGradient = (w: number) => (w / 4) ** 3;

const fmt = (n: number, d = 4) => (Math.abs(n) < 1e-4 && n !== 0 ? n.toExponential(1) : n.toFixed(d));

export const backpropChain: Lesson = {
  id: "backprop-chain",
  title: "Backpropagation, and the nudge that does not arrive",
  prompt: "Drag the input. Watch what reaches the first layer once three honest derivatives multiply.",
  topicIndices: [110],
  view: { x0: -3, x1: 3, y0: 0, y1: 1 },

  params: [
    { id: "x", label: "Input", min: -3, max: 3, step: 0.01, unit: "", value: 0, slider: false,
      hint: "Drag the ball itself. This decides where on its own sigmoid each layer is sitting." },
    { id: "w", label: "Weight scale", min: 0.6, max: 10, step: 0.1, unit: "", value: 4, slider: true,
      hint: "Every layer's weight, all the same. This is the initialisation scale, and 4 is the only value that makes a single link exactly 1." },
  ],
  handles: [{ id: "ball", param: "x", axis: "x" }],

  scene(params: Params): LessonScene {
    const x = paramValue(backpropChain, params, "x");
    const w = paramValue(backpropChain, params, "w");
    const c = chain(x, w);

    const curve: Array<[number, number]> = [];
    for (let i = 0; i <= 160; i++) {
      const px = -3 + (6 * i) / 160;
      curve.push([px, chain(px, w).y]);
    }
    // The gradient itself, scaled onto the same box so its collapse is visible beside the output.
    const peak = Math.max(peakGradient(w), 1e-9);
    const grad: Array<[number, number]> = [];
    for (let i = 0; i <= 160; i++) {
      const px = -3 + (6 * i) / 160;
      grad.push([px, Math.min(1, chain(px, w).g / peak)]);
    }

    const dead = Math.abs(c.g) < peak / 100;
    const smallest = Math.min(Math.abs(c.s1), Math.abs(c.s2), Math.abs(c.s3));

    const caption = dead
      ? `dy/dx is ${fmt(c.g)}. A nudge at the first layer changes the output by almost nothing.`
      : `dy/dx is ${fmt(c.g)}, the product of ${fmt(c.s1, 3)}, ${fmt(c.s2, 3)} and ${fmt(c.s3, 3)}.`;

    const detail = dead
      ? `Every one of those three factors is correct. The weakest is ${fmt(smallest, 3)}, which happens because that layer is sitting out on the flat part of its sigmoid where the derivative is near zero. Three correct numbers multiplied still give something the first layer cannot feel, and no amount of training fixes a gradient that never arrives.`
      : `The chain rule makes dy/dx a product, one factor per layer. sigma' can never exceed 0.25, so with a weight of ${w.toFixed(1)} each link is at most ${fmt(w * 0.25, 3)} - and three of those multiply. Depth costs you gradient before anything has gone wrong.`;

    const arrived = dead && Math.abs(x) > 1
      ? `At an input of ${x.toFixed(2)} the gradient is ${fmt(c.g)} against ${fmt(peakGradient(w))} at the centre. That is the vanishing gradient, and note what did NOT happen: no error, no warning, no NaN. Training simply stops making progress in the early layers while the loss keeps improving slightly in the late ones. This is what ReLU, residual connections and careful initialisation are all for.`
      : undefined;

    return {
      paths: [
        { id: "out", kind: "curve", points: curve },
        { id: "grad", kind: "tangent", points: grad },
      ],
      dots: [
        { id: "ball", kind: "handle", x, y: c.y, label: `x = ${x.toFixed(2)}` },
        { id: "centre", kind: "marker", x: 0, y: chain(0, w).y },
      ],
      readouts: [
        { label: "input", value: x.toFixed(2) },
        { label: "output", value: c.y.toFixed(4) },
        { label: "layer 1", value: fmt(c.s1, 3) },
        { label: "layer 2", value: fmt(c.s2, 3) },
        { label: "layer 3", value: fmt(c.s3, 3) },
        { label: "dy/dx", value: fmt(c.g) },
      ],
      caption,
      detail,
      arrived,
    };
  },
};
