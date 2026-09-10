/**
 * The machine you left broken, waiting exactly where you left it.
 *
 * Build 3 of the game layer: the thing that gets you into the recall bank without deciding to.
 *
 * ## Why this and not the usual hook
 *
 * Every standard pull is one this product refuses in writing. `lib/review.ts` will not surface a
 * backlog count - "'37 due', close it forever". `lib/motivation.ts` refuses a chain: "a gap moves
 * the rate and leaves the run standing". `components/TestRunner.tsx` refuses a score.
 * `lib/companion/context.ts` refuses to congratulate anyone for pressing a button. Points,
 * streaks, scores and praise are the whole genre, and all four are off the table here.
 *
 * What is left is an open loop. You cordoned a node and walked away, and the pod is still Pending.
 * That is not an obligation and it is not a debt: nothing accumulates while you are gone, nothing
 * decays, and coming back a month later costs exactly what coming back tomorrow costs. It is just
 * a thing you started that is still there, which is a different feeling from a number going down.
 *
 * ## The rules this module holds to
 *
 * **No count, ever.** Not of days away, not of questions waiting, not of machines left open. A
 * number is what turns a return into a reckoning.
 *
 * **No reproach.** "Still cordoned" is a fact about the machine. "You left this broken 6 days ago"
 * is a fact about the person, and this product does not do those.
 *
 * **Untrusted input.** This comes out of localStorage on the reader's own device, so it can be
 * stale, hand-edited or crafted. An unknown machine id, an unknown fault, a step past the end -
 * every one of them renders nothing rather than half a sentence about a machine that stopped
 * existing three deploys ago.
 */
import type { Machine } from "./types";

export const MACHINE_STATE_KEY = "lumen-machine-state";

export type Unfinished = {
  machineId: string;
  faults: string[];
  step: number;
};

export type UnfinishedNote = {
  machineId: string;
  /** The machine's own short name. */
  title: string;
  /** What is still wrong, in the fault's own words. */
  broken: string;
  /** The state the machine is sitting in, from the machine itself rather than written here. */
  standing: string;
  /** The plan topic this machine explains, for the recall bridge. */
  topicIndex: number;
};

/**
 * Parses and validates what came out of storage.
 *
 * Returns null for anything it cannot fully verify. A partially-valid record is not repaired into
 * a usable one: a record naming two faults where one no longer exists would otherwise render a
 * sentence describing a break that cannot happen.
 */
export function readUnfinished(raw: string | null, machines: Machine[]): { state: Unfinished; machine: Machine } | null {
  if (!raw) return null;

  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return null; }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

  const record = parsed as Record<string, unknown>;
  const machineId = typeof record.machineId === "string" ? record.machineId : "";
  const machine = machines.find((m) => m.id === machineId);
  if (!machine) return null;

  const rawFaults = Array.isArray(record.faults) ? record.faults : [];
  const known = new Set(machine.faults.map((f) => f.id));
  const faults = rawFaults.filter((f): f is string => typeof f === "string" && known.has(f));
  // Every stored fault must still exist. A dropped one changes what the machine is doing, so
  // rendering the remainder would describe a state the reader never left it in.
  if (faults.length !== rawFaults.length) return null;
  // Nothing broken is not something to come back to. This is the whole gate: the pull is an open
  // loop, and a machine at rest is a closed one.
  if (faults.length === 0) return null;

  const step = typeof record.step === "number" && Number.isInteger(record.step) ? record.step : -1;
  if (step < 0 || step >= machine.steps.length) return null;

  return { state: { machineId, faults, step }, machine };
}

/**
 * The sentence, built from the machine rather than written here.
 *
 * `standing` comes from the machine's own scene, so what the strip says and what the diagram shows
 * cannot drift apart. Writing the sentence by hand is how a card ends up describing a state the
 * page it links to no longer produces.
 */
export function unfinishedNote(found: { state: Unfinished; machine: Machine } | null): UnfinishedNote | null {
  if (!found) return null;
  const { state, machine } = found;

  const labels = machine.faults.filter((f) => state.faults.includes(f.id)).map((f) => f.label.toLowerCase());
  const broken = labels.length === 1
    ? labels[0]
    : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;

  /*
   * The first step where the break is actually visible, not necessarily the step you stopped on.
   *
   * This used to read the scene at the stored step and take `scene.fault || scene.caption`. Most
   * steps set no `fault` field even with faults active - the break has not bitten yet at that
   * point in the sequence - so for seven of the eight faults the card printed the HEALTHY caption
   * and told the reader a broken machine was working normally.
   */
  const withFault = machine.steps
    .map((_, i) => machine.scene(i, 0.55, state.faults))
    .find((sc) => sc.fault);
  const scene = withFault ?? machine.scene(state.step, 0.55, state.faults);
  return {
    machineId: machine.id,
    title: machine.title.split(":")[0],
    broken,
    standing: scene.fault || scene.caption,
    topicIndex: machine.topicIndices[0],
  };
}

/** What gets written to storage. Kept tiny on purpose: this is a bookmark, not a save file. */
export function toStorage(machineId: string, faults: string[], step: number): string {
  return JSON.stringify({ machineId, faults, step } satisfies Unfinished);
}
