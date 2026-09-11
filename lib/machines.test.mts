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
import { ease, scrubTo, dialValue } from "./machines/types.ts";
import { readUnfinished, unfinishedNote, toStorage } from "./machines/unfinished.ts";
import type { Machine, Scene } from "./machines/types.ts";

let fails = 0;
const ck = (n: string, c: boolean, x = "") => { if (!c) { fails++; console.log("picker labels identify the machine");
{
  // "Driver" and "Replay" and "Five steps" all came out of a heuristic that split the title on its
  // first colon or comma. A label nobody can tell apart from another is the same defect as a
  // control that does nothing: it looks like it works until you have more than three of them.
  const shorts = MACHINES.map((m) => m.short);
  ck("every machine declares one", shorts.every((t) => typeof t === "string" && t.trim().length > 1), JSON.stringify(shorts.filter((t) => !t || t.trim().length < 2)));
  ck("they are unique", new Set(shorts.map((t) => t.toLowerCase())).size === shorts.length,
    JSON.stringify(shorts.filter((t, i) => shorts.findIndex((o) => o.toLowerCase() === t.toLowerCase()) !== i)));
  const long = shorts.filter((t) => t.length > 18);
  ck("and short enough to sit on one line", long.length === 0, JSON.stringify(long));
}

console.log(`  FAIL ${n} ${x}`); } else console.log(`  ok   ${n} ${x}`); };

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

