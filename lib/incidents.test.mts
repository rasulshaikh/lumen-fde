/**
 * Incident tests. Run with:  npx tsx lib/incidents.test.mts
 *
 * The design constraint this suite enforces is the one that makes the whole thing honest: the sim
 * grades exactly one thing, whether the service came back, and it grades nothing else. So the
 * assertions are not about difficulty or fairness. They are about three properties:
 *
 * 1. **Exactly one fix resolves.** Two would make the outcome ambiguous; zero would make the
 *    incident unwinnable, and an unwinnable incident is a puzzle that hates you.
 * 2. **A wrong fix reports a real consequence.** This is what replaces marking. "Nothing happens"
 *    teaches nothing; "you deleted the only Running pod and the customer now has no version at
 *    all" teaches the thing the fix was chosen to teach. Every wrong fix is checked for substance.
 * 3. **No probe prints the answer.** The evidence is on screen and the diagnosis is not. If the
 *    root cause appeared in terminal output the exercise would be reading comprehension.
 *
 * And the usual guard for this repo: the plan rows and machine ids these point at must be real,
 * because an incident filed under the wrong topic teaches the right thing under the wrong heading
 * and nothing throws.
 */
import workbook from "../data/workbook.json" with { type: "json" };
import { INCIDENTS, incidentById, resolvingFix, probeById, fixById } from "./incidents/index.ts";
import { MACHINES } from "./machines/index.ts";

let fails = 0;
const ck = (n: string, c: boolean, x = "") => { if (!c) { fails++; console.log(`  FAIL ${n} ${x}`); } else console.log(`  ok   ${n} ${x}`); };
const plan = workbook.Plan as unknown[][];

console.log("incidents point at real topics and real systems");
{
  for (const i of INCIDENTS) {
    ck(`${i.id}: has a topic`, i.topicIndices.length > 0);
    for (const t of i.topicIndices) {
      ck(`${i.id}: topic ${t} is a real plan row`, !!String(plan[t + 1]?.[2] ?? ""), String(plan[t + 1]?.[2] ?? "").slice(0, 40));
    }
    // The machine is the way out for someone stuck. A dangling id would be a dead link at the
    // exact moment the learner is most likely to click it.
    if (i.machineId !== null) {
      ck(`${i.id}: machine "${i.machineId}" exists`, MACHINES.some((m) => m.id === i.machineId));
    }
  }
  ck("ids are unique", new Set(INCIDENTS.map((i) => i.id)).size === INCIDENTS.length);
  ck("incidentById finds one", incidentById("pending-pod")?.id === "pending-pod");
  ck("and refuses a crafted id", incidentById("../../etc/passwd") === null);
}

console.log("exactly one fix brings the service back");
{
  for (const i of INCIDENTS) {
    const resolving = i.fixes.filter((f) => f.resolves);
    ck(`${i.id}: exactly one resolving fix`, resolving.length === 1, `${resolving.length}`);
    ck(`${i.id}: resolvingFix returns it`, resolvingFix(i)?.id === resolving[0]?.id);
    ck(`${i.id}: there are wrong answers to choose from`, i.fixes.length >= 4, `${i.fixes.length} fixes`);
    ck(`${i.id}: fix ids are unique`, new Set(i.fixes.map((f) => f.id)).size === i.fixes.length);
    ck(`${i.id}: every fix has a command`, i.fixes.every((f) => f.cmd.length > 4));
  }
}

