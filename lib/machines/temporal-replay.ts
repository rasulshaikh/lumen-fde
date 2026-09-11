/**
 * Replay, and why workflow code is not ordinary code.
 *
 * Explains plan row 36, "Temporal at depth: signals, queries, versioning, sagas, worker tuning".
 *
 * Durable execution works by not storing the state of your program. It stores the sequence of things
 * that happened - activity scheduled, activity completed, timer fired - and when a worker picks the
 * workflow up again, it runs your function from the top and feeds it those recorded results instead
 * of calling anything. The function reaches the point it had got to and carries on. That is the
 * entire mechanism, and everything strange about writing workflow code follows from it.
 *
 * It also means your function must make exactly the same decisions the second time, which is why
 * `Math.random()` and `Date.now()` are not allowed in workflow code and why changing that code while
 * workflows are in flight is a versioning problem rather than a deploy. Both of those read as
 * arbitrary restrictions until you have watched a replay diverge.
 */
import { clamp01, stepAt, type Machine, type Scene, type SceneNode } from "./types";

const NONDETERMINISM = "nondeterminism";
const UNVERSIONED = "unversioned";
const COMPENSATION_FAILS = "compensation-fails";

const PLACES: Array<[string, string, number, number, "actor" | "service" | "store"]> = [
  ["hist", "Event history", 34, 46, "store"],
  ["worker", "Worker", 130, 46, "service"],
  ["code", "Workflow code", 226, 46, "service"],
  ["act", "Activities", 268, 126, "service"],
  ["comp", "Compensation", 150, 132, "service"],
  ["ops", "You", 34, 126, "actor"],
];

const EDGES = [
  { from: "hist", to: "worker", dashed: true },
  { from: "worker", to: "code", dashed: true },
  { from: "code", to: "act", dashed: true },
  { from: "act", to: "hist", dashed: true },
  { from: "code", to: "comp", dashed: true },
  { from: "comp", to: "ops", dashed: true },
  { from: "worker", to: "ops", dashed: true },
];

