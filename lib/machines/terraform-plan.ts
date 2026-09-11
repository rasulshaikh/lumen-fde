/**
 * The three-way diff, which is the whole of Terraform.
 *
 * Explains plan row 13, "Terraform: state, modules, workspaces, drift, CI".
 *
 * Terraform is usually learned as block types and a plan output, and the mental model that actually
 * survives contact with an incident is smaller than that: there are three descriptions of the world
 * - your configuration, the state file, and what is really out there - and every plan is a
 * comparison of all three. Drift is state disagreeing with reality. A destroy you did not ask for
 * is configuration disagreeing with state. Neither is mysterious once you can see which two of the
 * three are arguing.
 *
 * The faults are the three tickets this actually generates: a lock left held by a CI job that was
 * cancelled mid-apply, a console edit that the next plan silently proposes to undo, and the
 * attribute change that reads as an edit and is a replacement.
 */
import { clamp01, stepAt, type Machine, type Scene, type SceneNode } from "./types";

const LOCK_HELD = "lock-held";
const CONSOLE_DRIFT = "console-drift";
const FORCES_NEW = "forces-new";

const PLACES: Array<[string, string, number, number, "actor" | "service" | "store"]> = [
  ["cli", "terraform", 26, 82, "actor"],
  ["lock", "Lock", 84, 38, "store"],
  ["state", "State file", 92, 126, "store"],
  ["graph", "Graph", 162, 38, "service"],
  ["plan", "Plan", 236, 38, "service"],
  ["cloud", "Real infrastructure", 236, 126, "service"],
];

const EDGES = [
  { from: "cli", to: "lock", dashed: true },
  { from: "lock", to: "state", dashed: true },
  { from: "state", to: "cloud", dashed: true },
  { from: "cloud", to: "state", dashed: true },
  { from: "state", to: "graph", dashed: true },
  { from: "graph", to: "plan", dashed: true },
  { from: "plan", to: "cli", dashed: true },
  { from: "plan", to: "cloud", dashed: true },
];

