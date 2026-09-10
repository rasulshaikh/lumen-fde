/**
 * A machine is a system you can step through and break.
 *
 * The discipline is borrowed from `lib/backdrop.ts`, not the canvas. What made that file worth
 * having is that the geometry is a pure function of its inputs, so a frame can be asserted without
 * a browser and "looks about right" never has to stand in for a test. The same rule here: a
 * machine's entire behaviour is `scene(step, phase, faults)`, a pure function returning what to
 * draw. The renderer owns no logic at all.
 *
 * SVG rather than canvas, because the problem is different. The backdrop is an abstract wireframe
 * with no text; these are labelled diagrams that need crisp type, the theme's own CSS variables in
 * light and dark, and a screen reader that can reach the labels. Canvas gives none of those for
 * free and SVG gives all three.
 *
 * ## Coordinates
 *
 * Nodes are placed in a 320 x 160 space. The renderer sets that as the viewBox and lets it scale,
 * so nothing here deals in pixels and a machine reads the same on a phone as on a desktop.
 */

export type NodeKind = "actor" | "service" | "store" | "queue";

export type SceneNode = {
  id: string;
  label: string;
  x: number;
  y: number;
  kind: NodeKind;
  /** Small text under the label - a state, a count, a reason. */
  note?: string;
  /** Drawn faded: present in the system but not participating right now. */
  dim?: boolean;
  /** Drawn as broken: the learner did this, or the system did it in response. */
  down?: boolean;
};

export type SceneEdge = {
  from: string;
  to: string;
  /** A path that exists but is not carrying anything at this step. */
  dashed?: boolean;
};

/**
 * `normal` is the happy path, `retry` is the system recovering, `fault` is something going wrong,
 * and `slow` is the one that matters most in interviews: working, but not in time.
 */
export type Tone = "normal" | "retry" | "fault" | "slow";

export type SceneToken = {
  id: string;
  from: string;
  to: string;
  /** Position along the edge, 0 at `from` and 1 at `to`. A dropped token simply stops short. */
  at: number;
  label: string;
  tone: Tone;
};

export type Scene = {
  nodes: SceneNode[];
  edges: SceneEdge[];
  tokens: SceneToken[];
  /** What is happening right now, in one sentence. */
  caption: string;
  /** Why it matters - the thing an interviewer is actually asking about. */
  detail: string;
  /** Set only when a fault is changing this step. Rendered as the consequence, never as a score. */
  fault?: string;
};

export type Fault = {
  id: string;
  label: string;
  /** What breaking this is meant to teach. Shown beside the toggle. */
  blurb: string;
};

/**
 * A continuous input the reader drags.
 *
 * The difference between a diagram you operate and a thing you touch. Faults are a menu: you pick
 * one of three. A dial has no menu - you pull it and the system responds while your finger is
 * moving, and the threshold where behaviour changes is something you find by feel rather than
 * something you are told.
 *
 * That matters most where the real system has a threshold that people memorise as a rule instead
 * of understanding as arithmetic. "The pod did not fit" is a sentence. Dragging the request up
 * until it stops fitting is the same fact, learned.
 */
export type Dial = {
  id: string;
  label: string;
  min: number;
  max: number;
  /** Granularity of the drag. */
  step: number;
  /** Rendered after the value: "Gi", "ms", "tok". */
  unit: string;
  /** Where it sits before anyone touches it. The machine's healthy state. */
  value: number;
  /** What pulling it is meant to show. */
  hint: string;
};

/** Dial values by id, as the renderer holds them. */
export type Dials = Record<string, number>;

/** Reads a dial with its declared default, so a machine never sees undefined. */
export const dialValue = (machine: { dials?: Dial[] }, dials: Dials | undefined, id: string): number => {
  const declared = machine.dials?.find((d) => d.id === id);
  const raw = dials?.[id];
  if (!declared) return Number.isFinite(raw) ? (raw as number) : 0;
  if (!Number.isFinite(raw)) return declared.value;
  return Math.min(declared.max, Math.max(declared.min, raw as number));
};

/**
 * Where a drag across the stage lands.
 *
 * The whole sequence becomes one continuous track: dragging left to right walks every step and
 * every position within it, so the packet moves because your finger is moving rather than because
 * you pressed Next. Pure, so the mapping can be asserted without a pointer.
 */
export const scrubTo = (x: number, width: number, steps: number): { step: number; phase: number } => {
  if (!Number.isFinite(x) || !Number.isFinite(width) || width <= 0 || steps <= 0) return { step: 0, phase: 0 };
  const t = clamp01(x / width) * steps;
  const step = Math.min(steps - 1, Math.floor(t));
  return { step, phase: clamp01(t - step) };
};

export type Machine = {
  id: string;
  title: string;
  subtitle: string;
  /**
   * The plan rows this explains, as 0-based topic indices - the same index space `askTopic` and
   * `syllabusContext` use. Asserted against the real workbook, because a machine pointing at the
   * wrong row would teach the right thing under the wrong heading and nothing would throw.
   */
  topicIndices: number[];
  steps: string[];
  faults: Fault[];
  /** Continuous inputs, dragged rather than chosen. Optional: not every machine has a threshold. */
  dials?: Dial[];
  /**
   * PURE. Same inputs, same output, every time - asserted. `phase` runs 0..1 inside the current
   * step so tokens glide instead of jumping; a machine that ignores it simply renders static
   * positions, which is legitimate. `dials` is optional so every existing call site and every
   * assertion written before dials existed keeps working unchanged.
   */
  scene: (step: number, phase: number, faults: string[], dials?: Dials) => Scene;
};

/** Clamp helper shared by the machines, so a bad phase can never put a token off its edge. */
export const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/** Picks the step, tolerating out-of-range input rather than throwing into a render. */
export const stepAt = (step: number, count: number) =>
  count <= 0 ? 0 : Math.min(count - 1, Math.max(0, Math.floor(Number.isFinite(step) ? step : 0)));

/**
 * Easing for the step clock.
 *
 * Applied by the renderer to `phase` before it reaches `scene()`, not inside any machine - so the
 * machines stay pure functions of a linear 0..1 and their tests can keep passing exact phases.
 *
 * easeInOutQuad rather than a bounce or an elastic: a packet leaving a host accelerates and a
 * packet arriving decelerates, and neither overshoots and springs back. A bounce would be motion
 * describing something that does not happen.
 */
export const ease = (p: number): number => {
  const x = clamp01(p);
  return x < 0.5 ? 2 * x * x : 1 - ((-2 * x + 2) ** 2) / 2;
};
