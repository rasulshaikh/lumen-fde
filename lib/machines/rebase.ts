/**
 * Rebase is a replay, and the commits you end up with are not the ones you started with.
 *
 * Explains plan row 4, "Git at depth: rebase, bisect, reflog, hooks, monorepo hygiene".
 *
 * "Rebase moves your commits onto the new base" is the sentence everyone repeats and it is wrong in
 * the way that matters. Nothing moves. Git computes the diff each of your commits introduced, resets
 * your branch to the upstream tip, and applies those diffs one at a time as brand new commits with
 * brand new hashes. The originals are still in the object store, unreferenced, which is why the
 * reflog can always get you back and why a rebase is never actually destructive - until the moment
 * you force-push it somewhere other people have already pulled.
 *
 * The fault worth the machine is the third one. A conflict resolved by taking one side wholesale
 * produces a rebase that completes, a branch that builds, and a commit whose stated change is simply
 * not in the tree. Nothing fails. The review already happened.
 */
import { clamp01, stepAt, type Machine, type Scene, type SceneNode } from "./types";

const CONFLICT = "conflict";
const TAKE_THEIRS = "take-theirs";
const FORCE_SHARED = "force-shared";

const PLACES: Array<[string, string, number, number, "actor" | "service" | "store"]> = [
  ["you", "You", 28, 88, "actor"],
  ["base", "Merge base", 100, 38, "store"],
  ["series", "Patch series", 186, 38, "service"],
  ["upstream", "origin/main", 266, 88, "store"],
  ["branch", "Your branch", 186, 136, "store"],
  ["mate", "A colleague", 76, 136, "actor"],
];

const EDGES = [
  { from: "you", to: "base", dashed: true },
  { from: "base", to: "series", dashed: true },
  { from: "series", to: "upstream", dashed: true },
  { from: "series", to: "branch", dashed: true },
  { from: "upstream", to: "branch", dashed: true },
  { from: "branch", to: "you", dashed: true },
  { from: "branch", to: "mate", dashed: true },
  { from: "mate", to: "upstream", dashed: true },
];