console.log("a wrong fix reports what actually changed");
{
  for (const i of INCIDENTS) {
    for (const f of i.fixes.filter((x) => !x.resolves)) {
      // Substance, not length for its own sake: an effect under this is almost always some
      // variation of "that did not work", which is marking with extra steps.
      ck(`${i.id}/${f.id}: says what changed`, f.effect.length > 80, `${f.effect.length} chars`);
      ck(`${i.id}/${f.id}: does not simply say it failed`, !/^(that )?(did ?n[o']?t work|wrong|incorrect|nope)/i.test(f.effect.trim()));
    }
    const right = resolvingFix(i)!;
    ck(`${i.id}: the working fix says what recovery looked like`, right.effect.length > 80);
    // No praise. The service coming back is the feedback; a "well done" on top of it is the thing
    // lib/companion/context.ts refuses in as many words.
    ck(`${i.id}: no congratulation`, !/well done|great job|nice work|congrat|correct!/i.test(right.effect), right.effect.slice(0, 60));
  }
}

console.log("the evidence is on screen and the diagnosis is not");
{
  for (const i of INCIDENTS) {
    const allOutput = i.probes.map((p) => p.output).join("\n").toLowerCase();
    // The cause is a synthesis of what the probes show. If it appeared verbatim the exercise would
    // be reading rather than diagnosing.
    ck(`${i.id}: no probe prints the cause verbatim`, !allOutput.includes(i.cause.slice(0, 60).toLowerCase()));
    // Nor does any probe name the fix that works.
    const right = resolvingFix(i)!;
    ck(`${i.id}: no probe names the working command`, !allOutput.includes(right.cmd.toLowerCase().slice(0, 24)));

    ck(`${i.id}: every probe returns something`, i.probes.every((p) => p.output.trim().length > 20));
    ck(`${i.id}: every probe says what it would tell you`, i.probes.every((p) => p.hint.length > 10));
    ck(`${i.id}: probe ids are unique`, new Set(i.probes.map((p) => p.id)).size === i.probes.length);
    // More than one, because a single decisive probe is a guessing game with one door.
    ck(`${i.id}: the evidence is spread across several commands`, i.probes.filter((p) => p.decisive).length >= 2,
      `${i.probes.filter((p) => p.decisive).length} decisive`);
    ck(`${i.id}: and not every probe is decisive`, i.probes.some((p) => !p.decisive));
  }
}

console.log("the ticket is what the customer said, not what is true");
{
  // Both incidents are built on a customer claim that is either wrong or beside the point, because
  // that is what a real one looks like. Asserting it keeps a future incident from being written as
  // a tidy problem statement with the answer in it.
  const pod = incidentById("pending-pod")!;
  ck("the pod ticket blames the deploy", /rollback did not help|deployed/i.test(pod.ticket));
  ck("and the cause is not the deploy failing", /cordoned/i.test(pod.cause));

  const rag = incidentById("vague-rag")!;
  ck("the rag ticket says nothing changed", /have not changed anything/i.test(rag.ticket));
  ck("and they are right, which the probes confirm", rag.probes.some((p) => /no commits/i.test(p.output)));
  ck("while something did change underneath them", /provider|version roll/i.test(rag.cause));
}

console.log("lookups refuse bad input rather than throwing");
{
  const i = INCIDENTS[0];
  ck("probeById finds a real probe", probeById(i, i.probes[0].id)?.id === i.probes[0].id);
  ck("probeById returns null for a made-up id", probeById(i, "no-such-probe") === null);
  ck("fixById finds a real fix", fixById(i, i.fixes[0].id)?.id === i.fixes[0].id);
  ck("fixById returns null for a made-up id", fixById(i, "no-such-fix") === null);
}


console.log("the numbers a probe prints agree with the numbers the next probe prints");
{
  // A terminal that contradicts itself teaches the reader to distrust the exercise rather than the
  // system. The retrieval probe lists individual scores; the scores probe reports min and max over
  // the same query, so one must bracket the other.
  const rag = incidentById("vague-rag")!;
  const listed = [...(probeById(rag, "retrieval")?.output ?? "").matchAll(/"score":([\d.]+)/g)].map((m) => Number(m[1]));
  const range = (probeById(rag, "scores")?.output ?? "").match(/"min":([\d.]+),"max":([\d.]+)/);
  ck("the retrieval probe lists scores", listed.length >= 3, `${listed.length}`);
  ck("the scores probe reports a range", !!range);
  const [min, max] = [Number(range![1]), Number(range![2])];
  ck("every listed score sits inside the reported range", listed.every((v) => v >= min && v <= max),
    `listed ${listed.join(",")} vs ${min}-${max}`);

  // Cross-space cosine is near zero, not near 0.7. Vectors from two unrelated embedding spaces are
  // effectively random with respect to each other, and the collapsed MAGNITUDE is half the
  // diagnostic - merely poor documents would keep the magnitude and lose only the spread.
  ck("the scores are near zero, as unrelated spaces actually produce", max < 0.2, `max ${max}`);
  ck("and the output explains that magnitude and spread are two separate signals",
    /magnitude collapsed/.test(probeById(rag, "scores")?.output ?? ""));
}

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