export const temporalReplay: Machine = {
  id: "temporal-replay",
  title: "Replay, and why workflow code is not ordinary code",
  short: "Temporal replay",
  subtitle: "Nothing stores your program's state. It stores what happened, and runs your function again from the top.",
  topicIndices: [36],
  steps: ["The history exists", "A worker picks it up", "Replay from the top", "Reach the new work", "Something fails", "Compensate in reverse"],
  faults: [
    { id: NONDETERMINISM, label: "Date.now() inside the workflow", blurb: "Fine on the first run and on every test. On replay the clock returns a different value and the function takes a different branch." },
    { id: UNVERSIONED, label: "Insert an activity, no version gate", blurb: "The code schedules something at a point where the history records something else. Every in-flight workflow wedges at once." },
    { id: COMPENSATION_FAILS, label: "The compensating activity fails", blurb: "The saga is now half unwound, which is a state no step in the design describes and the hardest one to recover from." },
  ],

  scene(step, phase, faults): Scene {
    const p = clamp01(phase);
    const s = stepAt(step, 6);
    const nondet = faults.includes(NONDETERMINISM);
    const unver = faults.includes(UNVERSIONED);
    const compFails = faults.includes(COMPENSATION_FAILS);

    const nodes = (notes: Record<string, string> = {}, downs: string[] = []): SceneNode[] =>
      PLACES.map(([id, label, x, y, kind]) => ({ id, label, x, y, kind, note: notes[id], down: downs.includes(id) }));
    const base = { edges: EDGES };

    // A replay that diverges never reaches the business logic, so a broken compensation is
    // configured and unreachable. Named rather than silent: "the saga did not misbehave" means
    // nothing when the workflow never got far enough to run one.
    const diverged = nondet || unver;
    if (diverged && s >= 3) {
      const why = unver ? "The history and the code disagree about what was scheduled." : "The replayed run took a different branch from the recorded one.";
      return { ...base, nodes: nodes({ worker: "non-determinism error", code: "stopped" }, ["worker", "code"]), tokens: [],
        caption: "Replay never reached this point. The workflow is wedged at the divergence.",
        detail: `${why} Temporal will not guess which version is right, because guessing would mean running an activity twice or skipping one - so it stops and leaves the workflow open. Nothing is lost and nothing progresses, and the fix is to make the code agree with the history again rather than to retry.`,
        fault: `Wedged in replay.${compFails ? " The compensation is also broken, and is not reached: a saga cannot unwind a workflow that never got past replay, so fixing this will reveal that as a second failure." : ""}` };
    }

    if (s === 0) {
      return { ...base, nodes: nodes({ hist: "14 events, durable" }),
        tokens: [{ id: "h", from: "hist", to: "worker", at: p, label: "event history", tone: "normal" }],
        caption: "What is stored is a list of things that happened, not your program's variables.",
        detail: "ActivityTaskScheduled, ActivityTaskCompleted, TimerFired, and the results each one produced. No stack, no heap, no locals. The workflow's state is whatever your function computes when it is fed that list, which is why durability here costs nothing at runtime and everything in discipline." };
    }

    if (s === 1) {
      return { ...base, nodes: nodes({ worker: "new process, no memory of this" }),
        tokens: [{ id: "w", from: "worker", to: "code", at: p, label: "run from the top", tone: "normal" }],
        caption: "A different worker, possibly on a different machine, days later.",
        detail: "The worker that started this workflow may not exist any more, and the one picking it up has never seen it. It does not need to: everything required to reconstruct the workflow is in the history, which is what makes a workflow survive a deploy, a crash and a region failover without any of them being special cases." };
    }

    if (s === 2) {
      if (nondet) {
        return { ...base, nodes: nodes({ code: "Date.now() -> a different day", worker: "branch differs" }, ["code"]),
          tokens: [{ id: "r", from: "worker", to: "code", at: Math.min(p, 0.55), label: "replay diverges", tone: "fault" }],
          caption: "The function asks the clock, gets today's answer, and takes the other branch.",
          detail: "On the original run the date put this order inside the cutoff. On replay, three days later, the same line puts it outside, so the function tries to schedule an activity the history has no record of. Temporal detects the mismatch and refuses to continue. The rule that looked arbitrary - no clocks, no random, no direct IO in workflow code - is simply the requirement that the function be a pure function of its history, and the runtime provides deterministic replacements for exactly these things.",
          fault: "The replay made a different decision." };
      }
      if (unver) {
        return { ...base, nodes: nodes({ code: "new activity at step 3", hist: "records the old step 3" }, ["code", "hist"]),
          tokens: [{ id: "r", from: "worker", to: "code", at: Math.min(p, 0.55), label: "history mismatch", tone: "fault" }],
          caption: "The deployed code schedules something the history says was never scheduled.",
          detail: "Editing workflow code is editing the past for every execution currently in flight, and inserting a step in the middle is the version of that edit that cannot be reconciled. Every open workflow wedges simultaneously, at deploy time, which is a bad way to find out. The mechanism is a version gate: ask the runtime which version this execution is on and keep the old path for histories that predate the change. It is tedious and it is the price of being able to change code that is already running.",
          fault: "Code and history disagree about what happened." };
      }
      return { ...base, nodes: nodes({ code: "fed recorded results", worker: "no activities called" }),
        tokens: [{ id: "r", from: "worker", to: "code", at: p, label: "replay 14 events", tone: "retry" }],
        caption: "The function runs again from the top. No activity is actually executed.",
        detail: "Each call that previously scheduled an activity is satisfied from the history instead, instantly, so replaying a month-old workflow takes milliseconds. This is also why workflow code appears in traces repeatedly and why logging from it is confusing until you realise: most of the lines you are reading are from a replay of something that already happened." };
    }

    if (s === 3) {
      return { ...base, nodes: nodes({ code: "caught up to event 15", act: "charge card" }),
        tokens: [{ id: "n", from: "code", to: "act", at: p, label: "new activity", tone: "normal" }],
        caption: "Replay reaches the end of the history, and execution becomes real again.",
        detail: "From here the function is running forward for the first time, and the next thing it does gets appended to the history. There is no signal inside the code that this transition happened, which is why side effects belong in activities: an activity is the unit that is recorded, and anything outside one will be repeated on every replay." };
    }

    if (s === 4) {
      return { ...base, nodes: nodes({ act: "ship: no stock", code: "saga unwinding" }, ["act"]),
        tokens: [{ id: "f", from: "act", to: "hist", at: p, label: "activity failed", tone: "fault" }],
        caption: "The third activity fails after the first two succeeded.",
        detail: "There is no transaction spanning a payment provider, a warehouse and an email service, so the only available notion of atomicity is: do the steps in order, and if one fails, undo the earlier ones deliberately. That is a saga, and the undo steps are ordinary activities with all the ordinary failure modes.",
        fault: "Two steps committed, one impossible." };
    }

    if (compFails) {
      return { ...base, nodes: nodes({ comp: "refund failed", ops: "manual intervention" }, ["comp"]),
        tokens: [{ id: "c", from: "comp", to: "ops", at: Math.min(p, 0.6), label: "half unwound", tone: "fault" }],
        caption: "The refund fails. The card is charged and the order does not exist.",
        detail: "This is the state no step in the design describes: not committed, not rolled back, and not retryable without knowing whether the refund partially applied. Compensating actions need to be more robust than the actions they undo, not less - idempotent, keyed so a repeat is detectable, and retried for far longer, because there is nowhere to fall back to. When it still fails, the workflow should stop and ask for a human rather than close, and Temporal is good at exactly that: an execution can wait for a signal indefinitely without holding any resource.",
        fault: "Half unwound, with no path forward or back." };
    }

    return { ...base, nodes: nodes({ comp: "refunded, released", ops: "consistent" }),
      tokens: [{ id: "c", from: "comp", to: "ops", at: p, label: "unwound in reverse", tone: "retry" }],
      caption: "The completed steps are undone in reverse order, and the customer is whole.",
      detail: "Reverse order matters for the same reason it does in a stack unwind: a later step may depend on an earlier one still being in place. The workflow ends in a state it chose rather than one it fell into, and the full history of what was done and undone is durable - which is the part that turns an incident into a question you can answer." };
  },
};