console.log("every fault changes what you see, in every combination");
{
  /*
   * The assertion this suite exists for, and the version of it that actually works.
   *
   * The first version tested each fault ALONE against the healthy machine, and passed while two
   * controls were dead: TCP's "drop a data segment" did nothing whenever "drop the SYN-ACK" was
   * already on, because the handshake branch returned before the data branch was ever read, and
   * RAG's "chunks too large" did nothing whenever retrieval was empty. Both were reachable in two
   * clicks and both rendered a toggle that moved and changed not one pixel.
   *
   * So the property is now checked against every OTHER combination as well: for each fault, and
   * for every subset of the remaining faults, adding it must change something. With three faults
   * per machine that is four contexts each, which is cheap and catches the whole class.
   */
  const subsets = (ids: string[]): string[][] =>
    ids.reduce<string[][]>((acc, id) => [...acc, ...acc.map((set) => [...set, id])], [[]]);

  for (const m of MACHINES) {
    const clean = JSON.stringify(allScenes(m));
    for (const fault of m.faults) {
      const others = m.faults.filter((f) => f.id !== fault.id).map((f) => f.id);
      let deadIn: string | null = null;
      for (const base of subsets(others)) {
        const without = JSON.stringify(allScenes(m, base));
        const withIt = JSON.stringify(allScenes(m, [...base, fault.id]));
        if (without === withIt) { deadIn = base.length ? `alongside ${base.join(" + ")}` : "on its own"; break; }
      }
      ck(`${m.id}/${fault.id} changes the machine in every combination`, deadIn === null, deadIn ?? "");
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


console.log("the step clock eases without ever leaving its bounds");
{
  ck("starts at rest", ease(0) === 0);
  ck("ends at rest", ease(1) === 1);
  ck("passes through the middle", Math.abs(ease(0.5) - 0.5) < 1e-9);
  ck("never leaves 0..1", [0, 0.1, 0.37, 0.5, 0.63, 0.9, 1].every((p) => ease(p) >= 0 && ease(p) <= 1));
  ck("is monotonic, so nothing ever travels backwards", (() => {
    let prev = -1;
    for (let i = 0; i <= 100; i++) { const v = ease(i / 100); if (v < prev) return false; prev = v; }
    return true;
  })());
  // The reason for easing at all: the middle is faster than the ends.
  ck("accelerates out and decelerates in", ease(0.55) - ease(0.45) > ease(0.1) - ease(0));
  ck("garbage clamps rather than propagating", ease(NaN) === 0 && ease(-5) === 0 && ease(9) === 1);
}


console.log("the unfinished machine is read from storage, and never half-read");
{
  const ok = toStorage("k8s", ["cordon-a"], 2);
  const found = readUnfinished(ok, MACHINES);
  ck("a valid record resolves", found?.machine.id === "k8s" && found.state.step === 2);

  // localStorage is on the reader's own device: stale, hand-editable, survives deploys. Every one
  // of these must render nothing rather than half a sentence about a machine that stopped existing.
  const rejected: [string, string | null][] = [
    ["nothing stored", null],
    ["empty string", ""],
    ["not json", "{oh no"],
    ["an array", "[1,2,3]"],
    ["a bare string", '"k8s"'],
    ["null literal", "null"],
    ["a machine that does not exist", toStorage("mars-lander", ["cordon-a"], 1)],
    ["a crafted id", toStorage("../../etc/passwd", ["cordon-a"], 1)],
    ["a fault that does not exist", toStorage("k8s", ["delete-the-cluster"], 1)],
    ["a step past the end", toStorage("k8s", ["cordon-a"], 99)],
    ["a negative step", toStorage("k8s", ["cordon-a"], -1)],
    ["a fractional step", toStorage("k8s", ["cordon-a"], 1.5)],
  ];
  for (const [name, raw] of rejected) ck(`rejected: ${name}`, readUnfinished(raw, MACHINES) === null);

  // Partial validity is rejected outright rather than repaired. A record naming one live fault and
  // one that was removed describes a state the reader never actually left it in.
  ck("one good fault and one dead one is rejected whole",
    readUnfinished(toStorage("k8s", ["cordon-a", "gone-in-a-deploy"], 1), MACHINES) === null);

  // Nothing broken is not something to come back to. This is the gate the whole feature rests on.
  ck("a machine at rest is not an open loop", readUnfinished(toStorage("k8s", [], 3), MACHINES) === null);
}

console.log("the strip states a fact about the machine, never about the person");
{
  const note = unfinishedNote(readUnfinished(toStorage("k8s", ["cordon-a", "no-capacity"], 2), MACHINES))!;
  ck("it names the machine", note.title === "Kubernetes", note.title);
  ck("it names both faults readably", /cordon node-a and node-b is full/.test(note.broken), note.broken);
  ck("it carries the plan topic for the recall bridge", note.topicIndex === 7);

  // The standing sentence is taken from the machine's own scene rather than written in the strip,
  // so what the card says and what the diagram shows cannot drift apart. It is the FIRST step whose
  // break is visible, not the step you happened to stop on - reading the stored step printed the
  // healthy caption for seven of the eight faults and told the reader a broken machine was fine.
  const k8s = machineById("k8s")!;
  const firstBreak = k8s.steps.map((_, i) => k8s.scene(i, 0.55, ["cordon-a", "no-capacity"])).find((sc) => sc.fault);
  ck("the standing line comes from the machine itself", note.standing === firstBreak!.fault, note.standing);
  ck("and it describes the break rather than healthy operation", note.standing !== k8s.scene(2, 0.55, []).caption);

  // The rules this product holds itself to. Every one of these has a refusal written down in the
  // codebase, and a returning-user prompt is exactly where they get quietly broken.
  const text = `${note.title} ${note.broken} ${note.standing}`;
  ck("no count of anything", !/\b\d+\s*(days?|cards?|questions?|sessions?)\b/i.test(text), text);
  ck("no streak language", !/streak|in a row|don't break|keep it up/i.test(text));
  ck("no reproach", !/you (left|haven't|failed|forgot|abandoned)|still not|overdue|behind/i.test(text), text);
  ck("no praise either", !/well done|great|nice work|congrat/i.test(text));

  ck("nothing found renders nothing", unfinishedNote(null) === null);
}

console.log("a single fault reads as a sentence, not a list of one");
{
  const one = unfinishedNote(readUnfinished(toStorage("tcp", ["drop-synack"], 1), MACHINES))!;
  ck("no stray joining word", !/ and /.test(one.broken), one.broken);
  ck("it is the fault's own label", one.broken === "drop the syn-ack", one.broken);
  ck("and it points at the networking topic", one.topicIndex === 2);
}


console.log("the strip is invisible until the browser says otherwise");
{
  // Rendered on the server it must produce nothing at all. The note comes out of localStorage,
  // which the server cannot see, so any markup here would be markup the client immediately
  // replaces - the hydration mismatch four files in this repo already carry a comment about.
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { createElement } = await import("react");
  const { Unfinished } = await import("../components/Unfinished.tsx");
  ck("nothing is rendered server-side", renderToStaticMarkup(createElement(Unfinished)) === "");
}


console.log("machines are reachable from the topic they explain");
{
  // machinesForTopic shipped with zero callers while the design spec claimed each machine is
  // "reachable from the topic you are studying rather than floating in its own world". Pinned here
  // so the claim cannot quietly become false again.
  const { readFileSync } = await import("node:fs");
  const provider = readFileSync("components/AppState.tsx", "utf8");
  ck("the syllabus panel calls machinesForTopic", /machinesForTopic\(/.test(provider));
  ck("and links to the specific machine, not the bare tab", /\/machines\?m=\$\{m\.id\}/.test(provider));

  // And the deep link it builds has to resolve on the other end.
  const runner = readFileSync("components/Machine.tsx", "utf8");
  ck("the machines page reads the m parameter", /URLSearchParams\(window\.location\.search\)\.get\("m"\)/.test(runner));
  ck("and validates it before using it", /machineById\(wanted\)/.test(runner));

  // Every machine must be reachable from at least one real topic, or it is unreachable content.
  for (const m of MACHINES) {
    ck(`${m.id} is reachable from a topic`, m.topicIndices.some((i) => machinesForTopic(i).some((x) => x.id === m.id)));
  }
}


console.log("dragging across the diagram lands where the finger is");
{
  // scrubTo maps a pointer x onto the whole sequence as one track, so the packet moves because the
  // finger is moving rather than because a button was pressed. Pure, so the mapping is assertable
  // without a pointer; the handler only turns an event into an x.
  ck("the left edge is the first frame", JSON.stringify(scrubTo(0, 600, 5)) === JSON.stringify({ step: 0, phase: 0 }));
  ck("the right edge is the last step, fully played", JSON.stringify(scrubTo(600, 600, 5)) === JSON.stringify({ step: 4, phase: 1 }));
  ck("halfway is the middle step", scrubTo(300, 600, 5).step === 2);
  ck("dragging past the edge clamps rather than running off", scrubTo(9999, 600, 5).step === 4 && scrubTo(-9999, 600, 5).step === 0);
  ck("a zero-width stage cannot divide by zero", JSON.stringify(scrubTo(10, 0, 5)) === JSON.stringify({ step: 0, phase: 0 }));
  ck("NaN cannot become a step", Number.isFinite(scrubTo(NaN, 600, 5).step));

  // Every x across the track must be reachable and in order.
  let last = -1, monotonic = true;
  for (let x = 0; x <= 600; x += 7) {
    const t = scrubTo(x, 600, 5); const abs = t.step + t.phase;
    if (abs < last - 1e-9) monotonic = false;
    last = abs;
  }
  ck("dragging right never moves the sequence backwards", monotonic);
}

console.log("dials are continuous inputs, and every one of them changes something");
{
  for (const m of MACHINES.filter((x) => x.dials?.length)) {
    for (const d of m.dials!) {
      // The dead-control rule again, for a control with no menu. A dial that renders identically
      // at both ends of its own range is a slider that does nothing.
      const low = JSON.stringify(m.steps.map((_, i) => m.scene(i, 0.5, [], { [d.id]: d.min })));
      const high = JSON.stringify(m.steps.map((_, i) => m.scene(i, 0.5, [], { [d.id]: d.max })));
      ck(`${m.id}/${d.id}: moving it changes the machine`, low !== high);
      ck(`${m.id}/${d.id}: has a sane range`, d.min < d.max && d.step > 0);
      ck(`${m.id}/${d.id}: rests inside its own range`, d.value >= d.min && d.value <= d.max);
      ck(`${m.id}/${d.id}: says what pulling it shows`, d.hint.length > 20);

      // Out of range must clamp, not escape: these come from a slider a user can hand-edit.
      ck(`${m.id}/${d.id}: clamps above`, dialValue(m, { [d.id]: d.max * 10 }, d.id) === d.max);
      ck(`${m.id}/${d.id}: clamps below`, dialValue(m, { [d.id]: d.min - 999 }, d.id) === d.min);
      ck(`${m.id}/${d.id}: NaN falls back to the resting value`, dialValue(m, { [d.id]: NaN }, d.id) === d.value);
    }
    // Omitting dials entirely must be identical to passing the defaults, or every assertion
    // written before dials existed is quietly testing a different machine.
    const defaults = Object.fromEntries(m.dials!.map((d) => [d.id, d.value]));
    ck(`${m.id}: no dials passed is the same as the resting values`,
      JSON.stringify(m.scene(1, 0.5, [])) === JSON.stringify(m.scene(1, 0.5, [], defaults)));
  }
}

console.log("the k8s threshold is arithmetic you can feel, not a rule you are told");
{
  const k = machineById("k8s")!;
  const noteAt = (request: number) => k.scene(1, 0.5, [], { request, free: 8 }).nodes.find((n) => n.id === "nodeB")!;
  ck("at 8Gi request against 8Gi free it still fits", !noteAt(8).dim, noteAt(8).note);
  ck("at 8.5Gi it does not", !!noteAt(8.5).dim, noteAt(8.5).note);
  ck("and the note shows both numbers rather than the word full", /8Gi free, asks 8.5Gi/.test(noteAt(8.5).note ?? ""));

  // Dragging the request up with the other node available must still schedule - the lesson is
  // "this node cannot take it", not "nothing can".
  ck("node-a still takes it", /readiness probe passes/i.test(k.scene(5, 0.5, [], { request: 12, free: 0 }).caption));
  ck("unless it is cordoned too", /Still Pending/.test(k.scene(5, 0.5, ["cordon-a"], { request: 12, free: 0 }).caption));
}

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
