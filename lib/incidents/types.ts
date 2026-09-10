/**
 * An incident: a thing is broken, you have a terminal, and nobody tells you the answer.
 *
 * Build 4 of the game layer, and the one that inherits the hardest question. `TestRunner` already
 * answered it once for written answers - "nothing available here can mark that honestly, and a
 * score that looks objective while being a keyword match is worse than no score" - and that
 * reasoning still holds for prose.
 *
 * A simulation can answer it honestly for one specific thing, and only that thing: **did the
 * service come back.** That is not an opinion about your reasoning, it is a fact about the system
 * you were operating. So that is the whole of the feedback here. No score, no rating of your
 * diagnostic path, no "you used 3 of 5 optimal probes". You either fixed it or you did not, and
 * when you did not the sim says what actually changed instead.
 *
 * ## What that costs, stated plainly
 *
 * You can fix an incident by guessing. Six fixes, one works, and nothing here stops you trying
 * them in order. That is a real weakness and it is the honest trade: the alternative is grading
 * your reasoning, which is the thing this codebase has already refused once with a written reason.
 * What the sim does instead is make guessing visibly unsatisfying - a wrong fix reports the change
 * it really made, so "restarted the deployment, the pod is Pending again" is its own answer.
 *
 * ## Shape
 *
 * Same discipline as the machines, though simpler: an incident is DATA, not a function. Probe
 * output and fix consequences are fixed strings on the object, looked up by id through
 * `probeById` and `fixById`. Nothing reads a clock, nothing holds internal state, and the whole
 * thing is assertable without a DOM. (An earlier version of this comment described a
 * `probe(id, ran)` / `resolve(fixId, ran)` API that was never written.)
 */

export type Probe = {
  id: string;
  /** What the learner sees as a runnable command. */
  cmd: string;
  /** One line saying what this would tell you, shown before it is run. */
  hint: string;
  /** Terminal output. Pure: same incident, same command, same bytes. */
  output: string;
  /**
   * True when this command is one that actually contains the evidence. Used only to report, after
   * the incident closes, which evidence was on screen - never to score, never during the incident.
   */
  decisive?: boolean;
};

export type Fix = {
  id: string;
  label: string;
  cmd: string;
  /** Whether the service comes back. Exactly one fix per incident is true. */
  resolves: boolean;
  /**
   * What actually changed. For a wrong fix this is the honest consequence, and it is the only
   * feedback the learner gets - not "wrong", but "the pod is Pending again".
   */
  effect: string;
};

export type Incident = {
  id: string;
  title: string;
  /** The ticket as it arrives: what the customer said, not what is true. */
  ticket: string;
  /** The plan rows this exercises. Asserted against the real workbook. */
  topicIndices: number[];
  /** The machine that explains the system underneath, so a stuck learner has somewhere to go. */
  machineId: string | null;
  probes: Probe[];
  fixes: Fix[];
  /**
   * The root cause in one sentence, shown ONLY after the incident is resolved or given up on.
   * Never used to grade the path taken to it.
   */
  cause: string;
};

/** The one true fix. Exported so the suite can assert there is exactly one, in every incident. */
export const resolvingFix = (incident: Incident): Fix | null =>
  incident.fixes.find((f) => f.resolves) ?? null;

export const probeById = (incident: Incident, id: string): Probe | null =>
  incident.probes.find((p) => p.id === id) ?? null;

export const fixById = (incident: Incident, id: string): Fix | null =>
  incident.fixes.find((f) => f.id === id) ?? null;
