/**
 * Expand and contract, and the exact moment a rollback stops being possible.
 *
 * Explains plan row 78, "Releasing to a fleet of customer installs: support and skew policy,
 * preflight gates, cohort rollout".
 *
 * Every schema change that has to happen without downtime is the same five steps: add the new thing
 * as optional, write to both, backfill the old rows, move the reads across, and only then remove the
 * old thing. The reason it is five steps rather than one is version skew - for a period, old code
 * and new code are both running against the same database, and that is not a transitional annoyance
 * to be minimised, it is the situation the design has to be correct in.
 *
 * When you ship to a fleet of customer-managed installs, the skew is not minutes. It is however long
 * the slowest customer takes to upgrade, which can be two quarters. That changes which of these
 * steps can be combined, and the answer is none of them.
 */
import { clamp01, stepAt, type Machine, type Scene, type SceneNode } from "./types";

const CONTRACT_EARLY = "contract-early";
const NOT_NULL = "not-null";
const NO_BACKFILL = "no-backfill";

const PLACES: Array<[string, string, number, number, "actor" | "service" | "store"]> = [
  ["oldapp", "v1 (still live)", 34, 44, "service"],
  ["newapp", "v2", 34, 128, "service"],
  ["db", "Database", 152, 86, "store"],
  ["oldcol", "email (old)", 262, 44, "store"],
  ["newcol", "email_address", 262, 128, "store"],
];

const EDGES = [
  { from: "oldapp", to: "db", dashed: true },
  { from: "newapp", to: "db", dashed: true },
  { from: "db", to: "oldcol", dashed: true },
  { from: "db", to: "newcol", dashed: true },
  { from: "oldcol", to: "oldapp", dashed: true },
  { from: "newcol", to: "newapp", dashed: true },
];

