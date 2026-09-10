/**
 * Machine tests. Run with:  npx tsx lib/machines.test.mts
 *
 * A machine is a diagram you can break, and the whole value is in the breaking. That makes this
 * suite's central assertion an unusual one: **every fault must change something.**
 *
 * This repo has now shipped five controls that looked like they did something and did not - an aim
 * toggle whose state nothing read, a "Try again" whose guard returned first, a record button that
 * reported success with no request behind it. A fault toggle is the same shape of risk and worse,
 * because the learner's whole model of the system is built out of what changed when they flipped
 * it. A fault that renders identically does not just fail to teach; it teaches that the thing you
 * broke does not matter.
 *
 * So `every fault changes at least one step` is asserted per fault, per machine, by rendering the
 * full step range twice and comparing. The rest of the suite guards the arithmetic: coordinates
 * that could go NaN, tokens travelling edges that do not exist, and topic indices pointing at the
 * wrong plan row - which would teach the right thing under the wrong heading, silently.
 */
import workbook from "../data/workbook.json" with { type: "json" };
import { MACHINES, machineById, machinesForTopic } from "./machines/index.ts";
import type { Machine, Scene } from "./machines/types.ts";

let fails = 0;
const ck = (n: string, c: boolean, x = "") => { if (!c) { fails++; console.log(`  FAIL ${n} ${x}`); } else console.log(`  ok   ${n} ${x}`); };

const PHASES = [0, 0.25, 0.5, 0.75, 1];
const plan = workbook.Plan as unknown[][];

/** Every scene a machine can produce, across all steps and phases, for a given fault set. */
const allScenes = (m: Machine, faults: string[] = []): Scene[] =>
  m.steps.flatMap((_, step) => PHASES.map((phase) => m.scene(step, phase, faults)));

console.log("machines point at real plan topics");
{
  for (const m of MACHINES) {
    ck(`${m.id}: has at least one topic`, m.topicIndices.length > 0);
    for (const i of m.topicIndices) {
      const row = plan[i + 1];
      const name = String(row?.[2] ?? "");
      // idx + 1 because Plan[0] is the header - the same index space askTopic and syllabusContext
      // use, pinned for all 119 in lib/paper.test.mts.
      ck(`${m.id}: topic ${i} is a real row`, !!name, name.slice(0, 46));
    }
  }
  ck("ids are unique", new Set(MACHINES.map((m) => m.id)).size === MACHINES.length);
  ck("machineById finds one", machineById("tcp")?.id === "tcp");
  ck("and returns null rather than throwing on a bad id", machineById("../etc/passwd") === null);
  ck("machinesForTopic finds the networking machine", machinesForTopic(2).some((m) => m.id === "tcp"));
  ck("and returns empty for a topic with no machine", machinesForTopic(117).length === 0);
}

console.log("every fault changes what you see");
{
  // The assertion this suite exists for. A fault that renders identically is a dead control.
  for (const m of MACHINES) {
    const clean = JSON.stringify(allScenes(m));
    for (const fault of m.faults) {
      const broken = JSON.stringify(allScenes(m, [fault.id]));
      ck(`${m.id}/${fault.id} changes the machine`, broken !== clean);
    }
    // An id that is not a declared fault must do nothing at all, or a typo in the UI would look
    // like a working control.
    ck(`${m.id}: an unknown fault id changes nothing`, JSON.stringify(allScenes(m, ["not-a-fault"])) === clean);
    ck(`${m.id}: every fault has a blurb saying what it teaches`, m.faults.every((f) => f.blurb.length > 20));
  }
}

console.log("scene() is pure");
{
  for (const m of MACHINES) {
    const faults = m.faults.map((f) => f.id);
    const a = JSON.stringify(m.scene(1, 0.5, faults));
    const b = JSON.stringify(m.scene(1, 0.5, faults));
    ck(`${m.id}: same inputs, same output`, a === b);
    // Called out of order, because the renderer steps backwards as well as forwards.
    const forward = JSON.stringify(m.scene(2, 0.3, []));
    m.scene(0, 0, faults); m.scene(4, 1, faults);
    ck(`${m.id}: no state carried between calls`, JSON.stringify(m.scene(2, 0.3, [])) === forward);
  }
}

console.log("every step says what is happening and why it matters");
{
  for (const m of MACHINES) {
    for (const [step, name] of m.steps.entries()) {
      const combos = [[] as string[], ...m.faults.map((f) => [f.id]), m.faults.map((f) => f.id)];
      for (const faults of combos) {
        const s = m.scene(step, 0.5, faults);
        if (!s.caption || s.caption.length < 12) { ck(`${m.id} step ${step} "${name}" has a caption`, false, JSON.stringify(faults)); break; }
        if (!s.detail || s.detail.length < 40) { ck(`${m.id} step ${step} "${name}" has a detail`, false, JSON.stringify(faults)); break; }
      }
    }
    ck(`${m.id}: every step captioned under every fault combination`, true, `${m.steps.length} steps`);
  }
}

