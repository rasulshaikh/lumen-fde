/**
 * Driver, executors, and the boundary where everything slows down.
 *
 * Explains plan row 42, "PySpark (optional: Databricks/Palantir-style roles only)".
 *
 * The depth target for this row is small and specific: know the driver/executor model. That is one
 * sequence. A job is split into stages at shuffle boundaries, each stage becomes a task per
 * partition, executors run the tasks, and results come back. Once that picture is in place, almost
 * every Spark performance question answers itself, because the expensive things are all in the same
 * two places: moving data between executors, and moving data back to the driver.
 *
 * The three faults are the three ways a job that works on a sample falls over on the real table, and
 * none of them is a bug. A collect() that was fine at a thousand rows. A join key that turns out to
 * be ninety percent one value. A join whose small side would have fitted in memory if anyone had
 * said so.
 */
import { clamp01, stepAt, type Machine, type Scene, type SceneNode } from "./types";

const COLLECT_OOM = "collect-oom";
const SKEWED_KEY = "skewed-key";
const NO_BROADCAST = "no-broadcast";

const PLACES: Array<[string, string, number, number, "actor" | "service" | "store"]> = [
  ["driver", "Driver", 32, 88, "actor"],
  ["plan", "Stages", 112, 40, "service"],
  ["e1", "Executor 1", 204, 34, "service"],
  ["e2", "Executor 2", 204, 88, "service"],
  ["e3", "Executor 3", 204, 142, "service"],
  ["shuf", "Shuffle", 128, 134, "store"],
];

const EDGES = [
  { from: "driver", to: "plan", dashed: true },
  { from: "plan", to: "e1", dashed: true },
  { from: "plan", to: "e2", dashed: true },
  { from: "plan", to: "e3", dashed: true },
  { from: "e1", to: "shuf", dashed: true },
  { from: "e2", to: "shuf", dashed: true },
  { from: "e3", to: "shuf", dashed: true },
  { from: "shuf", to: "driver", dashed: true },
];