export const expandContract: Machine = {
  id: "expand-contract",
  title: "Expand and contract, and where the rollback dies",
  subtitle: "Five steps because old code and new code share one database. Across a fleet, that overlap is quarters, not minutes.",
  topicIndices: [78],
  steps: ["Add the column", "Dual-write", "Backfill", "Cut reads over", "Drop the old column", "Steady state"],
  faults: [
    { id: NOT_NULL, label: "Add the column NOT NULL", blurb: "Every insert from the version that has not shipped yet fails immediately. The migration is the outage, and it starts the second it applies." },
    { id: NO_BACKFILL, label: "Skip the backfill", blurb: "New rows are fine and old rows are empty, so the bug is invisible in testing and appears as missing data for your oldest customers." },
    { id: CONTRACT_EARLY, label: "Drop the old column in the same release", blurb: "This is the step that removes the rollback. Until it runs, every mistake is reversible; after it, the previous version cannot start." },
  ],

  scene(step, phase, faults): Scene {
    const p = clamp01(phase);
    const s = stepAt(step, 6);
    const notNull = faults.includes(NOT_NULL);
    const noBackfill = faults.includes(NO_BACKFILL);
    const early = faults.includes(CONTRACT_EARLY);

    const nodes = (notes: Record<string, string> = {}, downs: string[] = []): SceneNode[] =>
      PLACES.map(([id, label, x, y, kind]) => ({ id, label, x, y, kind, note: notes[id], down: downs.includes(id) }));
    const base = { edges: EDGES };

    if (s === 0) {
      if (notNull) {
        return { ...base, nodes: nodes({ newcol: "NOT NULL, no default", oldapp: "every insert fails" }, ["oldapp", "newcol"]),
          tokens: [{ id: "ins", from: "oldapp", to: "db", at: Math.min(p, 0.5), label: "INSERT (no email_address)", tone: "fault" }],
          caption: "The column is added NOT NULL. Version 1 does not know it exists.",
          detail: "Version 1 is still running and its INSERT statement does not mention the new column, so every write it attempts is rejected the moment the migration commits. The migration did not prepare for an outage, it was the outage. A new column has to be nullable, or have a default, for exactly as long as any code that predates it might still run - and on a customer-managed fleet that is measured in releases you do not control.",
          fault: "The old version cannot write." };
      }
      return { ...base, nodes: nodes({ newcol: "nullable, empty", oldapp: "unaffected" }),
        tokens: [{ id: "add", from: "db", to: "newcol", at: p, label: "ADD COLUMN NULL", tone: "normal" }],
        caption: "The new column is added nullable. Nothing reads it and nothing writes it.",
        detail: "This step is deliberately inert. Version 1 continues exactly as before because a column it never names cannot affect it, and that property - old code is indifferent - is what makes the step safe to ship on its own and safe to roll back from." };
    }

    if (s === 1) {
      return { ...base, nodes: nodes({ newapp: "writes both", oldapp: "writes email only", newcol: "filling for new rows" }),
        tokens: [{ id: "dw", from: "newapp", to: "db", at: p, label: "write both columns", tone: "normal" }],
        caption: "Version 2 writes both columns. Version 1 keeps writing only the old one.",
        detail: "Both versions are correct and both are running. That is the whole of version skew, and it is why dual-write is its own release rather than something bundled with the read switch: until every writer is on v2, the new column is not trustworthy, and you cannot know that from inside the application." };
    }

    if (s === 2) {
      if (noBackfill) {
        return { ...base, nodes: nodes({ newcol: "new rows only", db: "2.1M rows empty" }, ["newcol"]),
          tokens: [{ id: "bf", from: "db", to: "newcol", at: Math.min(p, 0.3), label: "skipped", tone: "fault" }],
          caption: "Rows written before the dual-write are still empty, and always will be.",
          detail: "Everything created since the release looks perfect, which is exactly what a test environment contains, so this passes every check that exists. It appears in production as missing data for the oldest accounts - your longest-standing customers - and it is reported as data loss rather than as a migration bug. Backfill in batches with a bound on the write rate, and finish by asserting a count of zero rather than by watching the job say done.",
          fault: "Historical rows never populated." };
      }
      return { ...base, nodes: nodes({ newcol: "2.1M backfilled", db: "0 rows remaining" }),
        tokens: [{ id: "bf", from: "db", to: "newcol", at: p, label: "backfill in batches", tone: "slow" }],
        caption: "Existing rows are copied across in batches, without locking the table.",
        detail: "Batching is not politeness, it is the difference between a background job and a table lock that stops the product. The step is complete when a query for remaining rows returns zero, and that query is the gate for the next step - not the job's own completion message, which only knows that it ran." };
    }

    if (s === 3) {
      const trustworthy = !noBackfill;
      return { ...base, nodes: nodes({ newapp: "reads email_address", oldcol: "written, unread by v2" },
          trustworthy ? [] : ["newapp"]),
        tokens: [{ id: "rd", from: "newcol", to: "newapp", at: p, label: trustworthy ? "email_address" : "null for old rows", tone: trustworthy ? "normal" : "fault" }],
        caption: trustworthy
          ? "Reads move to the new column. The old one is still written and still correct."
          : "Reads move to a column that is empty for every row older than the release.",
        detail: trustworthy
          ? "This is the last reversible step, and it is reversible precisely because the old column is still being maintained. Rolling back here is a deploy rather than a migration, which is the property worth protecting for as long as possible."
          : "The switch is the moment the missing backfill becomes visible, and it is visible as absent data rather than as an error - no exception, no failed query, just blank fields for old accounts. Rolling the read back is a deploy and is the correct immediate move; finishing the backfill is the fix.",
        fault: trustworthy ? undefined : "Reading a column that was never filled." };
    }

    if (s === 4) {
      if (early) {
        return { ...base, nodes: nodes({ oldcol: "dropped", oldapp: "cannot start" }, ["oldapp", "oldcol"]),
          tokens: [{ id: "drop", from: "db", to: "oldcol", at: Math.min(p, 0.45), label: "DROP COLUMN", tone: "fault" }],
          caption: "The old column is dropped in the same release that started using the new one.",
          detail: `Version 1 references a column that no longer exists, so rolling back is no longer a deploy - it is a restore. Everything up to this point could be undone by shipping the previous image; this step converts the whole change into something that can only be fixed by going forward, and it does so at the exact moment you have least evidence that going forward is safe. Across a fleet of customer-managed installs the constraint is harder still: contracting is only safe once the oldest supported version already knows about the new column, which is what a skew policy is for.${noBackfill ? " With the backfill skipped as well, the old column that held the only copy of that data for 2.1M rows has just been deleted." : ""}`,
          fault: "The rollback path is gone." };
      }
      return { ...base, nodes: nodes({ oldcol: "dropped, one release later" }),
        tokens: [{ id: "drop", from: "db", to: "oldcol", at: p, label: "DROP COLUMN", tone: "normal" }],
        caption: "A release later, once nothing can still be reading it, the old column goes.",
        detail: "Waiting costs one release and buys a rollback window that covers the riskiest part of the change. The condition is not a duration: it is that the oldest version still supported in the field already reads the new column, which is exactly the question a skew policy exists to answer." };
    }

    return { ...base, nodes: nodes({ newcol: "the only column", newapp: "v2 everywhere" }),
      tokens: [{ id: "ok", from: "newcol", to: "newapp", at: p, label: "email_address", tone: "normal" }],
      caption: "One column, one version, no dual-write. The change is finished.",
      detail: "The step people skip is this one - the cleanup ships, the dual-write code stays, and two years later nobody can tell whether it is load-bearing. Finishing is part of the migration, and a migration tracked as done at the read switch will leave a trail of columns nobody dares remove." };
  },
};
