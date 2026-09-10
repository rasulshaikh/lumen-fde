/**
 * A lesson is a small piece of maths you hold in your hand.
 *
 * The machines in `lib/machines/` are sequences: a system moves through stages and you walk it.
 * This is the other shape, the one axonlearn.app is built out of - a single continuous thing where
 * your finger is the input and the maths responds while you are still moving. Drag a ball down a
 * loss curve. Pull the learning rate up until the step overshoots.
 *
 * ## Why a separate primitive rather than more machines
 *
 * Each machine is a hand-written `scene()` of roughly 130 lines, because each one describes a
 * different system with different stages. That is the right shape for "how does a scheduler place
 * a pod" and the wrong shape for "what does a gradient do", and it does not scale: three of them
 * took hours, and the plan has 119 topics.
 *
 * A lesson is mostly DATA. It declares its parameters, which of them are draggable, the window it
 * draws in, and one pure function from parameters to what is on screen. The engine - projection,
 * pointer maths, inverse mapping from a pixel back to a value, rendering, accessibility - is
 * written once, here. Authoring a new lesson is then a curve, a couple of parameters and a caption
 * table, which is minutes rather than a day.
 *
 * ## Everything stays pure
 *
 * `scene(params)` takes numbers and returns what to draw. No clock, no pointer, no DOM. Same
 * discipline as `lib/backdrop.ts` and `lib/machines/`, for the same reason: the interesting part
 * is assertable without a browser, and the browser-only part is reduced to "where is the finger".
 */

/** A named number the reader can change. Dragged via a handle, or pulled on a slider, or both. */
export type Param = {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  /** Resting value, before anything is touched. */
  value: number;
  /** Shown beside the control. What moving it is meant to show. */
  hint: string;
  /** When false the parameter is derived or dragged only, and gets no slider. */
  slider?: boolean;
};

/** Parameter values by id. */
export type Params = Record<string, number>;

/**
 * A draggable point inside the diagram.
 *
 * This is what a slider is not. A slider is a control beside the thing; a handle IS the thing -
 * you grab the ball on the curve, not a track underneath it. `param` says which value the drag
 * writes and `axis` says which direction of the drag carries it.
 */
export type Handle = {
  /** Must match a dot id returned by `scene`. */
  id: string;
  param: string;
  axis: "x" | "y";
};

export type PathKind = "curve" | "guide" | "step" | "tangent";
export type DotKind = "handle" | "marker" | "ghost";

export type LessonPath = { id: string; kind: PathKind; points: Array<[number, number]>; label?: string };
export type LessonDot = { id: string; kind: DotKind; x: number; y: number; label?: string };

export type LessonScene = {
  paths: LessonPath[];
  dots: LessonDot[];
  /** Live numbers, in the order they should be read. */
  readouts: Array<{ label: string; value: string }>;
  /** What is true right now, in one sentence. Changes while the finger moves. */
  caption: string;
  /** Why it matters. Changes less often - only when the reader crosses something meaningful. */
  detail: string;
  /** Set when the reader has reached the thing the lesson exists to show. Never a score. */
  arrived?: string;
};

export type Lesson = {
  id: string;
  title: string;
  /** The instruction, in one line. "Drag the ball. Find the bottom." */
  prompt: string;
  /** Plan rows this teaches, asserted against the workbook. */
  topicIndices: number[];
  /** The window the lesson draws in, in its own units. */
  view: { x0: number; x1: number; y0: number; y1: number };
  params: Param[];
  handles: Handle[];
  /** PURE. Numbers in, drawing out. */
  scene: (params: Params) => LessonScene;
  /**
   * An action the lesson offers beyond dragging, if it has one.
   *
   * Only gradient descent does: "take a step" is the algorithm, so watching it move on its own is
   * part of the lesson. The other four are pure manipulation and offer nothing here - and the
   * button is only rendered when this exists, because a control wired to another lesson's function
   * is the dead-control defect this repo keeps producing. It shipped that way for about ten
   * minutes.
   */
  action?: { label: string; apply: (params: Params) => Params };
};

/** Clamps a parameter into its declared range, tolerating a hand-edited or missing value. */
export const paramValue = (lesson: Lesson, params: Params | undefined, id: string): number => {
  const declared = lesson.params.find((p) => p.id === id);
  const raw = params?.[id];
  if (!declared) return Number.isFinite(raw) ? (raw as number) : 0;
  if (!Number.isFinite(raw)) return declared.value;
  return Math.min(declared.max, Math.max(declared.min, raw as number));
};

/** All parameters at rest. What the lesson looks like before it is touched. */
export const restingParams = (lesson: Lesson): Params =>
  Object.fromEntries(lesson.params.map((p) => [p.id, p.value]));

/**
 * Lesson space to a 0..1 box, and back.
 *
 * Kept here rather than in the renderer because the inverse is the whole of dragging: a pointer
 * arrives as a pixel and has to become a value in the lesson's own units, clamped to the
 * parameter's range. Getting that backwards is how a handle ends up drifting away from the finger,
 * and it is arithmetic, so it is testable.
 */
export const toUnit = (v: number, lo: number, hi: number): number =>
  hi === lo ? 0 : Math.min(1, Math.max(0, (v - lo) / (hi - lo)));

export const fromUnit = (u: number, lo: number, hi: number): number => lo + (hi - lo) * Math.min(1, Math.max(0, u));

/** Rounds to a parameter's step, so a drag lands on values a reader can read back. */
export const quantise = (v: number, step: number): number => {
  if (!Number.isFinite(v)) return 0;
  if (!Number.isFinite(step) || step <= 0) return v;
  const snapped = Math.round(v / step) * step;
  // Floating point: 0.1 steps otherwise produce 1.7000000000000002 in a readout.
  const places = Math.max(0, Math.ceil(-Math.log10(step)));
  return Number(snapped.toFixed(Math.min(10, places)));
};

/**
 * Where a pointer inside the diagram lands, as a parameter value.
 *
 * `px`/`py` are pixels relative to the drawing box. Returns null when the lesson has no handle for
 * that id, rather than guessing - a drag on nothing should do nothing.
 */
export function dragToParam(
  lesson: Lesson,
  handleId: string,
  px: number,
  py: number,
  width: number,
  height: number,
): { param: string; value: number } | null {
  const handle = lesson.handles.find((h) => h.id === handleId);
  if (!handle) return null;
  const declared = lesson.params.find((p) => p.id === handle.param);
  if (!declared) return null;
  if (!(width > 0) || !(height > 0)) return null;

  const { x0, x1, y0, y1 } = lesson.view;
  // y is inverted: pixels grow downward, lesson space grows upward.
  const raw = handle.axis === "x"
    ? fromUnit(px / width, x0, x1)
    : fromUnit(1 - py / height, y0, y1);

  const clamped = Math.min(declared.max, Math.max(declared.min, raw));
  return { param: handle.param, value: quantise(clamped, declared.step) };
}