export const sparkJob: Machine = {
  id: "spark-job",
  title: "Driver, executors, and where it slows down",
  short: "Spark job",
  subtitle: "Stages split at shuffle boundaries. Everything expensive is either moving data sideways or moving it back.",
  topicIndices: [42],
  steps: ["Submit the job", "Split into stages", "Tasks run in parallel", "Shuffle", "Second stage", "Back to the driver"],
  faults: [
    { id: NO_BROADCAST, label: "Join two tables with a full shuffle", blurb: "The small side is 40MB and would have fitted in every executor's memory. Instead both sides move across the network." },
    { id: SKEWED_KEY, label: "One key holds most of the rows", blurb: "199 tasks finish in seconds and one runs for forty minutes. The stage is as slow as its slowest task, always." },
    { id: COLLECT_OOM, label: "collect() the result", blurb: "Worked on the sample. On the real table it asks one JVM to hold what a cluster was holding." },
  ],

  scene(step, phase, faults): Scene {
    const p = clamp01(phase);
    const s = stepAt(step, 6);
    const collect = faults.includes(COLLECT_OOM);
    const skew = faults.includes(SKEWED_KEY);
    const noBroadcast = faults.includes(NO_BROADCAST);

    const nodes = (notes: Record<string, string> = {}, downs: string[] = []): SceneNode[] =>
      PLACES.map(([id, label, x, y, kind]) => ({ id, label, x, y, kind, note: notes[id], down: downs.includes(id) }));
    const base = { edges: EDGES };

    if (s === 0) {
      return { ...base, nodes: nodes({ driver: "builds the plan" }),
        tokens: [{ id: "sub", from: "driver", to: "plan", at: p, label: "df.join(...).groupBy(...)", tone: "normal" }],
        caption: "The driver holds the plan. It does not hold the data.",
        detail: "Your Python process is the driver: it builds a logical plan, optimises it, and schedules work. Nothing has executed yet, because transformations are lazy - the plan only runs when something asks for a result, which is why an error in the middle of a notebook surfaces at the line that calls an action rather than at the line that caused it." };
    }

    if (s === 1) {
      return { ...base, nodes: nodes({ plan: noBroadcast ? "2 stages, full shuffle join" : "2 stages, broadcast join" }, noBroadcast ? ["plan"] : []),
        tokens: [{ id: "st", from: "plan", to: "e2", at: p,
          label: noBroadcast ? "shuffle both sides" : "broadcast 40MB", tone: noBroadcast ? "slow" : "normal" }],
        caption: noBroadcast
          ? "The plan shuffles both sides of the join across the network."
          : "The small side is broadcast to every executor, so the join needs no shuffle.",
        detail: noBroadcast
          ? "Spark splits a job into stages wherever data has to move between executors, and a join is the commonest such boundary. When one side is small enough to fit in each executor's memory, it can be sent to all of them instead and the join happens locally with no stage boundary at all - the single largest performance difference available in most jobs. The optimiser does this automatically when it knows the size, and it does not know the size if statistics are missing, which is when you say so explicitly with a broadcast hint."
          : "A broadcast join eliminates a stage boundary rather than making one faster, which is why it is worth more than any amount of tuning applied to the shuffle it replaced.",
        fault: noBroadcast ? "A shuffle that did not need to exist." : undefined };
    }

    if (s === 2) {
      return { ...base, nodes: nodes({ e1: "67 tasks", e2: "67 tasks", e3: "66 tasks" }),
        tokens: [
          { id: "t1", from: "plan", to: "e1", at: p, label: "tasks", tone: "normal" },
          { id: "t3", from: "plan", to: "e3", at: p, label: "tasks", tone: "normal" },
        ],
        caption: "One task per partition. Executors run them in parallel across their cores.",
        detail: "Parallelism is the number of partitions, not the number of machines - two hundred partitions across three executors with four cores each means twelve running at a time. Too few partitions and the cluster idles; far too many and the scheduling overhead dominates, which is the failure mode of a table stored as thousands of tiny files." };
    }

    if (s === 3) {
      if (skew) {
        return { ...base, nodes: nodes({ shuf: "1 partition: 88% of rows", e2: "still running" }, ["e2", "shuf"]),
          tokens: [{ id: "sh", from: "e2", to: "shuf", at: p, label: "one huge partition", tone: "slow" }],
          caption: "199 tasks are done. One is still running, and holds most of the table.",
          detail: "Rows are assigned to partitions by a hash of the join key, so a key that accounts for most of the rows produces one enormous partition and a task that runs alone. A stage finishes when its slowest task finishes, so the cluster sits idle watching one core work - and adding executors changes nothing at all, which is the tell. The usual culprit is a placeholder: a null, an 'unknown', a default tenant. Salt the hot key across several partitions and aggregate twice, or filter it out and handle it separately.",
          fault: "One task, and the cluster waiting on it." };
      }
      return { ...base, nodes: nodes({ shuf: "evenly distributed" }),
        tokens: [
          { id: "sh1", from: "e1", to: "shuf", at: p, label: "shuffle write", tone: "slow" },
          { id: "sh3", from: "e3", to: "shuf", at: p, label: "shuffle write", tone: "slow" },
        ],
        caption: "Data is written to disk, moved across the network, and read back.",
        detail: "A shuffle is the expensive operation in Spark and it is expensive for unglamorous reasons: serialise, write to local disk, transfer, read, deserialise. This is why the optimiser works so hard to avoid one, and why the first question about a slow job is how many shuffles it contains rather than how much CPU it used." };
    }

    if (s === 4) {
      return { ...base, nodes: nodes({ e1: "aggregating", e2: "aggregating", e3: "aggregating" }),
        tokens: [{ id: "s2", from: "plan", to: "e2", at: p, label: "stage 2", tone: "normal" }],
        caption: "The second stage runs on the reshuffled partitions.",
        detail: "Each stage's tasks are independent and restartable, which is how Spark tolerates losing an executor mid-job: it recomputes the lost partitions from the lineage rather than failing the job. That recovery is free until the recomputation involves re-running a shuffle, at which point it is not." };
    }

    if (collect) {
      return { ...base, nodes: nodes({ driver: "OOM: 40GB into one JVM" }, ["driver"]),
        tokens: [{ id: "cl", from: "shuf", to: "driver", at: Math.min(p, 0.55), label: "collect() 40GB", tone: "fault" }],
        caption: "collect() asks a single JVM to hold what the whole cluster was holding.",
        detail: "This is the mistake that always works in development, because the sample was ten thousand rows and the driver had plenty of room. The driver has one machine's memory and the cluster has all of them, so the failure scales with success. Write to storage instead; use take() or show() when you want to look at something; use toPandas() only after an aggregation that you know produces a small result. When the driver dies this way the stack trace names the driver, so the investigation starts a long way from the line that caused it.",
        fault: "The driver is not a big executor." };
    }

    return { ...base, nodes: nodes({ driver: "wrote 40GB to storage" }),
      tokens: [{ id: "cl", from: "shuf", to: "driver", at: p, label: "write parquet", tone: "normal" }],
      caption: "The result is written from the executors. Only a summary reaches the driver.",
      detail: "Writing is done by the executors in parallel, so the data never passes through the driver at all - it goes straight from where it was computed to where it is stored. The driver receives task completions and a row count, which is the shape every Spark job should have: data moves between executors and out to storage, and the driver moves instructions." };
  },
};
