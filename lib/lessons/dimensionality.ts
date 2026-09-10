/**
 * Neighbourhoods, and the word "local" in high dimensions.
 *
 * Plan row 102: "SVM, k-NN, Naive Bayes: margins, kernels, curse of dimensionality".
 *
 * The misconception: "k-NN just looks at nearby points, so it degrades gracefully as I add
 * features." Hastie's edge length says otherwise. To capture a fraction r of uniformly distributed
 * data inside a hypercube neighbourhood in d dimensions, the cube must have edge r^(1/d) - and that
 * approaches 1 fast. Long before the algorithm looks broken, "the nearest 1%" means a box covering
 * most of the range in every single dimension, which is not a neighbourhood in any useful sense.
 */
import { paramValue, type Lesson, type LessonScene, type Params } from "./types";

/** Hastie, Tibshirani and Friedman, ESL 2.5: e_d(r) = r^(1/d). */
export const edgeLength = (d: number, r: number) => Math.pow(Math.max(r, 1e-12), 1 / Math.max(d, 1));
/** The dimension at which the neighbourhood covers half of every axis. Closed form. */
export const halfAt = (r: number) => Math.log(Math.max(r, 1e-12)) / Math.log(0.5);

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

export const dimensionality: Lesson = {
  id: "dimensionality",
  title: 'Neighbourhoods, and the word "local" in high dimensions',
  prompt: "Drag the dimension count. Watch how much of each axis a 1% neighbourhood needs.",
  topicIndices: [102],
  view: { x0: 1, x1: 20, y0: 0, y1: 1 },

  params: [
    { id: "d", label: "Dimensions", min: 1, max: 20, step: 1, unit: "", value: 2, slider: false,
      hint: "Drag the ball. Features, after any encoding - one-hot a country column and this moves a long way." },
    { id: "r", label: "Fraction of the data to capture", min: 0.001, max: 0.5, step: 0.001, unit: "", value: 0.01, slider: true,
      hint: "How much of the training set you want inside the neighbourhood. Asking for less makes it worse, not better." },
  ],
  handles: [{ id: "ball", param: "d", axis: "x" }],

  scene(params: Params): LessonScene {
    const d = paramValue(dimensionality, params, "d");
    const r = paramValue(dimensionality, params, "r");
    const e = edgeLength(d, r);
    const half = halfAt(r);

    const curve: Array<[number, number]> = [];
    for (let i = 0; i <= 190; i++) {
      const x = 1 + (19 * i) / 190;
      curve.push([x, edgeLength(x, r)]);
    }

    const past = e > 0.5;
    const absurd = e > 0.8;

    const caption = absurd
      ? `In ${d} dimensions, capturing ${pct(r)} of the data needs ${pct(e)} of the range on every axis.`
      : past
        ? `${pct(e)} of every axis, to capture ${pct(r)} of the data.`
        : `${pct(e)} of every axis captures ${pct(r)} of the data in ${d} dimensions.`;

    const detail = absurd
      ? `A "neighbourhood" spanning ${pct(e)} of every dimension is not local, it is nearly the whole space with the corners trimmed. Distance stops discriminating: the nearest neighbour and the farthest one are at comparable distances, so k-NN is averaging over points that have nothing to do with the query. Nothing errors and accuracy degrades smoothly, which is why this is usually diagnosed as "needs more data".`
      : past
        ? `Past ${halfAt(r).toFixed(1)} dimensions the neighbourhood covers more than half of every axis. The edge grows as the d-th root, so each feature you add costs less than the last - and the same root is why asking for ten times less data barely shortens the box.`
        : `Volume in a hypercube is concentrated near its surface, so a small fraction of the data needs a surprisingly large box. At ${d} dimensions this is still recognisably local, which is why the intuition survives contact with two- and three-dimensional examples and fails everywhere else.`;

    const arrived = d >= 10 && e > 0.6
      ? `To find the nearest ${pct(r)} of your data in ${d} dimensions you must accept anything within ${pct(e)} of the range on every axis at once. Shrinking the neighbourhood barely helps: asking for a tenth as much data only takes the edge to ${pct(edgeLength(d, r / 10))}, because the d-th root flattens everything. There is no neighbourhood size that rescues this, only fewer dimensions.`
      : undefined;

    return {
      paths: [
        { id: "edge", kind: "curve", points: curve },
        { id: "half", kind: "guide", points: [[1, 0.5], [20, 0.5]] },
      ],
      dots: [
        { id: "ball", kind: "handle", x: d, y: e, label: pct(e) },
        ...(half >= 1 && half <= 20 ? [{ id: "cross", kind: "marker" as const, x: half, y: 0.5 }] : []),
      ],
      readouts: [
        { label: "dimensions", value: `${d}` },
        { label: "edge per axis", value: pct(e) },
        { label: "data captured", value: pct(r) },
        { label: "half-axis at", value: `${half.toFixed(1)} dims` },
        { label: "volume", value: pct(Math.pow(e, d)) },
      ],
      caption,
      detail,
      arrived,
    };
  },
};
