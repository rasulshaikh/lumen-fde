/**
 * Finite differences, and the error that grows as the step shrinks.
 *
 * Plan row 112: "PyTorch at depth: tensors, autograd, Dataset and DataLoader, the training loop".
 *
 * The misconception is almost universal and it is backwards: "a smaller h gives a more accurate
 * derivative." Total error is truncation plus roundoff, truncation falls as h squared and roundoff
 * rises as one over h, so the sum is U-shaped. Below the optimum, making h smaller makes the answer
 * WORSE - you are subtracting two nearly equal floats and keeping the noise.
 *
 * This is why gradcheck has a tolerance and an eps you are told not to touch, and why anyone who
 * has debugged a "wrong" analytic gradient by shrinking h has chased their own rounding error.
 */
import { paramValue, type Lesson, type LessonScene, type Params } from "./types";

const EPS = Number.EPSILON;

/** Central-difference truncation: h^2 |f'''| / 6. */
export const truncation = (h: number, third: number) => (h * h * Math.abs(third)) / 6;
/** Roundoff from subtracting two nearly equal values: eps |f| / h. */
export const roundoff = (h: number, scale: number) => (EPS * Math.abs(scale)) / Math.max(h, 1e-300);
export const totalError = (h: number, third: number, scale: number) => truncation(h, third) + roundoff(h, scale);
/** d/dh of the sum, set to zero: h* = (3 eps |f| / |f'''|)^(1/3). Closed form, not searched. */
export const optimalH = (third: number, scale: number) =>
  Math.cbrt((3 * EPS * Math.abs(scale)) / Math.max(Math.abs(third), 1e-300));

const sci = (v: number) => v.toExponential(1);

export const stepSize: Lesson = {
  id: "step-size",
  title: "Finite differences, and the error that grows as the step shrinks",
  prompt: "Drag the step size down. Find where making it smaller starts making it worse.",
  topicIndices: [112],
  view: { x0: -16, x1: -1, y0: -18, y1: 0 },

  params: [
    { id: "logH", label: "Step size", min: -16, max: -1, step: 0.05, unit: "", value: -3, slider: false,
      hint: "Drag the ball. This is the h in (f(x+h) - f(x-h)) / 2h, on a log scale." },
    { id: "scale", label: "Magnitude of f", min: 1, max: 1000, step: 1, unit: "", value: 1, slider: true,
      hint: "How large the function's values are. Bigger values carry more absolute rounding error, so the floor rises with them." },
  ],
  handles: [{ id: "ball", param: "logH", axis: "x" }],

  scene(params: Params): LessonScene {
    const logH = paramValue(stepSize, params, "logH");
    const scale = paramValue(stepSize, params, "scale");
    const third = 1;
    const h = 10 ** logH;
    const err = totalError(h, third, scale);
    const best = optimalH(third, scale);
    const logBest = Math.log10(best);
    const bestErr = totalError(best, third, scale);

    const curve: Array<[number, number]> = [];
    const trunc: Array<[number, number]> = [];
    for (let i = 0; i <= 200; i++) {
      const l = -16 + (15 * i) / 200;
      curve.push([l, Math.max(-18, Math.log10(totalError(10 ** l, third, scale)))]);
      trunc.push([l, Math.max(-18, Math.log10(truncation(10 ** l, third)))]);
    }

    const tooSmall = logH < logBest;
    const dominant = roundoff(h, scale) > truncation(h, third) ? "roundoff" : "truncation";

    const caption = tooSmall
      ? `h = ${sci(h)} gives error ${sci(err)} - worse than at the optimum, and shrinking h further makes it worse still.`
      : `h = ${sci(h)} gives error ${sci(err)}, dominated by ${dominant}.`;

    const detail = tooSmall
      ? `f(x+h) and f(x-h) now agree to most of their digits, so the subtraction cancels the signal and keeps the rounding error, then divides it by a tiny h. The best achievable is ${sci(bestErr)} at h = ${sci(best)}, and no step size does better - which means a finite-difference gradient check has an accuracy floor around the cube root of machine epsilon, roughly six digits, however carefully it is done.`
      : `Truncation error falls as h squared, so the left half of this curve is the part everyone knows. Roundoff rises as one over h and owns the other half. The sum is U-shaped, and the minimum sits at the cube root of eps times the function scale rather than anywhere near the smallest representable step.`;

    const arrived = logH <= -14
      ? `At h = ${sci(h)} the error is ${sci(err)}, which is ${(err / bestErr).toFixed(0)} times worse than at h = ${sci(best)}. Anyone who has "verified" an analytic gradient by shrinking h until the numbers stopped matching was reading this side of the curve. It is also why torch.autograd.gradcheck uses a fixed eps of 1e-6 and a tolerance rather than pushing h toward zero.`
      : undefined;

    return {
      paths: [
        { id: "total", kind: "curve", points: curve },
        { id: "truncation", kind: "tangent", points: trunc },
      ],
      dots: [
        { id: "ball", kind: "handle", x: logH, y: Math.max(-18, Math.log10(err)), label: sci(h) },
        { id: "best", kind: "marker", x: logBest, y: Math.log10(bestErr) },
      ],
      readouts: [
        { label: "h", value: sci(h) },
        { label: "total error", value: sci(err) },
        { label: "truncation", value: sci(truncation(h, third)) },
        { label: "roundoff", value: sci(roundoff(h, scale)) },
        { label: "best h", value: sci(best) },
      ],
      caption,
      detail,
      arrived,
    };
  },
};