export const terraformPlan: Machine = {
  id: "terraform-plan",
  title: "The three-way diff, which is the whole of Terraform",
  short: "Terraform diff",
  subtitle: "Your config, the state file, and what is actually running. Every plan is an argument between two of the three.",
  topicIndices: [13],
  steps: ["Acquire the lock", "Refresh against reality", "Build the graph", "Three-way diff", "Plan", "Apply and write state"],
  faults: [
    { id: LOCK_HELD, label: "A cancelled CI job still holds the lock", blurb: "The job is gone. The lock is not, because releasing it was the step that never ran." },
    { id: CONSOLE_DRIFT, label: "Someone fixed it in the console", blurb: "At 2am, correctly, to end an outage. The next plan proposes to undo it, and the plan is not wrong." },
    { id: FORCES_NEW, label: "Change an attribute that forces replacement", blurb: "One line in the config. The plan says replace, and for a database that is a different sentence entirely." },
  ],

  scene(step, phase, faults): Scene {
    const p = clamp01(phase);
    const s = stepAt(step, 6);
    const locked = faults.includes(LOCK_HELD);
    const drift = faults.includes(CONSOLE_DRIFT);
    const replace = faults.includes(FORCES_NEW);

    const nodes = (notes: Record<string, string> = {}, downs: string[] = []): SceneNode[] =>
      PLACES.map(([id, label, x, y, kind]) => ({ id, label, x, y, kind, note: notes[id], down: downs.includes(id) }));
    const base = { edges: EDGES };

    // A held lock stops everything, so the other two faults are configured and unreachable. Naming
    // them is the point: "the plan did not propose anything alarming" means nothing when no plan ran.
    if (locked && s >= 1) {
      const pending = [drift ? "the console edit" : "", replace ? "the forced replacement" : ""].filter(Boolean);
      return { ...base, nodes: nodes({ lock: "held by run 4471" }, ["lock"]), tokens: [],
        caption: "Nothing ran. The lock was never released, so there is no plan at all.",
        detail: "Terraform takes the lock before it reads anything, which is why a stale lock produces no output of any kind rather than a partial one. That is the safe behaviour and it is also why the failure is so opaque: there is nothing to read except the lock ID and who held it.",
        fault: `Lock held.${pending.length ? ` ${pending.join(" and ")} is still waiting out there and will appear in the first plan that does run - the silence is not good news.` : ""}` };
    }

    if (s === 0) {
      if (locked) {
        return { ...base, nodes: nodes({ lock: "held since 02:14", cli: "waiting" }, ["lock"]),
          tokens: [{ id: "acq", from: "cli", to: "lock", at: Math.min(p, 0.45), label: "acquire", tone: "fault" }],
          caption: "The lock is held by a run that no longer exists.",
          detail: "A cancelled CI job does not get to run its cleanup. The lock outlives the process that took it, and every subsequent run queues behind a job that will never finish. force-unlock is the fix and it is genuinely dangerous: if the original apply is still running somewhere, breaking the lock lets two applies write the same state. Check that the job is actually dead first, by looking at the CI system rather than at the clock.",
          fault: "Lock held by a dead run." };
      }
      return { ...base, nodes: nodes({ lock: "acquired" }),
        tokens: [{ id: "acq", from: "cli", to: "lock", at: p, label: "acquire", tone: "normal" }],
        caption: "The lock is taken before anything is read.",
        detail: "State is a single mutable file and two concurrent applies would interleave writes into it. The lock is what makes Terraform safe to run from CI and from a laptop at the same time, and taking it first - before the refresh - is why a plan can never be built from state that someone else is mid-way through changing." };
    }

    if (s === 1) {
      if (drift) {
        return { ...base, nodes: nodes({ cloud: "t3.large", state: "records t3.medium" }, ["state"]),
          tokens: [{ id: "ref", from: "cloud", to: "state", at: p, label: "actual: t3.large", tone: "slow" }],
          caption: "Reality does not match the state file. This is drift, and it is now visible.",
          detail: "Somebody resized the instance in the console during an outage, and they were right to. Refresh notices, because refresh is the only stage that talks to the real world. Nothing has gone wrong yet - the state file has simply learned something your configuration does not know.",
          fault: "Drift found: state said t3.medium, reality is t3.large." };
      }
      return { ...base, nodes: nodes({ cloud: "t3.medium", state: "t3.medium" }),
        tokens: [{ id: "ref", from: "cloud", to: "state", at: p, label: "actual state", tone: "normal" }],
        caption: "Every resource in state is read back from the provider.",
        detail: "This is the stage people disable with -refresh=false to make plans faster, and it is the stage that finds drift. Skipping it means planning against a description of the world rather than the world, which is fine until the two have diverged - at which point the plan is confidently wrong." };
    }

    if (s === 2) {
      return { ...base, nodes: nodes({ graph: "dependencies resolved" }),
        tokens: [{ id: "g", from: "state", to: "graph", at: p, label: "resources + refs", tone: "normal" }],
        caption: "Resources are ordered by what references what.",
        detail: "The order is derived from your references, not from the order of blocks in the file. That is why moving a block does nothing and why an implicit reference is better than depends_on: the graph already knows. It is also why a cycle is a hard error rather than a warning - there is no order that satisfies it." };
    }

    if (s === 3) {
      const note = drift && replace ? "config vs state vs real: all three differ"
        : drift ? "state now matches real, config does not"
        : replace ? "config differs from state" : "all three agree";
      return { ...base, nodes: nodes({ plan: note }, drift || replace ? ["plan"] : []),
        tokens: [{ id: "d", from: "graph", to: "plan", at: p, label: "three-way diff", tone: drift || replace ? "slow" : "normal" }],
        caption: drift || replace ? "Two of the three descriptions disagree." : "Configuration, state and reality all agree.",
        detail: drift
          ? "This is the comparison that makes drift make sense. Refresh already moved state to match reality, so the argument left is between your configuration and the world: the config says t3.medium and the world says t3.large, and Terraform's job is to make the world match the config. It will propose to shrink the instance back, which is correct behaviour and the wrong outcome, and the fix is to change the configuration rather than to argue with the plan."
          : replace
            ? "Config and state disagree on an attribute the provider cannot change in place. The diff is one line; the consequence is not, because how a difference is resolved is a property of the provider rather than of the size of the change."
            : "Nothing to do. A plan with no changes is the only way to know that all three descriptions of your infrastructure are the same, which is why an empty plan in CI is worth running on a schedule rather than only before an apply.",
        fault: drift || replace ? "The diff is not empty." : undefined };
    }

    if (s === 4) {
      if (replace) {
        return { ...base, nodes: nodes({ plan: "1 to destroy, 1 to add" }, ["plan"]),
          tokens: [{ id: "pl", from: "plan", to: "cli", at: p, label: "-/+ forces replacement", tone: "fault" }],
          caption: "The plan says replace. The database will be destroyed and a new one created.",
          detail: "Some attributes cannot be modified in place, so the provider expresses the change as a destroy followed by a create. The marker is -/+ and the words 'forces replacement' beside the attribute, and both are easy to skim past in a plan that is four hundred lines long. This is what the summary line is for: read '1 to destroy' before reading anything else, because it is the only number in the output that can be irreversible. prevent_destroy in a lifecycle block turns this from a plan you must catch into an error you cannot miss.",
          fault: "Replacement, not an update." };
      }
      if (drift) {
        return { ...base, nodes: nodes({ plan: "1 to change: t3.large -> t3.medium" }, ["plan"]),
          tokens: [{ id: "pl", from: "plan", to: "cli", at: p, label: "~ revert the fix", tone: "fault" }],
          caption: "The plan proposes to undo the change that ended the outage.",
          detail: "Terraform is doing exactly what it is for: it converges the world onto the configuration, and nobody told the configuration. Applying this is how a 2am fix gets reverted at 10am by someone merging an unrelated pull request. The lesson is not 'never touch the console' - the console was the right call during the outage - it is that the change is not finished until the configuration says the same thing.",
          fault: "The plan reverts a deliberate fix." };
      }
      return { ...base, nodes: nodes({ plan: "no changes" }),
        tokens: [{ id: "pl", from: "plan", to: "cli", at: p, label: "0 to add, 0 to change", tone: "normal" }],
        caption: "No changes. Infrastructure matches configuration.",
        detail: "A plan is a proposal and reading it is the actual skill: the counts at the bottom, then every -/+ marker, then everything with (known after apply) which is the part you are being asked to accept on trust." };
    }

    return { ...base, nodes: nodes({ cloud: "applied", state: "written back" }),
      tokens: [{ id: "ap", from: "plan", to: "cloud", at: p, label: "apply", tone: "normal" }],
      caption: "Changes are made, then state is written back and the lock released.",
      detail: "The write-back is the step that matters for the next run, and the order is why an apply interrupted half way is the genuinely bad case: some resources exist and state may not know about them. That is what the lock protects and what makes 'just cancel it' a decision rather than a reflex." };
  },
};