export const rebase: Machine = {
  id: "rebase",
  title: "Rebase is a replay, not a move",
  short: "Rebase",
  subtitle: "Git computes your diffs, resets the branch, and applies them as new commits. The originals never move anywhere.",
  topicIndices: [4],
  steps: ["Find the merge base", "Build the patch series", "Reset onto upstream", "Apply each commit", "Move the ref", "Push"],
  faults: [
    { id: CONFLICT, label: "A conflict on the second of four commits", blurb: "You are resolving against a tree that never existed as a commit on either branch: upstream plus one of your four." },
    { id: TAKE_THEIRS, label: "Resolve it by taking one side wholesale", blurb: "The rebase completes, the branch builds, the tests pass, and the commit's change is not in the tree. Nothing reports anything." },
    { id: FORCE_SHARED, label: "Force-push a branch someone else pulled", blurb: "Their history and yours now disagree about commits with the same messages and different hashes, and their next push can undo yours." },
  ],

  scene(step, phase, faults): Scene {
    const p = clamp01(phase);
    const s = stepAt(step, 6);
    const conflict = faults.includes(CONFLICT);
    const theirs = faults.includes(TAKE_THEIRS);
    const forced = faults.includes(FORCE_SHARED);

    const nodes = (notes: Record<string, string> = {}, downs: string[] = []): SceneNode[] =>
      PLACES.map(([id, label, x, y, kind]) => ({ id, label, x, y, kind, note: notes[id], down: downs.includes(id) }));
    const base = { edges: EDGES };

    if (s === 0) {
      return { ...base, nodes: nodes({ base: "a1b2c3", upstream: "9 commits ahead" }),
        tokens: [{ id: "mb", from: "you", to: "base", at: p, label: "merge-base", tone: "normal" }],
        caption: "Git finds the last commit both branches share.",
        detail: "Everything after that point on your side is what gets replayed, and everything after it on theirs is what you are replaying onto. This is the same computation a merge starts from - the difference is entirely in what happens next, not in how the two branches are compared." };
    }

    if (s === 1) {
      return { ...base, nodes: nodes({ series: "4 patches" }),
        tokens: [{ id: "ps", from: "base", to: "series", at: p, label: "4 diffs", tone: "normal" }],
        caption: "Your four commits become four diffs. Not four objects to move - four changes to reapply.",
        detail: "A commit is a snapshot, and the diff is computed against its parent. Turning the branch into a series of diffs is the step that makes the new hashes inevitable: a commit's hash includes its parent, so the moment the parent changes, every commit downstream of it is a different object even if its content is identical." };
    }

    if (s === 2) {
      return { ...base, nodes: nodes({ branch: "reset to origin/main", upstream: "tip" }),
        tokens: [{ id: "rs", from: "upstream", to: "branch", at: p, label: "reset --hard", tone: "slow" }],
        caption: "Your branch is moved to the upstream tip. Your commits are, briefly, unreferenced.",
        detail: "This is the moment that feels dangerous and is not: the original commits still exist as objects and the reflog still names where the branch was a second ago. `git reflog` and `git reset --hard HEAD@{1}` undo an entire rebase, which is worth practising deliberately once so it is available under stress." };
    }

    if (s === 3) {
      if (theirs) {
        return { ...base, nodes: nodes({ series: "2 of 4 applied, one gutted", branch: "builds fine" }, ["series"]),
          tokens: [{ id: "ap", from: "series", to: "branch", at: p, label: "resolved --theirs", tone: "fault" }],
          caption: conflict
            ? "The conflict on patch two is resolved by keeping upstream's version. Your change is now absent."
            : "The conflict is resolved by keeping upstream's version. Your change is now absent.",
          detail: "The rebase completes without complaint, the branch compiles, and the commit still has its message and its author and its review approval - and the change it claims to make is not in the tree. Git cannot detect this because taking one side is a legitimate resolution; only you know what the commit was for. The defence is mechanical: diff the rebased range against the original with `git range-diff`, which shows exactly which patches changed during the replay and is the single most underused command in this whole area.",
          fault: "A commit that no longer does what it says." };
      }
      if (conflict) {
        return { ...base, nodes: nodes({ series: "conflict on 2 of 4" }, ["series"]),
          tokens: [{ id: "ap", from: "series", to: "branch", at: Math.min(p, 0.5), label: "patch 2 of 4", tone: "fault" }],
          caption: "Patch two will not apply. You are stopped in the middle of the series.",
          detail: "The working tree here is upstream plus your first commit and nothing else - a state that has never existed as a commit on either branch and never will. That is why resolving feels disorienting: the surrounding code is not what you wrote against and not what upstream has. Resolve for this intermediate state rather than for the final one, and if the same conflict appears on several patches, `rerere` will remember the resolution. `git rebase --abort` returns everything to exactly where it started, at any point.",
          fault: "Stopped mid-replay, in a tree that never existed." };
      }
      return { ...base, nodes: nodes({ series: "4 of 4 applied", branch: "new hashes" }),
        tokens: [{ id: "ap", from: "series", to: "branch", at: p, label: "apply 4", tone: "normal" }],
        caption: "Each diff is applied in order, producing four new commits.",
        detail: "Same messages, same authors, same changes, different hashes - because each one now has a different parent. The old commits are still in the object store with nothing pointing at them, which is the whole reason a rebase is recoverable and the reason `git log` cannot show you what you lost." };
    }

    if (s === 4) {
      return { ...base, nodes: nodes({ branch: "ref moved", base: "old commits unreferenced" }),
        tokens: [{ id: "mv", from: "branch", to: "you", at: p, label: "HEAD -> new tip", tone: "normal" }],
        caption: "The branch ref moves to the last replayed commit. Only now is the rebase done.",
        detail: "A branch is a file containing a hash. That is the entire data structure, which is why moving one is instant regardless of how many commits are involved and why the reflog - a log of what that file used to contain - is a complete undo history for the branch." };
    }

    if (forced) {
      return { ...base, nodes: nodes({ mate: "holds the old hashes", upstream: "rewritten" }, ["mate", "upstream"]),
        tokens: [{ id: "pf", from: "mate", to: "upstream", at: Math.min(p, 0.6), label: "their push", tone: "fault" }],
        caption: "Force-pushed. A colleague already pulled the old commits and still has them.",
        detail: "Their branch and yours now contain commits with identical messages and different hashes, so their next pull produces duplicates and their next push can put the old history back over yours. This is the only genuinely destructive thing in the sequence, and it is destructive to someone else's clone rather than to the repository. Two habits make it safe: rebase only branches nobody else has pulled, and use `--force-with-lease`, which refuses the push if the remote moved since you last looked - turning a silent overwrite into an error.",
        fault: "Rewrote history other people were standing on." };
    }

    return { ...base, nodes: nodes({ upstream: "linear history" }),
      tokens: [{ id: "pf", from: "branch", to: "mate", at: p, label: "--force-with-lease", tone: "normal" }],
      caption: "Pushed with a lease, onto a branch only you were using.",
      detail: "The reward for all of this is a history where each commit is a self-contained change against a single line of development, which is what makes `git bisect` a mechanical answer rather than an investigation. That is the actual argument for rebasing: not tidiness, but that a linear history is a searchable one." };
  },
};
