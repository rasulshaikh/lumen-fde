/**
 * Gradient descent, as a ball you drag down a curve.
 *
 * Plan row 94: "Calculus and optimisation: gradients, chain rule, convexity, gradient descent".
 *
 * The curve is a double well on purpose. The left basin is deeper than the right one, so a ball
 * dropped on the right descends perfectly correctly into the worse answer and stops there. Nothing
 * in the algorithm is broken and nothing warns you. That is the whole of the local-minimum problem,
 * and reading the sentence never lands the way watching your own ball settle in the shallow basin
 * does.
 *
 * The learning rate is the second thing. Pull it up and the step stops being a small nudge
 * downhill: it jumps clean over the bottom and lands higher than it started. Same gradient, same
 * curve, same code - one number too big.
 */
import { paramValue, type Lesson, type LessonScene, type Params } from "./types";

/** f(x) = 0.12x^4 - 0.6x^2 + 0.15x + 1.2 - two minima, and the left one is deeper. */
const loss = (x: number) => 0.12 * x ** 4 - 0.6 * x ** 2 + 0.15 * x + 1.2;
/** f'(x), by hand rather than numerically: this lesson is about the gradient being a real thing. */
const slope = (x: number) => 0.48 * x ** 3 - 1.2 * x + 0.15;

/**
 * The two basins, and the ridge between them, solved by Newton on f' rather than estimated.
 *
 * The first version of these was eyeballed to four figures and the suite caught it: the "right
 * minimum" sat at a slope of 6.4e-3, which is not a minimum, and the lesson names the loss at these
 * points in prose the reader is asked to trust. A constant that is nearly right is exactly the kind
 * of thing that survives review and teaches a wrong number.
 */
const LEFT_MIN = -1.6402793449;
const RIGHT_MIN = 1.5144830695;
/** The local maximum between them: which basin the ball is standing in. */
const RIDGE = 0.1257962755;
/** Below this the surface is flat enough that a step barely moves. */
const FLAT = 0.03;

const fmt = (n: number, places = 3) => n.toFixed(places);

export const gradientDescent: Lesson = {
  id: "gradient-descent",
  title: "Gradient descent, and the hole you settle in",
  prompt: "Drag the ball. Take a step. Then turn the learning rate up until the step stops helping.",
  topicIndices: [94],
  view: { x0: -3, x1: 3, y0: 0, y1: 2.2 },

  params: [
    { id: "x", label: "Position", min: -3, max: 3, step: 0.01, unit: "", value: 1.9, slider: false,
      hint: "Drag the ball itself." },
    { id: "lr", label: "Learning rate", min: 0.02, max: 1.2, step: 0.01, unit: "", value: 0.15, slider: true,
      hint: "How far one step travels per unit of gradient. Small is slow. Large overshoots." },
  ],
  // The ball IS the control. No slider for position: you grab the thing on the curve.
  handles: [{ id: "ball", param: "x", axis: "x" }],
  action: { label: "Take a step", apply: (p) => takeStep(p) },

  scene(params: Params): LessonScene {
    const x = paramValue(gradientDescent, params, "x");
    const lr = paramValue(gradientDescent, params, "lr");
    const g = slope(x);
    const y = loss(x);

    // One step of plain gradient descent. The entire algorithm, on one line.
    const nextX = x - lr * g;
    const nextY = loss(nextX);

    // 120 samples reads as a smooth curve at any width this renders at.
    const curve: Array<[number, number]> = [];
    for (let i = 0; i <= 120; i++) {
      const px = -3 + (6 * i) / 120;
      curve.push([px, loss(px)]);
    }

    // The tangent, drawn as a short segment through the ball so the gradient is a slope you can
    // see rather than a number in a table.
    const reach = 0.55;
    const tangent: Array<[number, number]> = [
      [x - reach, y - g * reach],
      [x + reach, y + g * reach],
    ];

    const flat = Math.abs(g) < FLAT;
    const overshot = nextY > y + 1e-9;
    const settledIn = flat ? (x < RIDGE ? "left" : "right") : null;

    const caption = overshot
      ? `The step lands at ${fmt(nextX, 2)}, where the loss is HIGHER than where it started.`
      : flat
        ? "The gradient is nearly zero. A step from here barely moves."
        : `The slope is ${g > 0 ? "positive, so the step goes left" : "negative, so the step goes right"}.`;

    const detail = overshot
      ? "Nothing is wrong with the gradient - it still points downhill. The step is simply longer than the distance to the bottom, so it crosses the valley and climbs the far side. This is the whole of learning-rate tuning, and it is why a rate that works on one loss surface diverges on another."
      : flat
        ? "Gradient descent stops here because the gradient says stop. It has no way to know whether this is the best hole or merely the nearest one, because it can only see the ground under the ball."
        : "The gradient is the slope of the ground under the ball. The step is that slope times the learning rate, and it always points downhill - which is the guarantee, and also the entire limitation.";

    const arrived = settledIn === "right"
      ? `Settled at ${fmt(x, 2)}, loss ${fmt(loss(RIGHT_MIN))}. This is a minimum and it is not the lowest one - the left basin bottoms out at ${fmt(loss(LEFT_MIN))}. Nothing here failed. Drag the ball across to the far side and take steps from there.`
      : settledIn === "left"
        ? `Settled at ${fmt(x, 2)}, loss ${fmt(loss(LEFT_MIN))}. This is the deeper of the two basins - but the algorithm did not find it because it is deeper, it found it because it is the one you started above.`
        : undefined;

    return {
      paths: [
        { id: "loss", kind: "curve", points: curve },
        { id: "tangent", kind: "tangent", points: tangent },
        { id: "step", kind: "step", points: [[x, y], [nextX, nextY]] },
      ],
      dots: [
        { id: "ball", kind: "handle", x, y, label: `x = ${fmt(x, 2)}` },
        { id: "next", kind: "ghost", x: nextX, y: nextY, label: "one step" },
        { id: "leftmin", kind: "marker", x: LEFT_MIN, y: loss(LEFT_MIN) },
        { id: "rightmin", kind: "marker", x: RIGHT_MIN, y: loss(RIGHT_MIN) },
      ],
      readouts: [
        { label: "x", value: fmt(x, 2) },
        { label: "loss", value: fmt(y) },
        { label: "gradient", value: fmt(g) },
        { label: "step", value: `${g >= 0 ? "-" : "+"}${fmt(Math.abs(lr * g))}` },
        { label: "next loss", value: `${fmt(nextY)}${overshot ? " (higher)" : ""}` },
      ],
      caption,
      detail,
      arrived,
    } satisfies LessonScene;
  },
};

/** Applying one step is the reader's action, so it lives here rather than in the renderer. */
export const takeStep = (params: Params): Params => {
  const x = paramValue(gradientDescent, params, "x");
  const lr = paramValue(gradientDescent, params, "lr");
  const next = x - lr * slope(x);
  return { ...params, x: Math.min(3, Math.max(-3, next)) };
};

export const lossAt = loss;
export const slopeAt = slope;
export const MINIMA = { left: LEFT_MIN, right: RIGHT_MIN, ridge: RIDGE, flat: FLAT };
