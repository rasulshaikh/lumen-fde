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
  label?: string;
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
  /**
   * PURE. Same inputs, same output, every time - asserted. `phase` runs 0..1 inside the current
   * step so tokens glide instead of jumping; a machine that ignores it simply renders static
   * positions, which is legitimate.
   */
  scene: (step: number, phase: number, faults: string[]) => Scene;
};

/** Clamp helper shared by the machines, so a bad phase can never put a token off its edge. */
export const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/** Picks the step, tolerating out-of-range input rather than throwing into a render. */
export const stepAt = (step: number, count: number) =>
  count <= 0 ? 0 : Math.min(count - 1, Math.max(0, Math.floor(Number.isFinite(step) ? step : 0)));