console.log("the geometry cannot go wrong");
{
  for (const m of MACHINES) {
    const combos = [[] as string[], m.faults.map((f) => f.id)];
    for (const faults of combos) {
      for (const scene of allScenes(m, faults)) {
        const ids = new Set(scene.nodes.map((n) => n.id));

        const badCoord = scene.nodes.find((n) => !Number.isFinite(n.x) || !Number.isFinite(n.y));
        if (badCoord) { ck(`${m.id}: no NaN coordinates`, false, badCoord.id); break; }

        const orphanEdge = scene.edges.find((e) => !ids.has(e.from) || !ids.has(e.to));
        if (orphanEdge) { ck(`${m.id}: every edge joins real nodes`, false, `${orphanEdge.from}->${orphanEdge.to}`); break; }

        // A token must travel a declared edge. Without this a packet can glide between two nodes
        // with no line drawn between them, which reads as teleporting.
        const pairs = new Set(scene.edges.map((e) => `${e.from}->${e.to}`));
        const strayToken = scene.tokens.find((t) => !pairs.has(`${t.from}->${t.to}`));
        if (strayToken) { ck(`${m.id}: every token travels a declared edge`, false, `${strayToken.from}->${strayToken.to}`); break; }

        const offEdge = scene.tokens.find((t) => !(t.at >= 0 && t.at <= 1));
        if (offEdge) { ck(`${m.id}: no token leaves its edge`, false, `${offEdge.id} at ${offEdge.at}`); break; }
      }
    }
    ck(`${m.id}: geometry holds across every step, phase and fault`, true);
  }
}

console.log("bad input clamps instead of throwing");
{
  for (const m of MACHINES) {
    // step and phase come from component state and a rAF clock. NaN reaching a render is a blank
    // screen with no error, which is the hardest kind of bug to be told about.
    const cases: [number, number][] = [[-5, -1], [999, 2], [NaN, NaN], [1.7, 0.5]];
    let threw = "";
    for (const [step, phase] of cases) {
      try {
        const s = m.scene(step, phase, []);
        if (!s.caption) threw = `no caption at step ${step}`;
        if (s.tokens.some((t) => !Number.isFinite(t.at))) threw = `NaN token at step ${step}`;
      } catch (e) { threw = String(e); }
    }
    ck(`${m.id}: survives out-of-range and NaN input`, threw === "", threw);
  }
}

console.log("a dropped packet visibly stops short");
{
  // The single most important visual in the TCP machine: the SYN-ACK has to die in transit rather
  // than arrive. If `at` reached 1 the learner would watch it land and then be told it was lost.
  const t = machineById("tcp")!;
  const dropped = t.scene(1, 1, ["drop-synack"]).tokens[0];
  ck("the lost SYN-ACK never reaches the client", dropped.at < 0.6, `at ${dropped.at}`);
  ck("and it is marked as a fault, not as normal traffic", dropped.tone === "fault");
  ck("the healthy SYN-ACK does arrive", t.scene(1, 1, []).tokens[0].at === 1);

  // Nothing in flight while the timer runs is the whole lesson: no information, only a clock.
  ck("nothing is in flight while the client waits", t.scene(2, 0.5, ["drop-synack"]).tokens.length === 0);
  ck("and the caption says so", /waiting on a timer/.test(t.scene(2, 0.5, ["drop-synack"]).caption));
}

console.log("breaking every node leaves the pod Pending, not crashed");
{
  const k = machineById("k8s")!;
  const stuck = k.scene(2, 0.5, ["cordon-a", "no-capacity"]);
  ck("nothing is scheduled", stuck.tokens.length === 0);
  ck("the pod is Pending rather than failed", /Pending/.test(stuck.caption));
  ck("and it explains why nothing alerts", /not an error state/.test(stuck.fault ?? ""));

  // One node cordoned still schedules - a fault that stops everything would be less instructive.
  const oneLeft = k.scene(3, 0.5, ["cordon-a"]);
  ck("with one node left the pod still binds", /binding/.test(oneLeft.caption), oneLeft.caption.slice(0, 50));
}

console.log("an empty retrieval still produces a confident answer");
{
  const r = machineById("rag")!;
  const answer = r.scene(4, 0.6, ["empty-retrieval"]);
  ck("the model answers anyway", /answers anyway/i.test(answer.caption), answer.caption);
  ck("the answer is marked as a fault, not a success", answer.tokens.some((t) => t.tone === "fault"));
  ck("and it names why this is the dangerous one", /indistinguishable from a good one/.test(answer.fault ?? ""));
  ck("no error is raised anywhere in the pipeline", /no error, no exception, no alert/.test(r.scene(1, 0.5, ["empty-retrieval"]).detail));
}

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
